"""Account drag regressions: mouse, touch, keyboard, cancellation and edge scrolling."""
import os
import re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from browser import setup, data, ROOT

scenarios = []
def passed(name):
    scenarios.append(name)
    print('PASS', name, flush=True)

def seed(accounts):
    return {'version':2, 'kasalar':[{'id': id, 'name': name, 'parentId': parent, 'createdAt':'2026-11-15T12:00:00.000Z', 'includeInParentTotals':True} for id, name, parent in accounts], 'transactions':[], 'activeKasaId':accounts[0][0]}

def parent(page, id):
    return next(k['parentId'] for k in data(page)['kasalar'] if k['id'] == id)

def card(page, id):
    return page.locator(f'[data-drag-id="{id}"]')

def point(locator):
    rect = locator.bounding_box()
    assert rect, 'Expected visible drag surface'
    return {'x':rect['x']+rect['width']/2, 'y':rect['y']+rect['height']/2}

def down(page, id, handle=False):
    p = point(card(page,id).locator('[data-drag-handle]' if handle else '.node-select'))
    page.mouse.move(p['x'],p['y']);page.mouse.down()
    return p

def move_to(page, id):
    p = point(card(page,id).locator('.node-top'))
    page.mouse.move(p['x'],p['y'],steps=12)
    expect(card(page,id)).to_have_class(re.compile('bhu-target|bhu-invalid'))
    return p

def settled(page):
    page.wait_for_function('() => !saving && document.getAnimations().every(a => a.playState !== "running")')

def touch_drag(session, start, end, cancel=False):
    session.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[dict(start,id=1)]})
    for i in range(1,13):
        x=start['x']+(end['x']-start['x'])*i/12
        y=start['y']+(end['y']-start['y'])*i/12
        session.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{'x':x,'y':y,'id':1}]})
    session.send('Input.dispatchTouchEvent', {'type':'touchCancel' if cancel else 'touchEnd','touchPoints':[]})

if __name__ == '__main__':
    with sync_playwright() as p:
        executable=os.environ.get('BROWSER_EXECUTABLE') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)
        browser=p.chromium.launch(executable_path=executable,headless=True,args=['--no-sandbox'])
        (ROOT/'test-artifacts').mkdir(exist_ok=True)
        original=seed([('a','Merkez',None),('b','Şube',None),('c','Banka',None),('d','Alt hesap','a')])
        context,page=setup(browser,seed=original,viewport={'width':1280,'height':950})
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        # A tap/click still selects; movement starts directly from the account heading.
        card(page,'b').locator('.node-select').click();settled(page)
        assert data(page)['activeKasaId']=='b'
        down(page,'b');move_to(page,'a')
        expect(page.locator('.drag-instruction')).to_contain_text('Merkez altına')
        page.mouse.up();settled(page)
        assert parent(page,'b')=='a' and data(page)['activeKasaId']=='b'
        page.get_by_role('button',name='Şube hesabının taşınmasını geri al').click();settled(page)
        assert parent(page,'b') is None
        passed('whole-heading drag preserves click selection and offers working undo')

        down(page,'b')
        rect=card(page,'a').bounding_box()
        page.mouse.move(rect['x']+rect['width']+10,rect['y']+30,steps=12)
        expect(card(page,'a')).to_have_class(re.compile('bhu-target'))
        page.mouse.up();settled(page)
        assert parent(page,'b')=='a'
        passed('nearby gaps magnetize to the intended target')

        snapshot=data(page)
        down(page,'a');move_to(page,'d')
        expect(page.locator('.drag-instruction')).to_contain_text('taşınamaz')
        page.mouse.up();settled(page)
        assert data(page)==snapshot
        down(page,'c');move_to(page,'a')
        page.keyboard.press('Escape');page.mouse.up()
        expect(page.locator('.account-drag-dock')).to_have_count(0)
        assert data(page)==snapshot
        passed('descendant drops and Escape cancellation never mutate saved data')

        card(page,'b').locator('[data-drag-handle]').click()
        expect(page.locator('.account-drag-dock')).to_be_visible()
        page.locator('[data-drag-root]').focus();page.keyboard.press('Enter');settled(page)
        assert parent(page,'b') is None
        card(page,'b').locator('[data-drag-handle]').focus()
        page.keyboard.press('Enter')
        page.keyboard.press('ArrowRight')  # Root level.
        page.keyboard.press('ArrowRight')  # Merkez.
        expect(page.locator('.drag-instruction')).to_contain_text('Merkez')
        page.keyboard.press('Enter');settled(page)
        assert parent(page,'b')=='a'
        passed('tap-to-move root target and keyboard move both work')

        # Pointer release over the fixed root target is explicit and works away from the tree.
        down(page,'b')
        start=point(card(page,'b').locator('.node-top'))
        page.mouse.move(start['x']+12,start['y']+12)
        expect(page.locator('.account-drag-dock')).to_be_visible()
        target=point(page.locator('[data-drag-root]'))
        page.mouse.move(target['x'],target['y'],steps=14)
        expect(page.locator('[data-drag-root]')).to_have_class(re.compile('is-target'))
        page.mouse.up();settled(page)
        assert parent(page,'b') is None
        assert not errors,errors
        passed('fixed root drop zone works without reaching the bottom of a large tree')
        snapshot=data(page)
        page.evaluate("() => { window.realSet=Storage.prototype.setItem; Storage.prototype.setItem=function(k,v){if(k==='kasa-pro-data-v1') throw new DOMException('quota','QuotaExceededError');return window.realSet.call(this,k,v);}; }")
        down(page,'b');move_to(page,'a');page.mouse.up();settled(page)
        expect(page.locator('#notice')).to_contain_text('kaydedilmedi')
        assert data(page)==snapshot and parent(page,'b') is None
        page.evaluate('() => { Storage.prototype.setItem=window.realSet; }')
        passed('failed persistent write leaves the visible and saved hierarchy unchanged')
        context.close()

        wide=seed([(f'w{i}',f'Hesap {i:02}',None) for i in range(35)])
        wide_context,widepage=setup(browser,seed=wide,viewport={'width':1280,'height':900})
        down(widepage,'w0')
        bounds=widepage.locator('.network-panel').bounding_box()
        y=point(card(widepage,'w0').locator('.node-top'))['y']
        widepage.mouse.move(bounds['x']+bounds['width']-8,y,steps=10)
        # No more mousemove events: scrolling must continue while the pointer is held still.
        widepage.wait_for_function("() => document.querySelector('.network-panel').scrollLeft > 250")
        widepage.keyboard.press('Escape');widepage.mouse.up()
        assert data(widepage)==wide
        passed('stationary edge hold continuously scrolls a wide account tree')
        wide_context.close()

        tall=seed([('t0','Ana hesap',None)]+[(f't{i}',f'Seviye {i}',f't{i-1}') for i in range(1,20)]+[('extra','Diğer kasa',None)])
        tall_context,tallpage=setup(browser,seed=tall,viewport={'width':1280,'height':900})
        down(tallpage,'t0')
        initial=point(card(tallpage,'t0').locator('.node-top'))
        tallpage.mouse.move(initial['x']+10,initial['y']+10)
        expect(tallpage.locator('.account-drag-dock')).to_be_visible()
        bottom=tallpage.locator('.account-drag-dock').bounding_box()['y']-18
        tallpage.mouse.move(initial['x'],bottom,steps=10)
        tallpage.wait_for_function('() => scrollY > 150')
        tallpage.keyboard.press('Escape');tallpage.mouse.up()
        assert data(tallpage)==tall
        passed('stationary edge hold vertically scrolls a deep account tree')
        tall_context.close()

        phone,mobile=setup(browser,seed=original,viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
        session=phone.new_cdp_session(mobile)
        # Touch can begin anywhere on the heading, not just the small icon.
        # Bring both root headings into view in the horizontally scrolling tree.
        start=point(card(mobile,'b').locator('.node-select'))
        target=point(card(mobile,'a').locator('.node-top'))
        touch_drag(session,start,target)
        mobile.wait_for_function("() => JSON.parse(localStorage.getItem('kasa-pro-data-v1')).kasalar.find(k=>k.id==='b').parentId==='a'")
        settled(mobile)
        assert parent(mobile,'b')=='a'
        passed('real touch pointer drag starts from the full account heading')
        card(mobile,'b').locator('[data-drag-handle]').tap()
        expect(mobile.locator('.account-drag-dock')).to_be_visible()
        card(mobile,'c').locator('.node-select').tap();settled(mobile)
        assert parent(mobile,'b')=='c'
        card(mobile,'b').locator('[data-drag-handle]').tap()
        mobile.locator('[data-drag-root]').tap();settled(mobile)
        assert parent(mobile,'b') is None
        passed('touch target selection moves between accounts and back to root')
        snapshot=data(mobile)
        start=point(card(mobile,'b').locator('.node-select'))
        target=point(card(mobile,'a').locator('.node-top'))
        touch_drag(session,start,target,cancel=True)
        expect(mobile.locator('.account-drag-dock')).to_have_count(0)
        assert data(mobile)==snapshot
        passed('touch cancellation releases capture and leaves the hierarchy unchanged')
        card(mobile,'b').locator('[data-drag-handle]').tap()
        mobile.evaluate('window.scrollTo(0,0)')
        mobile.screenshot(path=str(ROOT/'test-artifacts'/'account-move-mobile.png'),full_page=True)
        assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
        phone.close()
        pan_context,pan=setup(browser,seed=wide,viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
        card(pan,'w0').locator('[data-drag-handle]').tap()
        expect(pan.locator('.account-drag-dock')).to_be_visible()
        start=point(card(pan,'w0').locator('.node-select'))
        session=pan_context.new_cdp_session(pan)
        touch_drag(session,start,{'x':20,'y':start['y']})
        pan.wait_for_function("() => document.querySelector('.network-panel').scrollLeft > 40")
        expect(pan.locator('.account-drag-dock')).to_be_visible()
        assert data(pan)==wide
        pan.locator('[data-drag-cancel]').tap()
        expect(pan.locator('.account-drag-dock')).to_have_count(0)
        passed('target-selection mode preserves native touch panning and does not drop on scroll')
        pan_context.close()
        browser.close()
        print(f'Completed {len(scenarios)} account movement scenarios.',flush=True)
