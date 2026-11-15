"""WebKit frontend smoke check; does not replace a real iPhone/TestFlight test."""
from playwright.sync_api import sync_playwright, expect
from browser import setup, create_account, data, ROOT

with sync_playwright() as p:
    browser = p.webkit.launch(headless=True)
    context, page = setup(browser, viewport={'width':390,'height':844},locale='tr-TR')
    page.on('dialog',lambda dialog:dialog.accept())
    errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    # Exercise the JSON fallback used by early iOS 15 WebKit versions.
    page.evaluate('() => { window.structuredClone = undefined; }')
    root = create_account(page,'WebKit ana hesap')
    create_account(page,'Alt hesap',root)
    page.locator('[data-tab="add"]').click()
    page.locator('#form-amount').fill('12,34')
    page.locator('#form-customer').fill('İpek Çağrı')
    page.locator('#form-description').fill('WebKit kontrolü')
    page.locator('#form-date').fill('2026-11-15')
    page.locator('#transaction-form button[type="submit"]').first.click()
    expect(page.locator('#transaction-form')).to_have_count(0)
    assert data(page)['transactions'][0]['amountCents']==1234
    page.locator('[data-tab="add"]').click()
    page.locator('#form-customer').fill('ipek cagri')
    expect(page.locator('.autocomplete-option')).to_have_count(1)
    page.keyboard.press('ArrowDown');page.keyboard.press('Enter')
    expect(page.locator('#form-customer')).to_have_value('İpek Çağrı')
    page.locator('[data-autocomplete-select="form-account"]').click()
    page.locator('#form-account-search').fill('Alt hesap')
    page.locator('.autocomplete-option').first.click()
    assert page.locator('#form-account').input_value()!=root
    page.locator('[data-action="open-settings"]').click()
    with page.expect_download() as download:
        page.locator('[data-action="export-data"]').click()
    assert download.value.suggested_filename.endswith('.json')
    page.keyboard.press('Escape')
    assert not errors,errors
    page.screenshot(path=str(ROOT/'test-artifacts'/'webkit-frontend.png'),full_page=True)
    browser.close()
    print('PASS WebKit: JSON clone fallback, hierarchy, transaction save, autocomplete, account search and backup export.')
