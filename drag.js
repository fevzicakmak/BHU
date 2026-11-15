/* Account movement: pointer drag, touch target selection and keyboard support. */
'use strict';
(function installAccountDrag() {
  const CARD = '[data-drag-id]';
  const live = document.createElement('div');
  live.className = 'sr-only';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  document.body.appendChild(live);
  let drag = null;
  let frame = 0;
  let ignoreClickUntil = 0;
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
  const inside = (x, y, rect, margin = 0) => x >= rect.left - margin && x <= rect.right + margin && y >= rect.top - margin && y <= rect.bottom + margin;

  function focusHandle(id) {
    const handle = document.querySelector(`${CARD}[data-drag-id="${CSS.escape(id)}"] [data-drag-handle]`);
    handle?.focus({ preventScroll: true });
  }
  function captureLayout() {
    const panel = document.querySelector('.network-panel');
    return { left: panel?.scrollLeft || 0, top: panel?.scrollTop || 0,
      cards: new Map([...document.querySelectorAll(CARD)].map(node => [node.dataset.dragId, node.getBoundingClientRect()])) };
  }
  function renderMovedAccounts(before, sourceId) {
    render();
    const panel = document.querySelector('.network-panel');
    if (panel) { panel.scrollLeft = before.left; panel.scrollTop = before.top; }
    if (currentTab !== 'network') return;
    if (!reducedMotion()) {
      const visible = node => node.bottom >= 0 && node.top < innerHeight && node.right >= 0 && node.left < innerWidth;
      const entries = [...document.querySelectorAll(CARD)].map(node => ({ node, rect: node.getBoundingClientRect(), old: before.cards.get(node.dataset.dragId) }));
      for (const { node, rect, old } of entries) {
        if (!old || (!visible(rect) && !visible(old))) continue;
        const x = old.left - rect.left, y = old.top - rect.top;
        if (Math.abs(x) + Math.abs(y) > 1) node.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
    }
    focusHandle(sourceId);
  }
  async function moveAccount(sourceId, targetId) {
    const source = state.kasalar.find(k => k.id === sourceId);
    if (!source || saving) return;
    const previousParent = source.parentId;
    if (previousParent === targetId) { toast('Bu hesap zaten seçilen seviyede'); focusHandle(sourceId); return; }
    const before = captureLayout();
    if (!await commit(next => {
      const account = next.kasalar.find(k => k.id === sourceId);
      if (!account) throw new Error('Taşınacak hesap bulunamadı.');
      if (account.parentId !== previousParent) throw new Error('Hesap değişti. Güncel verileri yükleyip yeniden taşıyın.');
      account.parentId = targetId;
    }, { render: false })) { focusHandle(sourceId); return; }
    renderMovedAccounts(before, sourceId);
    // Keep the established status wording for existing integrations and tests.
    toast(targetId ? 'Hesap hiyerarşisi güncellendi' : 'Hesap ana seviyeye taşındı');
    const undo = document.createElement('button');
    undo.type = 'button'; undo.className = 'drag-undo'; undo.textContent = 'Geri al';
    undo.setAttribute('aria-label', `${source.name} hesabının taşınmasını geri al`);
    undo.addEventListener('click', async event => {
      event.stopPropagation();
      if (saving) return;
      undo.disabled = true;
      clearTimeout(toast.timer);
      const layout = captureLayout();
      const okay = await commit(next => {
        const account = next.kasalar.find(k => k.id === sourceId);
        if (!account || account.parentId !== targetId) throw new Error('Hesap yeniden değiştiği için bu taşıma geri alınamadı.');
        account.parentId = previousParent;
      }, { render: false });
      if (okay) { renderMovedAccounts(layout, sourceId); toast('Taşıma geri alındı'); }
      else { undo.disabled = false; toast.timer = setTimeout(() => document.querySelector('#toast').classList.add('hidden'), 10000); }
    });
    document.querySelector('#toast').appendChild(undo);
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => document.querySelector('#toast').classList.add('hidden'), 10000);
  }
  function reset(announce = '', restoreFocus = false) {
    const item = drag;
    if (!item) return;
    drag = null;
    cancelAnimationFrame(frame); frame = 0;
    item.node.classList.remove('bhu-moving');
    item.branch.classList.remove('bhu-moving-branch');
    item.target?.node?.classList.remove('bhu-target', 'bhu-invalid');
    item.cards.forEach(({ node }) => node.classList.remove('bhu-choice', 'bhu-unavailable'));
    item.handle.setAttribute('aria-expanded', 'false');
    item.ghost?.remove(); item.dock?.remove();
    document.body.classList.remove('is-account-dragging', 'is-account-picking');
    try { if (item.capture?.hasPointerCapture(item.pointer)) item.capture.releasePointerCapture(item.pointer); } catch (_) { /* Already released. */ }
    if (announce) live.textContent = announce;
    if (restoreFocus) focusHandle(item.id);
  }
  function makeItem(node, mode, event = null) {
    const account = state.kasalar.find(k => k.id === node.dataset.dragId);
    if (!account) return null;
    const depths = new Map();
    sortedAccounts().forEach(k => depths.set(k.id, k.parentId ? depths.get(k.parentId) + 1 : 0));
    const branchIds = descendants(account.id);
    const branchDepth = Math.max(...[...branchIds].map(id => depths.get(id))) - depths.get(account.id);
    const invalid = new Set(branchIds);
    state.kasalar.forEach(k => { if (depths.get(k.id) + 1 + branchDepth > 31) invalid.add(k.id); });
    return { id: account.id, name: account.name, node, handle: node.querySelector('[data-drag-handle]'), branch: node.closest('.tree-root'),
      panel: node.closest('.network-panel'), mode, pointer: event?.pointerId, capture: node, x: event?.clientX || 0, y: event?.clientY || 0,
      startX: event?.clientX || 0, startY: event?.clientY || 0, touch: event?.pointerType !== 'mouse', active: false, invalid,
      cards: [...document.querySelectorAll(CARD)].map(card => ({ node: card, id: card.dataset.dragId, name: state.kasalar.find(k => k.id === card.dataset.dragId)?.name || '', rect: null })),
      rectsDirty: true, target: null, targetKey: '', ghost: null, dock: null, time: 0 };
  }
  function measure(item) {
    item.cards.forEach(card => { card.rect = card.node.getBoundingClientRect(); });
    item.panelRect = item.panel.getBoundingClientRect();
    item.dockRect = item.dock.getBoundingClientRect();
    item.topEdge = (document.querySelector('.topbar')?.getBoundingClientRect().bottom || 0) + 16;
    item.bottomEdge = item.dockRect.top - 10;
    item.rectsDirty = false;
  }
  function activate(item) {
    item.active = true;
    window.getSelection()?.removeAllRanges();
    item.node.classList.add('bhu-moving');
    item.branch.classList.add('bhu-moving-branch');
    item.handle.setAttribute('aria-expanded', 'true');
    document.body.classList.add(item.mode === 'pick' ? 'is-account-picking' : 'is-account-dragging');
    const dock = document.createElement('div');
    dock.className = 'account-drag-dock';
    dock.setAttribute('role', 'group'); dock.setAttribute('aria-label', 'Hesabı taşı');
    dock.innerHTML = '<p class="drag-instruction"></p><div class="drag-dock-actions"><button type="button" class="drag-root-target" data-drag-root><span aria-hidden="true">⌂</span> Ana hesap yap</button><button type="button" class="drag-cancel" data-drag-cancel>İptal <small>Esc</small></button></div>';
    document.body.appendChild(dock); item.dock = dock;
    if (item.mode === 'pointer') {
      const ghost = document.createElement('div'); ghost.className = 'bhu-ghost account-drag-ghost';
      const title = document.createElement('strong'); title.textContent = item.name;
      const subtitle = document.createElement('small'); subtitle.textContent = `${descendants(item.id).size - 1} alt hesabıyla birlikte`;
      ghost.append(title, subtitle); document.body.appendChild(ghost); item.ghost = ghost;
      item.ghostWidth = ghost.offsetWidth; item.ghostHeight = ghost.offsetHeight;
      try { item.capture.setPointerCapture(item.pointer); } catch (_) { reset('Taşıma başlatılamadı. Yeniden deneyin.'); return; }
    } else {
      item.cards.forEach(card => card.node.classList.add(item.invalid.has(card.id) ? 'bhu-unavailable' : 'bhu-choice'));
    }
    const text = item.mode === 'pick' ? `${item.name}: hedef hesaba dokunun veya ok tuşlarıyla seçip Enter'a basın.` : `${item.name}: bir hesabın üzerine veya ana hesap alanına bırakın.`;
    dock.querySelector('.drag-instruction').textContent = text; live.textContent = text;
    measure(item);
    if (item.mode === 'pointer') schedule();
  }
  function setTarget(item, target) {
    const key = target ? `${target.kind}:${target.id || ''}` : '';
    if (key === item.targetKey) return;
    item.target?.node?.classList.remove('bhu-target', 'bhu-invalid');
    item.target = target; item.targetKey = key;
    const rootButton = item.dock.querySelector('[data-drag-root]');
    rootButton.classList.toggle('is-target', target?.kind === 'root');
    let message = 'Hedef hesabın üzerine bırakın; dışarı bırakırsanız taşıma iptal edilir.';
    if (target?.kind === 'account') {
      const invalid = item.invalid.has(target.id);
      target.node.classList.add(invalid ? 'bhu-invalid' : 'bhu-target');
      message = invalid ? `${target.name}: bu hesaba taşınamaz.` : `${item.name} → ${target.name} altına ${item.mode === 'pick' ? 'Enter ile taşıyın' : 'bırakın'}.`;
    } else if (target?.kind === 'root') message = `${item.name} → ana hesap ${item.mode === 'pick' ? 'yapmak için Enter' : 'olarak bırakın'}.`;
    item.dock.querySelector('.drag-instruction').textContent = message;
    item.rectsDirty = true;
    live.textContent = message;
  }
  function targetAt(item) {
    const { x, y } = item;
    const hit = document.elementFromPoint(x, y);
    if (!hit) return null;
    if (hit.closest('[data-drag-root], [data-root-drop-area]')) return { kind: 'root', id: null };
    if (hit.closest('.account-drag-dock, .network-title')) return null;
    const exact = hit.closest(CARD);
    if (exact === item.node) return null;
    if (exact) return { ...item.cards.find(card => card.node === exact), kind: 'account' };
    if (!inside(x, y, item.panelRect)) return null;
    // Keep the previous target through narrow gaps, then magnetize nearby visible cards.
    const previous = item.target?.kind === 'account' ? item.cards.find(card => card.id === item.target.id) : null;
    if (previous && inside(x, y, previous.rect, 20)) return { ...previous, kind: 'account' };
    let closest = null, distance = item.touch ? 26 : 18;
    for (const card of item.cards) {
      if (card.id === item.id) continue;
      const rect = card.rect;
      if (rect.right < item.panelRect.left || rect.left > item.panelRect.right || rect.bottom < item.topEdge || rect.top > innerHeight) continue;
      const dx = Math.max(rect.left - x, 0, x - rect.right), dy = Math.max(rect.top - y, 0, y - rect.bottom);
      const next = Math.hypot(dx, dy);
      if (next < distance) { distance = next; closest = card; }
    }
    if (closest) return { ...closest, kind: 'account' };
    return hit.closest('.network-panel') ? { kind: 'root', id: null } : null;
  }
  function edgeSpeed(position, low, high, zone, max) {
    if (position < low + zone) return -max * clamp((low + zone - position) / zone, 0, 1);
    if (position > high - zone) return max * clamp((position - high + zone) / zone, 0, 1);
    return 0;
  }
  function autoScroll(item, delta) {
    if (inside(item.x, item.y, item.dockRect)) return;
    const panel = item.panel, rect = item.panelRect;
    if (item.y < Math.max(rect.top, item.topEdge) - 36 || item.y > Math.min(rect.bottom, item.bottomEdge) + 36 || item.x < rect.left - 32 || item.x > rect.right + 32) return;
    const x = edgeSpeed(item.x, rect.left, rect.right, Math.min(64, rect.width / 5), 850);
    const oldX = panel.scrollLeft;
    panel.scrollLeft += x * delta;
    const y = edgeSpeed(item.y, Math.max(rect.top, item.topEdge), Math.min(rect.bottom, item.bottomEdge), 64, 700);
    const oldY = scrollY;
    if (y) window.scrollBy(0, y * delta);
    if (panel.scrollLeft !== oldX || scrollY !== oldY) item.rectsDirty = true;
  }
  function paint(time) {
    frame = 0;
    const item = drag;
    if (!item?.active || item.mode !== 'pointer') return;
    if (!item.node.isConnected || currentTab !== 'network' || document.querySelector('.modal')) { reset('Taşıma iptal edildi.'); return; }
    if (item.rectsDirty) measure(item);
    const delta = item.time ? Math.min((time - item.time) / 1000, .032) : .016;
    item.time = time;
    autoScroll(item, delta);
    if (item.rectsDirty) measure(item);
    setTarget(item, targetAt(item));
    const x = clamp(item.x + 18, 10, innerWidth - item.ghostWidth - 10);
    const y = Math.max(10, item.y - item.ghostHeight - (item.touch ? 38 : 18));
    item.ghost.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    schedule();
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(paint); }
  async function finish(item) {
    const target = item.target;
    if (!target) { reset('Taşıma iptal edildi.', true); return; }
    if (target.kind === 'account' && item.invalid.has(target.id)) {
      toast('Hesap kendi içine, altına veya izin verilen seviyenin dışına taşınamaz');
      if (item.mode === 'pointer') reset('Bu hesaba taşınamaz.', true);
      return;
    }
    const sourceId = item.id, parentId = target.kind === 'root' ? null : target.id;
    reset();
    await moveAccount(sourceId, parentId);
  }
  function startPick(node) {
    if (saving || document.querySelector('.modal')) return;
    if (drag) reset();
    drag = makeItem(node, 'pick');
    if (drag) { activate(drag); drag.handle.focus({ preventScroll: true }); }
  }

  function pickChoice(element) {
    if (element?.closest('[data-drag-cancel]')) return { kind: 'cancel', id: '' };
    if (element?.closest('[data-drag-root]')) return { kind: 'root', id: '' };
    const node = element?.closest(CARD);
    return node && !element.closest('.node-actions') ? { kind: 'account', id: node.dataset.dragId, node } : null;
  }
  function choose(item, choice) {
    if (!choice) return;
    if (choice.kind === 'cancel' || choice.id === item.id) { reset('Taşıma iptal edildi.', true); return; }
    setTarget(item, choice.kind === 'root' ? { kind: 'root', id: null } : { ...item.cards.find(card => card.id === choice.id), kind: 'account' });
    finish(item);
  }
  document.addEventListener('pointerdown', event => {
    // A new physical press is intentional; only suppress the compatibility click of the previous gesture.
    ignoreClickUntil = 0;
    if (drag?.active) {
      if (drag.mode === 'pick' && event.pointerType !== 'mouse') drag.tap = { pointer: event.pointerId, x: event.clientX, y: event.clientY, choice: pickChoice(event.target), moved: false };
      if (drag.mode === 'pointer' && drag.pointer !== event.pointerId) reset('Taşıma iptal edildi.', true);
      return;
    }
    const node = event.target.closest(CARD);
    if (!node || saving || document.querySelector('.modal') || event.target.closest('.node-actions') || event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
    // The whole heading is a touch surface. Other card areas retain native scrolling.
    if (event.pointerType !== 'mouse' && !event.target.closest('.node-top')) return;
    drag = makeItem(node, 'pointer', event);
  }, true);
  document.addEventListener('pointermove', event => {
    const item = drag;
    if (item?.mode === 'pick') {
      if (item.tap?.pointer === event.pointerId && Math.hypot(event.clientX - item.tap.x, event.clientY - item.tap.y) > 10) item.tap.moved = true;
      return;
    }
    if (!item || item.mode !== 'pointer' || item.pointer !== event.pointerId) return;
    item.x = event.clientX; item.y = event.clientY;
    if (!item.active) {
      if (Math.hypot(item.x - item.startX, item.y - item.startY) < (item.touch ? 8 : 5)) return;
      activate(item);
    }
    if (event.cancelable) event.preventDefault();
  }, { capture: true, passive: false });
  document.addEventListener('pointerup', event => {
    const item = drag;
    if (item?.mode === 'pick' && item.tap?.pointer === event.pointerId) {
      const tap = item.tap; item.tap = null;
      const choice = pickChoice(document.elementFromPoint(event.clientX, event.clientY));
      if (!tap.moved && choice && choice.kind === tap.choice?.kind && choice.id === tap.choice?.id) {
        ignoreClickUntil = Date.now() + 450;
        if (event.cancelable) event.preventDefault();
        choose(item, choice);
      }
      return;
    }
    if (!item || item.mode !== 'pointer' || item.pointer !== event.pointerId) return;
    if (!item.active) {
      drag = null;
      if (item.touch) {
        const hit = document.elementFromPoint(event.clientX, event.clientY);
        const handle = hit?.closest('[data-drag-handle]');
        const select = hit?.closest('.node-select');
        if (hit?.closest(CARD) !== item.node || (!handle && !select)) return;
        ignoreClickUntil = Date.now() + 450;
        if (event.cancelable) event.preventDefault();
        if (handle) startPick(item.node);
        else select.click();
      }
      return;
    }
    item.x = event.clientX; item.y = event.clientY;
    if (item.rectsDirty) measure(item);
    setTarget(item, targetAt(item));
    ignoreClickUntil = Date.now() + 450;
    finish(item);
  }, true);
  document.addEventListener('pointercancel', event => { if (drag?.mode === 'pick') { drag.tap = null; return; } if (drag?.mode === 'pointer' && drag.pointer === event.pointerId) reset('Taşıma iptal edildi.', true); }, true);
  document.addEventListener('lostpointercapture', event => { if (drag?.active && drag.mode === 'pointer' && drag.pointer === event.pointerId && event.target === drag.capture && !drag.capture.hasPointerCapture(event.pointerId)) reset('Taşıma iptal edildi.', true); }, true);
  document.addEventListener('dragstart', event => { if (event.target.closest(CARD)) event.preventDefault(); }, true);
  document.addEventListener('click', event => {
    if (Date.now() < ignoreClickUntil && event.detail !== 0) {
      event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    const handle = event.target.closest('[data-drag-handle]');
    if (event.target.closest('[data-drag-cancel]')) {
      event.preventDefault(); event.stopImmediatePropagation(); reset('Taşıma iptal edildi.', true); return;
    }
    if (drag?.mode === 'pick') {
      const item = drag;
      if (event.target.closest('[data-drag-root]')) {
        event.preventDefault(); event.stopImmediatePropagation(); setTarget(item, { kind: 'root', id: null }); finish(item); return;
      }
      const card = event.target.closest(CARD);
      if (card && !event.target.closest('.node-actions')) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (card === item.node) { reset('Taşıma iptal edildi.', true); return; }
        setTarget(item, { ...item.cards.find(entry => entry.node === card), kind: 'account' }); finish(item); return;
      }
      if (!event.target.closest('.account-drag-dock')) reset('Taşıma iptal edildi.');
    }
    if (handle) { event.preventDefault(); event.stopImmediatePropagation(); startPick(handle.closest(CARD)); }
  }, true);
  document.addEventListener('keydown', event => {
    const item = drag;
    if (!item?.active) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); ignoreClickUntil = Date.now() + 450; reset('Taşıma iptal edildi.', true); return; }
    if (item.mode !== 'pick') return;
    if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopImmediatePropagation();
      const choices = [{ kind: 'root', id: null }, ...item.cards.filter(card => !item.invalid.has(card.id)).map(card => ({ ...card, kind: 'account' }))];
      const current = choices.findIndex(choice => `${choice.kind}:${choice.id || ''}` === item.targetKey);
      const forward = ['ArrowDown', 'ArrowRight'].includes(event.key);
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : current < 0 ? (forward ? 0 : choices.length - 1) : (current + (forward ? 1 : -1) + choices.length) % choices.length;
      setTarget(item, choices[index]);
      choices[index].node?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
    } else if ((event.key === 'Enter' || event.key === ' ') && item.target && event.target === item.handle) {
      event.preventDefault(); event.stopImmediatePropagation(); finish(item);
    }
  }, true);
  const dirtyRects = () => { if (drag) drag.rectsDirty = true; };
  document.addEventListener('scroll', dirtyRects, true);
  window.addEventListener('resize', dirtyRects);
  window.addEventListener('blur', () => reset('Taşıma iptal edildi.'));
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset('Taşıma iptal edildi.'); });
})();
