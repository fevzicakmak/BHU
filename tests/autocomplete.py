"""Completion regressions for free text, dependent suggestions and account selectors."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from browser import setup, data, ROOT
from drag import touch_drag

checks=[]
def passed(name):
    checks.append(name);print('PASS',name,flush=True)
def transaction(id, account='a', kind='income', customer='İpek Çağrı', description='Müşteri tahsilatı', day='15'):
    return {'id':id,'kasaId':account,'type':kind,'amountCents':1000,'customerName':customer,'description':description,'date':f'2026-11-{day}','createdAt':f'2026-11-{day}T12:00:00.000Z','attachments':[]}
def make_seed():
    accounts=[('a','Merkez',None),('b','Alt Şube','a'),('c','Diğer Kasa',None)]
    return {'version':2,'kasalar':[{'id':id,'name':name,'parentId':parent,'includeInParentTotals':True,'createdAt':'2026-11-15T12:00:00.000Z'} for id,name,parent in accounts], 'activeKasaId':'a','transactions':[
        transaction('t1'),transaction('t2',customer=' İPEK   ÇAĞRI ',day='14'),transaction('t3',kind='expense',description='Kargo ücreti'),
        transaction('t4',account='b',customer='Alt Cari',description='Şube ödemesi'),transaction('t5',account='c',customer='Başka Cari',description='Başka hesap açıklaması'),
        transaction('t6',customer='Zeynep',description='Özel hizmet'),transaction('t7',customer='<img src=x onerror=window.injected=1>',description='Güvenli kayıt'),
        *[transaction(f'extra{i}',customer=f'Yeni Cari {i:02}',description=f'Diğer işlem {i:02}') for i in range(45)] ]}
def options(page):
    return page.locator('.autocomplete-popup [role="option"]')
def pick(page,text):
    options(page).filter(has=page.locator('.autocomplete-value',has_text=text)).first.click()
def close(page):
    if page.locator('.autocomplete-popup').count(): page.locator('.autocomplete-close').click()

if __name__=='__main__':
    with sync_playwright() as p:
        executable=os.environ.get('BROWSER_EXECUTABLE') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)
        browser=p.chromium.launch(executable_path=executable,headless=True,args=['--no-sandbox'])
        context,page=setup(browser,seed=make_seed(),viewport={'width':1280,'height':1000})
        errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
        page.locator('[data-tab="add"]').click()
        count=len(data(page)['transactions'])
        customer=page.locator('#form-customer')
        customer.fill('ipek cagri')
        expect(customer).to_have_attribute('role','combobox')
        expect(customer).to_have_attribute('aria-expanded','true')
        expect(options(page)).to_have_count(1)
        expect(options(page).first).to_contain_text('3 kayıtta')
        assert customer.get_attribute('list') is None
        page.keyboard.press('ArrowDown');page.keyboard.press('Enter')
        expect(customer).to_have_value('İpek Çağrı')
        assert page.evaluate('draft.customerName')=='İpek Çağrı'
        assert len(data(page)['transactions'])==count
        passed('Turkish matching, deduplication and keyboard selection update the draft without submitting')

        page.locator('#form-description').focus()
        expect(options(page).first).to_contain_text('Müşteri tahsilatı')
        expect(options(page).first).to_contain_text('Bu cari')
        assert not options(page).filter(has_text='Kargo ücreti').count()
        close(page)
        page.locator('[data-form-type="expense"]').click()
        page.locator('#form-description').fill('kargo')
        expect(options(page)).to_have_count(1)
        pick(page,'Kargo ücreti')
        expect(page.locator('#form-description')).to_have_value('Kargo ücreti')
        page.locator('#form-description').fill('Müşteri tahsilatı')
        expect(options(page)).to_have_count(0)
        page.keyboard.press('Escape')
        passed('description suggestions prioritize the selected customer and respect income/expense type')

        page.locator('[data-form-type="income"]').click()
        page.locator('#form-account').select_option('c')
        page.locator('#form-description').fill('Başka hesap')
        expect(options(page)).to_have_count(1)
        pick(page,'Başka hesap açıklaması')
        page.locator('#form-customer').fill('ipek')
        expect(options(page)).to_have_count(0)
        page.keyboard.press('Escape')
        expect(page.locator('#form-description')).to_have_value('Başka hesap açıklaması')
        passed('changing account refreshes both customer and description sources and preserves entered text')

        page.locator('[data-autocomplete-select="form-account"]').click()
        page.locator('#form-account-search').fill('alt sube')
        expect(options(page)).to_have_count(1)
        page.keyboard.press('ArrowDown');page.keyboard.press('Enter')
        expect(page.locator('#form-account')).to_have_value('b')
        assert page.evaluate('draft.kasaId')=='b'
        page.locator('#form-description').fill('Şube')
        expect(options(page)).to_have_count(1)
        close(page)
        page.locator('[data-autocomplete-select="form-account"]').click()
        page.locator('#form-account-search').fill('Olmayan hesap')
        expect(options(page)).to_have_count(0)
        page.keyboard.press('Escape')
        expect(page.locator('#form-account')).to_have_value('b')
        passed('account completion selects permitted IDs; unmatched text and Escape leave the account unchanged')

        page.locator('#form-account').select_option('a')
        page.locator('#form-customer').fill('Yepyeni cari')
        page.keyboard.press('Tab')
        expect(page.locator('#form-customer')).to_have_value('Yepyeni cari')
        expect(page.locator('#form-customer')).to_have_attribute('aria-expanded','false')
        page.locator('#form-description').fill('Yeni bir açıklama')
        page.keyboard.press('Enter')
        expect(page.locator('#form-description')).to_have_value('Yeni bir açıklama')
        expect(page.locator('#transaction-form')).to_be_visible()
        assert len(data(page)['transactions'])==count
        page.locator('#form-customer').fill('ipek')
        page.keyboard.press('ArrowDown')
        page.locator('#form-customer').dispatch_event('compositionstart')
        page.locator('#form-customer').dispatch_event('keydown',{'key':'Enter','isComposing':True,'bubbles':True,'cancelable':True})
        expect(page.locator('#form-customer')).to_have_value('ipek')
        page.locator('#form-customer').dispatch_event('compositionend')
        close(page)
        passed('Tab preserves free text, Enter does not accidentally save, and IME composition is not selected early')

        page.locator('#form-customer').fill('<img')
        expect(options(page)).to_have_count(1)
        assert options(page).locator('img').count()==0
        pick(page,'<img src=x')
        assert not page.evaluate('Boolean(window.injected)')
        expect(page.locator('#form-customer')).to_have_value('<img src=x onerror=window.injected=1>')
        page.locator('#form-amount').fill('5,50')
        page.locator('#transaction-form button[type="submit"]').first.click()
        expect(page.locator('#transaction-form')).to_have_count(0)
        assert data(page)['transactions'][-1]['customerName']=='<img src=x onerror=window.injected=1>'
        passed('untrusted suggestion values render as text and the selected value saves normally')

        page.locator('#search-input').fill('ipek')
        expect(options(page)).to_have_count(1)
        page.keyboard.press('ArrowDown');page.keyboard.press('Enter')
        expect(page.locator('#search-input')).to_have_value('İpek Çağrı')
        assert page.locator('.tx-row[data-tx-id]').count()==3
        expect(page.locator('.autocomplete-popup')).to_have_count(0)
        page.locator('#search-input').fill('Aranmayan yeni ifade')
        page.keyboard.press('Escape')
        expect(page.locator('#search-input')).to_have_value('Aranmayan yeni ifade')
        passed('search suggestions survive list re-rendering and filter by the explicitly chosen phrase')

        page.locator('[data-tab="network"]').click()
        page.locator('[data-drag-id="a"] [data-action="edit-account"]').click()
        expect(page.locator('#account-name')).to_have_attribute('autocomplete','off')
        page.locator('[data-autocomplete-select="account-parent"]').click()
        page.locator('#account-parent-search').fill('Alt Şube')
        expect(options(page)).to_have_count(0)
        page.keyboard.press('Escape')
        expect(page.locator('.modal')).to_be_visible()
        page.locator('[data-autocomplete-select="account-parent"]').click()
        page.locator('#account-parent-search').fill('Diğer')
        pick(page,'Diğer Kasa')
        expect(page.locator('#account-parent')).to_have_value('c')
        assert next(k for k in data(page)['kasalar'] if k['id']=='a')['parentId'] is None
        page.keyboard.press('Escape')
        passed('parent-account completion preserves cycle exclusions and Escape closes suggestions before the modal')

        page.locator('[data-tab="list"]').click()
        page.locator('#search-input').fill('')
        close(page)
        page.locator('[data-tx-id="t1"]').click()
        page.locator('[data-action="move-transaction"]').click()
        page.locator('[data-autocomplete-select="move-target"]').click()
        page.locator('#move-target-search').fill('Merkez')
        expect(options(page)).to_have_count(0)
        page.locator('#move-target-search').fill('Diğer')
        pick(page,'Diğer Kasa')
        expect(page.locator('#move-target')).to_have_value('c')
        assert next(t for t in data(page)['transactions'] if t['id']=='t1')['kasaId']=='a'
        page.keyboard.press('Escape')
        assert not errors,errors
        passed('transfer-target completion excludes the source and does not perform a transfer before submission')
        context.close()

        phone,mobile=setup(browser,seed=make_seed(),viewport={'width':375,'height':812},is_mobile=True,has_touch=True)
        mobile.locator('[data-tab="add"]').tap()
        mobile.locator('#form-customer').fill('ipek cagri')
        expect(options(mobile)).to_have_count(1)
        options(mobile).first.tap()
        expect(mobile.locator('#form-customer')).to_have_value('İpek Çağrı')
        mobile.locator('#form-customer').fill('Yeni Cari')
        expect(options(mobile)).to_have_count(8)
        box=mobile.locator('.autocomplete-list').bounding_box()
        assert box and box['x']>=0 and box['x']+box['width']<=375
        session=phone.new_cdp_session(mobile)
        touch_drag(session,{'x':box['x']+box['width']/2,'y':box['y']+box['height']-12},{'x':box['x']+box['width']/2,'y':box['y']+12})
        mobile.wait_for_function("() => document.querySelector('.autocomplete-list').scrollTop > 20")
        expect(mobile.locator('#form-customer')).to_have_value('Yeni Cari')
        expect(mobile.locator('.autocomplete-popup')).to_be_visible()
        options(mobile).nth(6).tap()
        assert mobile.locator('#form-customer').input_value().startswith('Yeni Cari ')
        assert mobile.evaluate('draft.customerName')==mobile.locator('#form-customer').input_value()
        passed('mobile touch selection and suggestion-list panning work without accidental selection')
        mobile.locator('[data-autocomplete-select="form-account"]').tap()
        mobile.locator('#form-account-search').fill('Diğer')
        options(mobile).first.tap()
        expect(mobile.locator('#form-account')).to_have_value('c')
        mobile.locator('#form-description').fill('Başka')
        expect(options(mobile)).to_have_count(1)
        expect(mobile.locator('.autocomplete-popup')).to_be_visible()
        mobile.screenshot(path=str(ROOT/'test-artifacts'/'autocomplete-mobile.png'),full_page=True)
        assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
        passed('mobile account completion updates dependent descriptions and fits the viewport')
        phone.close();browser.close()
        print(f'Completed {len(checks)} completion scenarios.',flush=True)
