"""Native-boundary UI checks using a mocked Capacitor bridge.
These verify JavaScript integration, not real StoreKit purchases or iOS file protection.
"""
import json
import mimetypes
import os
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
KEY = 'kasa-pro-data-v1'
checks = []

def passed(name):
    checks.append(name)
    print('PASS', name, flush=True)

def seed(accounts=None):
    accounts = [('a', 'Merkez', None)] if accounts is None else accounts
    return {'version': 2, 'kasalar': [{'id': id, 'name': name, 'parentId': parent, 'includeInParentTotals': True, 'createdAt': '2026-11-15T12:00:00.000Z'} for id, name, parent in accounts], 'transactions': [], 'activeKasaId': accounts[0][0] if accounts else None, 'revision': None}

BRIDGE = r'''(initial) => {
  const stored = localStorage.getItem('__native_mock_state');
  const state = stored ? JSON.parse(stored) : initial;
  window.__nativeState = state;
  const listeners = new Map();
  const persist = () => localStorage.setItem('__native_mock_state', JSON.stringify(state));
  window.__persistNativeMock = persist;
  window.__setNativePro = value => { state.pro = value; persist(); for (const callback of listeners.get('entitlementChanged') || []) callback({isPro:value}); };
  const status = () => ({isPro:state.pro, productId:'test.multiple_accounts', productAvailable:true, price:'₺99,99'});
  const fail = (message, code) => Object.assign(new Error(message), {code});
  const plugins = {
    KasaStorage: {
      async read(){ state.reads++; if(state.readError) throw fail('Native file unavailable','STORAGE_READ_FAILED'); return {raw:state.raw}; },
      async write(args){
        state.writeAttempts++;
        if(state.writeError) throw fail('Native disk full','STORAGE_WRITE_FAILED');
        if(args.expectedRaw !== state.raw) throw fail('Snapshot changed','STORAGE_CONFLICT');
        state.raw=args.raw; state.writes++; persist(); return {raw:state.raw};
      }
    },
    KasaDocuments: {
      async exportBackup(args){state.exports.push(args);persist();return {status:state.exportStatus};},
      async importBackup(){return state.importData===null?{status:'cancelled'}:{status:'selected',data:state.importData,fileName:'import.json'};},
      async exportFile(args){state.attachments.push(args);persist();return {status:state.exportStatus};},
      async printReport(args){state.prints.push(args);persist();return {status:'printed'};}
    },
    KasaPurchases: {
      async getStatus(){state.statusCalls++;if(state.statusError)throw fail('App Store unavailable','STORE_UNAVAILABLE');return status();},
      async purchase(){state.purchaseCalls++;if(state.purchaseMode==='cancelled')return {...status(),isPro:false,cancelled:true};if(state.purchaseMode==='pending')return {...status(),isPro:false,pending:true};state.pro=true;persist();return status();},
      async restore(){state.restoreCalls++;state.pro=state.restorePro;persist();return status();},
      async addListener(name,callback){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(callback);return {remove(){listeners.set(name,listeners.get(name).filter(item=>item!==callback));}}}
    }
  };
  window.Capacitor={isNativePlatform:()=>true,getPlatform:()=> 'ios',isPluginAvailable:name=>name in plugins,registerPlugin:name=>plugins[name]};
  if(initial.webRaw!==null && !localStorage.getItem('__legacy_web_initialized')){localStorage.setItem('kasa-pro-data-v1',initial.webRaw);localStorage.setItem('__legacy_web_initialized','yes');}
  persist();
}'''

def setup_native(browser, value=None, *, raw=None, web_raw=None, pro=False, read_error=False, status_error=False):
    initial = {'raw': raw if raw is not None else json.dumps(seed() if value is None else value), 'webRaw': web_raw, 'pro': pro, 'reads': 0, 'writes': 0, 'writeAttempts': 0, 'readError': read_error, 'writeError': False, 'statusError': status_error, 'statusCalls': 0, 'purchaseCalls': 0, 'restoreCalls': 0, 'purchaseMode': 'success', 'restorePro': False, 'importData': None, 'exportStatus': 'shared', 'exports': [], 'attachments': [], 'prints': []}
    context = browser.new_context(viewport={'width': 1280, 'height': 1000}, locale='tr-TR')
    def route(request):
        name = urlparse(request.request.url).path.lstrip('/') or 'index.html'
        file = ROOT / name
        if file.is_file() and file.parent == ROOT:
            request.fulfill(body=file.read_bytes(), content_type=mimetypes.guess_type(str(file))[0] or 'text/plain')
        else:
            request.fulfill(status=404, body='Not found')
    context.route('https://bhu.test/**', route)
    context.add_init_script(f'({BRIDGE})({json.dumps(initial)})')
    page = context.new_page()
    page.on('dialog', lambda dialog: dialog.accept())
    page.goto('https://bhu.test/')
    expect(page.locator('.network-panel')).to_be_visible()
    return context, page

def data(page):
    return page.evaluate('JSON.parse(window.__nativeState.raw)')

def root_count(page):
    return sum(account['parentId'] is None for account in data(page)['kasalar'])

def settled(page):
    page.wait_for_function('() => !saving')

def start_account(page, name, parent=None):
    if parent:
        page.locator(f'[data-drag-id="{parent}"] [data-action="add-account"]').click()
    else:
        page.locator('header [data-action="add-account"]').click()
    page.locator('#account-name').fill(name)

def save_account(page):
    page.locator('#account-form button[type="submit"]').click()
    settled(page)

def create_account(page, name, parent=None):
    start_account(page, name, parent)
    save_account(page)
    expect(page.locator('.modal')).to_have_count(0)
    return next(account['id'] for account in data(page)['kasalar'] if account['name'] == name)

def expect_paywall(page, available=True):
    expect(page.locator('#modal-title')).to_contain_text('Çoklu Hesap')
    button = page.locator('[data-action="purchase-multi-account"]')
    expect(button).to_be_visible()
    if available:
        expect(button).to_contain_text('₺99,99')
        expect(button).to_be_enabled()
    else:
        expect(button).to_be_disabled()

def close_modal(page):
    page.locator('.modal-head [data-action="close-modal"]').click()

if __name__ == '__main__':
    with sync_playwright() as p:
        executable = os.environ.get('BROWSER_EXECUTABLE') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)
        browser = p.chromium.launch(executable_path=executable, headless=True, args=['--no-sandbox'])
        context, page = setup_native(browser)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        child = create_account(page, 'Ücretsiz alt hesap', 'a')
        grandchild = create_account(page, 'Ücretsiz torun hesap', child)
        second_child = create_account(page, 'Diğer alt hesap', 'a')
        assert root_count(page) == 1 and len(data(page)['kasalar']) == 4
        assert page.evaluate(f'localStorage.getItem({json.dumps(KEY)})') is None
        passed('native writes preserve the free root with child accounts and do not use web storage')

        before = data(page)
        page.locator(f'[data-drag-id="{child}"] [data-drag-handle]').click()
        page.locator('[data-drag-root]').click()
        expect_paywall(page)
        assert data(page) == before
        close_modal(page)
        expect(page.locator('.modal')).to_have_count(0)
        page.locator(f'[data-drag-id="{child}"] [data-action="edit-account"]').click()
        page.locator('#account-parent').select_option('')
        save_account(page)
        expect_paywall(page)
        assert data(page) == before
        close_modal(page)
        expect(page.locator('#account-parent')).to_have_value('')
        close_modal(page)
        page.locator('[data-drag-id="a"] [data-action="delete-account"]').click()
        expect_paywall(page)
        assert data(page) == before
        close_modal(page)
        passed('dragging, editing and deleting a root cannot promote extra free roots')

        start_account(page, 'Banka')
        save_account(page)
        expect_paywall(page)
        assert data(page) == before
        page.evaluate("window.__nativeState.purchaseMode='pending'")
        page.locator('[data-action="purchase-multi-account"]').click()
        expect(page.locator('#purchase-status')).to_contain_text('onayı bekliyor')
        assert root_count(page) == 1 and data(page) == before
        page.evaluate("window.__nativeState.purchaseMode='cancelled'")
        page.locator('[data-action="purchase-multi-account"]').click()
        page.wait_for_function('() => window.__nativeState.purchaseCalls === 2')
        expect_paywall(page)
        assert root_count(page) == 1
        close_modal(page)
        expect(page.locator('#account-name')).to_have_value('Banka')
        save_account(page)
        expect_paywall(page)
        page.evaluate("window.__nativeState.purchaseMode='success'")
        page.locator('[data-action="purchase-multi-account"]').click()
        expect(page.locator('#account-name')).to_have_value('Banka')
        save_account(page)
        expect(page.locator('.modal')).to_have_count(0)
        assert root_count(page) == 2 and len(data(page)['kasalar']) == 5
        passed('pending/cancelled purchases keep the form intact; verified purchase enables the second root')

        page.evaluate('window.__setNativePro(false)')
        page.locator('[data-tab="add"]').click()
        page.locator('#form-amount').fill('25,50')
        page.locator('#form-description').fill('Satın alma sonrası veri erişimi')
        if page.locator('.autocomplete-popup').count():
            page.locator('.autocomplete-close').click()
        page.locator('#transaction-form button[type="submit"]').first.click()
        expect(page.locator('#transaction-form')).to_have_count(0)
        assert len(data(page)['transactions']) == 1
        page.locator('[data-action="open-settings"]').click()
        page.locator('[data-action="export-data"]').click()
        page.wait_for_function('() => window.__nativeState.exports.length === 1')
        exported = page.evaluate('window.__nativeState.exports[0]')
        assert len(json.loads(exported['data'])['kasalar']) == 5
        assert exported['fileName'].endswith('.json')
        close_modal(page)
        start_account(page, 'Üçüncü ana hesap')
        save_account(page)
        expect_paywall(page)
        assert root_count(page) == 2
        close_modal(page)
        close_modal(page)
        passed('revoked entitlement preserves existing data editing/export and blocks further root expansion')

        page.locator('[data-tab="add"]').click()
        page.locator('#form-amount').fill('7,50')
        page.locator('#form-description').fill('Başarısız yerel kayıt')
        if page.locator('.autocomplete-popup').count():
            page.locator('.autocomplete-close').click()
        before = data(page)
        page.evaluate('window.__nativeState.writeError=true')
        page.locator('#transaction-form button[type="submit"]').first.click()
        expect(page.locator('#form-error')).not_to_be_empty()
        expect(page.locator('#form-description')).to_have_value('Başarısız yerel kayıt')
        assert data(page) == before
        page.evaluate('window.__nativeState.writeError=false')
        page.locator('#transaction-form button[type="submit"]').first.click()
        expect(page.locator('#transaction-form')).to_have_count(0)
        assert len(data(page)['transactions']) == 2
        page.reload()
        expect(page.locator('.network-panel')).to_be_visible()
        assert len(data(page)['transactions']) == 2
        assert not errors, errors
        passed('native write failure preserves draft and saved records; retry and reload retain exactly one new entry')
        context.close()

        restore_context, restore = setup_native(browser)
        imported = seed([('imported_a', 'İçe aktarılan A', None), ('imported_b', 'İçe aktarılan B', None)])
        restore.evaluate('(text) => { window.__nativeState.importData=text; window.__nativeState.exportStatus="cancelled"; }', json.dumps(imported))
        restore.locator('[data-action="open-settings"]').click()
        restore.locator('[data-action="native-import"]').click()
        expect(restore.locator('[data-action="confirm-import"]')).to_be_disabled()
        restore.locator('[data-action="backup-before-import"]').click()
        expect(restore.locator('[data-action="confirm-import"]')).to_be_disabled()
        restore.evaluate('window.__nativeState.exportStatus="shared"')
        restore.locator('[data-action="backup-before-import"]').click()
        expect(restore.locator('[data-action="confirm-import"]')).to_be_enabled()
        restore.locator('[data-action="confirm-import"]').click()
        expect_paywall(restore)
        assert root_count(restore) == 1
        restore.evaluate('window.__nativeState.restorePro=true')
        restore.locator('[data-action="restore-purchases"]').click()
        expect(restore.locator('[data-action="confirm-import"]')).to_be_enabled()
        restore.locator('[data-action="confirm-import"]').click()
        expect(restore.locator('.modal')).to_have_count(0)
        assert root_count(restore) == 2
        passed('native import requires completed backup sharing and verified multi-root restore entitlement')
        restore_context.close()

        broken_context, broken = setup_native(browser, raw='{broken', web_raw=json.dumps(seed([('web', 'Web kaydı', None)])))
        expect(broken.locator('#notice')).not_to_be_empty()
        start_account(broken, 'Üzerine yazma')
        save_account(broken)
        expect(broken.locator('#account-error')).not_to_be_empty()
        assert broken.evaluate('window.__nativeState.raw') == '{broken'
        assert broken.evaluate(f'JSON.parse(localStorage.getItem({json.dumps(KEY)})).kasalar[0].id') == 'web'
        assert broken.evaluate('window.__nativeState.writes') == 0
        passed('corrupt native data is protected instead of falling back to a stale web copy')
        broken_context.close()

        unavailable_context, unavailable = setup_native(browser, status_error=True)
        create_account(unavailable, 'Mağaza çevrimdışı alt hesap', 'a')
        assert root_count(unavailable) == 1
        start_account(unavailable, 'Çevrimdışı ikinci ana hesap')
        save_account(unavailable)
        expect_paywall(unavailable, available=False)
        assert root_count(unavailable) == 1
        passed('App Store status failure does not block free data use and never grants an unverified expansion')
        unavailable_context.close()
        browser.close()
        print(f'Completed {len(checks)} mocked-native integration scenarios.', flush=True)
