"""Repeatable browser checks. Requires Python Playwright and Chromium.
Run: python tests/browser.py
No server, external service or production data is used.
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

def check(name):
    checks.append(name)
    print('PASS', name, flush=True)

def setup(browser, seed=None, **options):
    context = browser.new_context(**options)
    def route(request):
        path = urlparse(request.request.url).path.lstrip('/') or 'index.html'
        file = ROOT / path
        if file.is_file() and file.parent == ROOT:
            request.fulfill(body=file.read_bytes(), content_type=mimetypes.guess_type(str(file))[0] or 'text/plain')
        else:
            request.fulfill(status=404, body='Not found')
    context.route('https://bhu.test/**', route)
    if seed is not None:
        context.add_init_script(f"if (!localStorage.getItem('__seeded')) {{ localStorage.setItem({json.dumps(KEY)}, {json.dumps(json.dumps(seed))}); localStorage.setItem('__seeded', 'yes'); }}")
    page = context.new_page()
    page.on('dialog', lambda dialog: dialog.accept())
    page.goto('https://bhu.test/')
    return context, page

def data(page):
    return page.evaluate(f"JSON.parse(localStorage.getItem('{KEY}'))")

def create_account(page, name, parent=None):
    if parent:
        page.locator(f'[data-drag-id="{parent}"] [data-action="add-account"]').click()
    else:
        page.locator('header [data-action="add-account"]').click()
    page.locator('#account-name').fill(name)
    page.locator('#account-form button[type="submit"]').click()
    expect(page.locator('.modal')).to_have_count(0)
    return next(k['id'] for k in data(page)['kasalar'] if k['name'] == name)

def select(page, account):
    page.locator('[data-tab="network"]').click()
    page.locator(f'.tree-node [data-select-account="{account}"]').click()
    page.wait_for_function('() => !saving')

def calculate(page, keys):
    page.locator('[data-action="open-calculator"]').click()
    for key in keys:
        page.locator(f'[data-calc="{key}"]').click()
    page.locator('[data-action="use-calculator"]').click()

with sync_playwright() as p:
    executable = os.environ.get('BROWSER_EXECUTABLE') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)
    browser = p.chromium.launch(executable_path=executable, headless=True, args=['--no-sandbox'])
    (ROOT / 'test-artifacts').mkdir(exist_ok=True)
    context, page = setup(browser, viewport={'width': 1280, 'height': 900}, timezone_id='Europe/Istanbul')
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    root = create_account(page, 'Ana Kasa')
    child = create_account(page, 'Şube', root)
    other = create_account(page, 'Banka')
    check('create accounts and preserve hierarchy')

    select(page, root)
    page.locator('[data-tab="add"]').click()
    page.locator('#form-amount').fill('1,20')
    page.locator('#form-customer').fill('İpek')
    page.locator('#form-description').fill('İlk tahsilat')
    page.locator('#form-date').fill('2026-11-15')
    calculate(page, ['2', '+', '3', '='])
    expect(page.locator('#form-amount')).to_have_value('5,00')
    expect(page.locator('#form-customer')).to_have_value('İpek')
    expect(page.locator('#form-description')).to_have_value('İlk tahsilat')
    expect(page.locator('#form-date')).to_have_value('2026-11-15')
    page.locator('[data-tab="stats"]').click()
    page.locator('[data-tab="add"]').click()
    expect(page.locator('#form-description')).to_have_value('İlk tahsilat')
    page.locator('[data-form-type="expense"]').click()
    expect(page.locator('#form-customer')).to_have_value('İpek')
    page.locator('[data-form-type="income"]').click()
    page.locator('details summary').click()
    page.locator('#file-input').set_input_files({'name': 'makbuz.txt', 'mimeType': 'text/plain', 'buffer': b'abc'})
    expect(page.locator('#form-attachments .attachment')).to_have_count(1)
    page.locator('button[name="saveAnother"]').click()
    expect(page.locator('#form-amount')).to_have_value('')
    expect(page.locator('#form-date')).to_have_value('2026-11-15')
    assert data(page)['transactions'][0]['amountCents'] == 500
    first = data(page)['transactions'][0]['id']
    check('calculator, type toggle, navigation and save-and-continue preserve draft fields')

    page.locator('#form-amount').fill('0,20')
    page.locator('#form-account').select_option(child)
    page.locator('[data-form-type="expense"]').click()
    page.locator('#transaction-form button[type="submit"]').first.click()
    expect(page.locator('#transaction-form')).to_have_count(0)
    select(page, root)
    page.locator('[data-tab="list"]').click()
    expect(page.locator('.summary-card.balance .summary-value')).to_contain_text('4,80')
    page.locator(f'[data-tx-id="{first}"]').click()
    page.locator('[data-action="edit-transaction"]').click()
    page.locator('#form-description').fill('Güncellenen tahsilat')
    calculate(page, ['7', '='])
    page.locator('[data-remove-attachment]').click()
    page.locator('#transaction-form button[type="submit"]').click()
    expect(page.locator('#transaction-form')).to_have_count(0)
    updated = next(t for t in data(page)['transactions'] if t['id'] == first)
    assert updated['amountCents'] == 700 and not updated['attachments'] and updated['description'] == 'Güncellenen tahsilat'
    check('edit transaction keeps new calculator value and document removals')

    page.locator('[data-action="toggle-filters"]').click()
    page.locator('#min-amount').fill('8')
    expect(page.locator('.tx-row[data-tx-id]')).to_have_count(0)
    expect(page.locator('.summary-card.income .summary-value')).to_contain_text('0,00')
    page.locator('#min-amount').fill('0')
    expect(page.locator('.tx-row[data-tx-id]')).to_have_count(2)
    page.locator('#search-input').fill('ipek')
    expect(page.locator('.tx-row[data-tx-id]')).to_have_count(1)
    page.locator('#start-date').fill('2026-11-16')
    expect(page.locator('.tx-row[data-tx-id]')).to_have_count(0)
    page.locator('[data-action="clear-filters"]').click()
    check('all filters update list and totals immediately, including zero minimum')

    page.locator(f'[data-tx-id="{first}"]').click()
    page.locator('[data-action="move-transaction"]').click()
    page.locator('#move-target').select_option(child)
    page.locator('#move-form button[type="submit"]').click()
    expect(page.locator('.modal')).to_have_count(0)
    assert len(data(page)['transactions']) == 2
    assert next(t for t in data(page)['transactions'] if t['id'] == first)['kasaId'] == child
    check('move changes account only and creates no extra financial entries')

    page.locator('[data-tab="network"]').click()
    page.locator(f'[data-drag-id="{child}"] [data-action="edit-account"]').click()
    page.locator('#account-included').uncheck()
    page.locator('#account-form button[type="submit"]').click()
    expect(page.locator(f'[data-drag-id="{root}"] small')).to_contain_text('0,00')
    page.locator(f'[data-drag-id="{child}"] [data-action="edit-account"]').click()
    assert page.locator(f'#account-parent option[value="{child}"]').count() == 0
    page.locator('#account-included').check()
    page.locator('#account-form button[type="submit"]').click()
    expect(page.locator('.modal')).to_have_count(0)
    source = page.locator(f'[data-drag-id="{other}"] [data-drag-handle]').bounding_box()
    target = page.locator(f'[data-drag-id="{root}"]').bounding_box()
    page.mouse.move(source['x'] + source['width']/2, source['y'] + source['height']/2)
    page.mouse.down()
    page.mouse.move(target['x'] + target['width']/2, target['y'] + target['height']/2, steps=15)
    page.mouse.up()
    expect(page.locator('#toast')).to_contain_text('hiyerarşisi')
    assert next(k for k in data(page)['kasalar'] if k['id'] == other)['parentId'] == root
    check('include/exclude totals, cycle-safe editor and pointer reparenting')

    page.locator('[data-tab="add"]').click()
    page.locator('#form-amount').fill('12,34')
    page.locator('#form-description').fill('Kota testi')
    before = data(page)
    page.evaluate("() => { window.originalSet = Storage.prototype.setItem; Storage.prototype.setItem = function(k,v) { if(k === 'kasa-pro-data-v1') throw new DOMException('quota','QuotaExceededError'); return window.originalSet.call(this,k,v); }; }")
    page.locator('#transaction-form button[type="submit"]').first.click()
    expect(page.locator('#form-error')).to_contain_text('kaydedilmedi')
    expect(page.locator('#form-description')).to_have_value('Kota testi')
    assert data(page) == before
    page.evaluate('() => { Storage.prototype.setItem = window.originalSet; }')
    page.locator('#transaction-form button[type="submit"]').first.click()
    expect(page.locator('#transaction-form')).to_have_count(0)
    assert len(data(page)['transactions']) == 3
    check('quota failure preserves saved data and draft; retry saves exactly once')

    page.locator('[data-tab="add"]').click()
    page.locator('#form-amount').fill('9,99')
    page.locator('#form-description').fill('Açık taslak')
    second = context.new_page()
    second.on('dialog', lambda dialog: dialog.accept())
    second.goto('https://bhu.test/')
    create_account(second, 'Diğer sekme')
    expect(page.locator('#sync-banner')).to_be_visible()
    page.locator('#transaction-form button[type="submit"]').first.click()
    expect(page.locator('#form-error')).to_contain_text('başka bir sekmede')
    assert len(data(page)['transactions']) == 3
    page.locator('[data-action="reload-data"]').click()
    expect(page.locator('#form-description')).to_have_value('Açık taslak')
    page.locator('#transaction-form button[type="submit"]').first.click()
    expect(page.locator('#transaction-form')).to_have_count(0)
    assert len(data(page)['transactions']) == 4
    second.close()
    check('stale tab cannot overwrite data; explicit refresh preserves unsaved draft')

    page.locator('[data-action="open-settings"]').click()
    invalid = {'version': 1, 'kasalar': [{'id':'a','name':'A','parentId':'b'}, {'id':'b','name':'B','parentId':'a'}], 'transactions': []}
    before = data(page)
    page.locator('#import-input').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':json.dumps(invalid).encode()})
    expect(page.locator('#settings-error')).to_contain_text('döngü')
    assert data(page) == before
    backup = json.dumps(before).encode()
    page.locator('#import-input').set_input_files({'name':'valid.json','mimeType':'application/json','buffer':backup})
    expect(page.locator('[data-action="confirm-import"]')).to_be_disabled()
    with page.expect_download() as download:
        page.locator('[data-action="backup-before-import"]').click()
    assert download.value.suggested_filename.endswith('.json')
    expect(page.locator('[data-action="confirm-import"]')).to_be_enabled()
    page.locator('[data-action="confirm-import"]').click()
    expect(page.locator('.modal')).to_have_count(0)
    assert len(data(page)['transactions']) == 4
    check('invalid import leaves data intact; valid import requires pre-import backup')

    page.locator('[data-tab="add"]').click()
    page.locator('#form-customer').fill('<img src=x onerror=alert(1)>')
    page.locator('#form-amount').fill('1')
    page.locator('#transaction-form button[type="submit"]').first.click()
    expect(page.locator('.tx-title').filter(has_text='<img src=x')).to_have_count(1)
    assert page.locator('.tx-title img').count() == 0
    page.locator('[data-action="open-settings"]').click()
    page.keyboard.press('Tab')
    assert page.evaluate("Boolean(document.activeElement.closest('.modal'))")
    page.keyboard.press('Escape')
    expect(page.locator('.modal')).to_have_count(0)
    assert page.evaluate("document.activeElement.matches('[data-action=\"open-settings\"]')")
    assert not errors, errors
    check('untrusted text renders safely; modal focus and Escape return to trigger')
    page.locator('[data-tab="add"]').click()
    page.evaluate('window.scrollTo(0,0)')
    page.screenshot(path=str(ROOT / 'test-artifacts' / 'preview-desktop.png'), full_page=True)

    # A phone viewport uses the same state and event handlers.
    phone, mobile = setup(browser, seed=data(page), viewport={'width': 375, 'height': 812}, is_mobile=True, has_touch=True)
    mobile.locator('[data-tab="add"]').tap()
    mobile.locator('#form-amount').fill('10,50')
    mobile.locator('#form-description').fill('Mobil kayıt')
    assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
    mobile.evaluate('window.scrollTo(0,0)')
    mobile.screenshot(path=str(ROOT / 'test-artifacts' / 'preview-mobile.png'), full_page=True)
    mobile.locator('#transaction-form button[type="submit"]').first.tap()
    expect(mobile.locator('#transaction-form')).to_have_count(0)
    assert data(mobile)['transactions'][-1]['amountCents'] == 1050
    mobile.set_viewport_size({'width':320,'height':700})
    mobile.locator('[data-tab="add"]').tap()
    assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
    check('375px touch form flow and 320px layout fit without page overflow')
    phone.close()

    old = {'kasalar':[{'id':'old','name':'Eski Kasa'}], 'transactions':[{'id':'oldtx','kasaId':'old','type':'income','amount':1.235,'date':'2026-11-15','customerName':'Eski cari'}]}
    legacy_context, oldpage = setup(browser, seed=old)
    assert oldpage.locator('[data-drag-id="old"]').count() == 1
    assert oldpage.evaluate(f"JSON.parse(localStorage.getItem('{KEY}')).transactions[0].amount") == 1.235
    select(oldpage, 'old')
    assert data(oldpage)['version'] == 2 and data(oldpage)['transactions'][0]['amountCents'] == 124
    assert oldpage.evaluate("Boolean(localStorage.getItem('kasa-pro-recovery-v1'))")
    check('legacy storage migrates on first successful write and keeps original snapshot')
    legacy_context.close()
    # Corrupt local data must stay intact until an explicit validated replacement.
    corrupt = {'version':2, 'kasalar':[{'id':'broken','name':'Bozuk','parentId':'missing','createdAt':'2026-11-15'}], 'transactions':[]}
    broken_context, broken = setup(browser, seed=corrupt)
    expect(broken.locator('#notice')).to_contain_text('Mevcut veriler açılamadı')
    broken.locator('header [data-action="add-account"]').click()
    broken.locator('#account-name').fill('Üzerine yazma')
    broken.locator('#account-form button[type="submit"]').click()
    expect(broken.locator('#account-error')).to_contain_text('korumaya alındı')
    assert data(broken) == corrupt
    broken.keyboard.press('Escape')
    broken.locator('[data-action="open-settings"]').click()
    broken.locator('#import-input').set_input_files({'name':'recovery.json','mimeType':'application/json','buffer':json.dumps(before).encode()})
    with broken.expect_download():
        broken.locator('[data-action="backup-before-import"]').click()
    broken.locator('[data-action="confirm-import"]').click()
    expect(broken.locator('.modal')).to_have_count(0)
    assert len(data(broken)['kasalar']) == len(before['kasalar'])
    check('corrupt stored data cannot be overwritten accidentally; validated recovery works')
    broken_context.close()

    # Editing an outdated transaction must not overwrite its newer contents after refresh.
    edit_context, editor = setup(browser, seed=before)
    editor.locator('[data-tab="list"]').click()
    editable = before['transactions'][0]
    editor.locator(f'[data-tx-id="{editable["id"]}"]').click()
    editor.locator('[data-action="edit-transaction"]').click()
    editor.locator('#form-description').fill('Eski düzenleme')
    editor.evaluate('''() => { const v=JSON.parse(localStorage.getItem('kasa-pro-data-v1')); v.transactions[0].description='Yeni kayıt';v.revision='newer';localStorage.setItem('kasa-pro-data-v1',JSON.stringify(v)); }''')
    editor.locator('#transaction-form button[type="submit"]').click()
    expect(editor.locator('#form-error')).to_contain_text('başka bir sekmede')
    editor.locator('[data-action="reload-data"]').click()
    editor.locator('#transaction-form button[type="submit"]').click()
    expect(editor.locator('#form-error')).to_contain_text('başka bir yerde değişti')
    assert data(editor)['transactions'][0]['description'] == 'Yeni kayıt'
    check('refreshed data still rejects stale edits to a changed transaction')
    edit_context.close()
    context.close()
    browser.close()
    print(f'Completed {len(checks)} browser scenarios.', flush=True)
