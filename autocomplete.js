/* Accessible, local-only completion for text inputs and native account selectors. */
'use strict';
(function installAutocomplete() {
  let active = null;
  let positionFrame = 0;
  let suppressFocus = '';
  let suppressClickUntil = 0;
  let selectTap = null;
  const labelFor = input => document.querySelector(`label[for="${CSS.escape(input.id)}"]`)?.textContent.trim() || input.getAttribute('aria-label') || 'Öneriler';
  function configure(input) {
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    input.removeAttribute('list'); // Avoid a second, browser-dependent native popup.
  }
  function enhance() {
    if (active && (!active.anchor.isConnected || !active.input.isConnected)) close();
    document.querySelectorAll('[data-autocomplete]').forEach(input => {
      if (active?.input !== input) configure(input);
    });
    document.querySelectorAll('select[data-searchable]').forEach(select => {
      if (select.closest('.select-autocomplete')) return;
      const wrapper = document.createElement('div'); wrapper.className = 'select-autocomplete';
      select.before(wrapper); wrapper.appendChild(select);
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'select-search-trigger'; button.dataset.autocompleteSelect = select.id;
      button.textContent = '⌕'; button.title = `${select.dataset.searchable} adıyla ara`;
      button.setAttribute('aria-label', button.title); button.setAttribute('aria-expanded', 'false'); button.disabled = select.disabled;
      wrapper.appendChild(button);
    });
  }
  function close(restore = false) {
    const current = active; active = null;
    cancelAnimationFrame(positionFrame); positionFrame = 0;
    if (!current) return;
    current.input.setAttribute('aria-expanded', 'false');
    current.input.removeAttribute('aria-controls'); current.input.removeAttribute('aria-activedescendant');
    current.trigger?.setAttribute('aria-expanded', 'false');
    current.popup.remove();
    if (restore) {
      const target = current.select?.isConnected ? current.select : current.input.isConnected ? current.input : null;
      if (target && !current.select) suppressFocus = target.id;
      target?.focus({ preventScroll: true });
      queueMicrotask(() => { if (target && suppressFocus === target.id) suppressFocus = ''; });
    }
  }
  function create(input, anchor, select = null, trigger = null) {
    close();
    const popup = document.createElement('div'); popup.className = 'autocomplete-popup'; popup.style.visibility = 'hidden';
    const caption = document.createElement('div'); caption.className = 'autocomplete-caption';
    const title = select ? `${select.dataset.searchable} ara` : input.dataset.autocomplete === 'search' ? 'Kayıtlarınızda ara' : input.dataset.autocomplete === 'customerName' ? 'Önceki cariler / müşteriler' : 'Açıklama önerileri';
    const heading = document.createElement('span'); heading.textContent = title;
    const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.className = 'autocomplete-close'; dismiss.tabIndex = -1;
    dismiss.textContent = '×'; dismiss.setAttribute('aria-label', 'Önerileri kapat');
    caption.append(heading, dismiss); popup.appendChild(caption);
    if (select) {
      const label = document.createElement('label'); label.className = 'sr-only'; label.htmlFor = input.id; label.textContent = title;
      popup.append(label, input);
    }
    const list = document.createElement('div'); list.id = `${input.id}-autocomplete-list`; list.className = 'autocomplete-list';
    list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', title);
    const status = document.createElement('p'); status.className = 'autocomplete-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    popup.append(list, status);
    (anchor.closest('.modal') || document.body).appendChild(popup);
    active = { input, anchor, popup, list, status, select, trigger, options: [], index: -1, composing: false, interacting: false };
    input.setAttribute('aria-controls', list.id); input.setAttribute('aria-expanded', 'true');
    trigger?.setAttribute('aria-expanded', 'true');
    refresh();
  }
  function keepFieldVisible(input) {
    const rect = input.getBoundingClientRect(), modal = input.closest('.modal');
    const viewport = window.visualViewport;
    let top = Math.max(8, viewport?.offsetTop || 0), bottom = Math.min(innerHeight, (viewport?.offsetTop || 0) + (viewport?.height || innerHeight)) - 8;
    if (modal) { const bounds = modal.getBoundingClientRect(); top = Math.max(top, bounds.top + 8); bottom = Math.min(bottom, bounds.bottom - 8); }
    else {
      top = Math.max(top, (document.querySelector('.topbar')?.getBoundingClientRect().bottom || 0) + 8);
      const nav = document.querySelector('.bottom-nav'); if (nav) bottom = Math.min(bottom, nav.getBoundingClientRect().top - 8);
    }
    if (rect.top < top || rect.bottom > bottom) input.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  }
  function openText(input) {
    if (input.disabled || input.readOnly) return;
    if (suppressFocus === input.id) return;
    if (active?.input === input) { refresh(); return; }
    keepFieldVisible(input); create(input, input);
  }
  function openSelect(select, trigger) {
    if (!select?.isConnected || select.disabled) return;
    const input = document.createElement('input');
    input.id = `${select.id}-search`; input.className = 'autocomplete-select-input'; input.type = 'search';
    input.placeholder = 'Hesap adı yazın…'; input.maxLength = 120; configure(input);
    keepFieldVisible(select); create(input, select, select, trigger); input.focus({ preventScroll: true });
  }
  function refresh() {
    const current = active;
    if (!current) return;
    if (!current.input.isConnected || !current.anchor.isConnected || current.anchor.disabled) { close(); return; }
    current.options = current.select
      ? window.KasaSuggestions.selectOptions([...current.select.options].map(option => ({ value: option.value, label: option.textContent.trim(), disabled: option.disabled, selected: option.selected })), current.input.value)
      : entrySuggestions(current.input.dataset.autocomplete, current.input.value, 8);
    current.index = -1;
    current.input.removeAttribute('aria-activedescendant');
    current.list.replaceChildren();
    current.options.forEach((option, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.tabIndex = -1; button.className = 'autocomplete-option';
      button.id = `${current.list.id}-${index}`; button.dataset.autocompleteIndex = String(index);
      button.setAttribute('role', 'option'); button.setAttribute('aria-selected', 'false');
      const text = document.createElement('span'); text.className = 'autocomplete-value'; text.textContent = option.label; text.title = option.label;
      const meta = document.createElement('small'); meta.textContent = option.meta;
      button.append(text, meta); current.list.appendChild(button);
    });
    if (!current.options.length) {
      const message = document.createElement('p'); message.className = 'autocomplete-empty';
      message.textContent = current.select ? 'Eşleşen hesap yok. Mevcut seçim değişmedi.' : current.input.value ? 'Öneri bulunamadı. Yazdığınız değeri kullanabilirsiniz.' : 'Henüz öneri yok. Yeni bir değer yazabilirsiniz.';
      current.list.appendChild(message);
    }
    current.status.textContent = current.options.length ? `${current.options.length} öneri · Oklarla seçin, Enter ile kullanın` : current.select ? 'Hesap oluşturmak için hesaplar ekranını kullanın.' : 'Yeni bir değer yazabilirsiniz. Otomatik kayıt yapılmaz.';
    position();
  }
  function position() {
    positionFrame = 0;
    const current = active;
    if (!current || !current.anchor.isConnected) return;
    const rect = current.anchor.getBoundingClientRect();
    const viewport = window.visualViewport;
    const topEdge = Math.max(8, viewport?.offsetTop || 0);
    let bottomEdge = Math.min(innerHeight, (viewport?.offsetTop || 0) + (viewport?.height || innerHeight)) - 8;
    const nav = document.querySelector('.bottom-nav');
    if (!current.anchor.closest('.modal') && nav) bottomEdge = Math.min(bottomEdge, nav.getBoundingClientRect().top - 8);
    if (rect.bottom < topEdge || rect.top > bottomEdge) { current.popup.style.visibility = 'hidden'; return; }
    current.popup.style.visibility = 'visible';
    const width = Math.min(Math.max(rect.width, 250), innerWidth - 20);
    current.popup.style.width = `${width}px`;
    current.popup.style.left = `${Math.max(10, Math.min(rect.left, innerWidth - width - 10))}px`;
    const below = bottomEdge - rect.bottom - 5, above = rect.top - topEdge - 5;
    const useAbove = below < 160 && above > below;
    const room = Math.max(90, useAbove ? above : below);
    const overhead = current.select ? 112 : 64;
    current.list.style.maxHeight = `${Math.max(48, Math.min(current.select ? 260 : 208, room - overhead))}px`;
    const height = current.popup.getBoundingClientRect().height;
    current.popup.style.top = `${Math.max(topEdge, useAbove ? rect.top - height - 5 : rect.bottom + 5)}px`;
  }
  function schedulePosition(event) {
    if (!active || (event?.target instanceof Node && active.popup.contains(event.target))) return;
    if (!positionFrame) positionFrame = requestAnimationFrame(position);
  }
  function highlight(index) {
    const current = active;
    if (!current?.options.length) return;
    current.index = (index + current.options.length) % current.options.length;
    [...current.list.children].forEach((option, i) => option.setAttribute('aria-selected', String(i === current.index)));
    const option = current.list.children[current.index];
    current.input.setAttribute('aria-activedescendant', option.id);
    // Scroll this list only; scrollIntoView would move the surrounding form on mobile.
    if (option.offsetTop < current.list.scrollTop) current.list.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > current.list.scrollTop + current.list.clientHeight) current.list.scrollTop = option.offsetTop + option.offsetHeight - current.list.clientHeight;
  }
  function choose(index) {
    const current = active, option = current?.options[index];
    if (!option || !current.anchor.isConnected || current.anchor.disabled) return;
    const id = current.input.id, select = current.select;
    if (select) {
      if (![...select.options].some(item => item.value === option.value && !item.disabled)) return;
      select.value = option.value; close();
      select.dispatchEvent(new Event('input', { bubbles: true })); select.dispatchEvent(new Event('change', { bubbles: true }));
      if (select.isConnected) select.focus({ preventScroll: true });
    } else {
      const input = current.input; input.value = option.value;
      suppressFocus = id; close();
      input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
      const replacement = document.getElementById(id);
      if (replacement) { replacement.focus({ preventScroll: true }); replacement.setSelectionRange(replacement.value.length, replacement.value.length); }
      queueMicrotask(() => { if (suppressFocus === id) suppressFocus = ''; });
    }
  }
  document.addEventListener('focusin', event => {
    if (active?.select && event.target === active.trigger) { active.input.focus({ preventScroll: true }); return; }
    if (event.target.matches('[data-autocomplete]')) { openText(event.target); return; }
    if (active && event.target !== active.input && !active.popup.contains(event.target)) close();
  });
  document.addEventListener('focusout', event => {
    const current = active;
    if (!current || event.target !== current.input) return;
    setTimeout(() => { if (active === current && !current.interacting && document.activeElement !== current.input && !current.popup.contains(document.activeElement)) close(); }, 0);
  });
  document.addEventListener('pointerdown', event => {
    suppressClickUntil = 0;
    const trigger = event.target.closest('[data-autocomplete-select]');
    selectTap = event.pointerType !== 'mouse' && trigger && !trigger.disabled ? { pointer: event.pointerId, x: event.clientX, y: event.clientY, trigger, moved: false } : null;
    if (!active) return;
    if (active.popup.contains(event.target)) {
      active.interacting = true;
      const option = event.target.closest('[data-autocomplete-index]');
      const dismiss = event.target.closest('.autocomplete-close');
      if (event.pointerType !== 'mouse' && (option || dismiss)) {
        const index = option ? Number(option.dataset.autocompleteIndex) : -1;
        active.tap = { pointer: event.pointerId, x: event.clientX, y: event.clientY, index, value: active.options[index]?.value, dismiss: Boolean(dismiss), moved: false };
      }
      if (event.pointerType === 'mouse' && event.target.closest('[data-autocomplete-index]')) event.preventDefault();
    } else if (event.target !== active.input && !active.anchor.contains(event.target)) close();
  }, true);
  document.addEventListener('pointermove', event => {
    if (selectTap?.pointer === event.pointerId && Math.hypot(event.clientX - selectTap.x, event.clientY - selectTap.y) > 10) selectTap.moved = true;
    const tap = active?.tap;
    if (tap?.pointer === event.pointerId && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 10) tap.moved = true;
  }, true);
  document.addEventListener('pointerup', event => {
    if (selectTap?.pointer === event.pointerId) {
      const tap = selectTap; selectTap = null;
      const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-autocomplete-select]');
      if (!tap.moved && hit === tap.trigger) {
        suppressClickUntil = Date.now() + 450;
        if (event.cancelable) event.preventDefault();
        event.stopImmediatePropagation();
        openSelect(document.getElementById(tap.trigger.dataset.autocompleteSelect), tap.trigger); return;
      }
    }
    const current = active, tap = current?.tap;
    if (!tap || tap.pointer !== event.pointerId) return;
    current.tap = null; current.interacting = false;
    if (tap.moved) return;
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const option = hit?.closest('[data-autocomplete-index]');
    const sameOption = option && current.popup.contains(option) && Number(option.dataset.autocompleteIndex) === tap.index && current.options[tap.index]?.value === tap.value;
    const sameDismiss = tap.dismiss && hit?.closest('.autocomplete-close') && current.popup.contains(hit);
    if (!sameOption && !sameDismiss) return;
    suppressClickUntil = Date.now() + 450;
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
    if (sameDismiss) close(true); else choose(tap.index);
  }, true);
  document.addEventListener('pointercancel', () => { selectTap = null; if (active) { active.interacting = false; active.tap = null; } }, true);
  document.addEventListener('mousedown', event => {
    if (Date.now() < suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('click', event => {
    if (Date.now() < suppressClickUntil && event.detail !== 0) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (active?.popup.contains(event.target) && event.target.closest('.autocomplete-close')) { event.preventDefault(); event.stopImmediatePropagation(); close(true); return; }
    const option = event.target.closest('[data-autocomplete-index]');
    if (option && active?.popup.contains(option)) {
      event.preventDefault(); event.stopImmediatePropagation(); choose(Number(option.dataset.autocompleteIndex)); return;
    }
    const trigger = event.target.closest('[data-autocomplete-select]');
    if (trigger && !trigger.disabled) {
      event.preventDefault(); event.stopImmediatePropagation(); openSelect(document.getElementById(trigger.dataset.autocompleteSelect), trigger); return;
    }
    if (active) active.interacting = false;
  }, true);
  document.addEventListener('input', event => {
    if (event.target.matches('[data-autocomplete]') && !active && !suppressFocus) { openText(event.target); return; }
    if (active?.input === event.target && !event.isComposing) refresh();
  });
  document.addEventListener('compositionstart', event => { if (active?.input === event.target) active.composing = true; });
  document.addEventListener('compositionend', event => { if (active?.input === event.target) { active.composing = false; refresh(); } });
  document.addEventListener('keydown', event => {
    const input = event.target;
    if (!input.matches('[data-autocomplete], .autocomplete-select-input')) return;
    if (event.isComposing || active?.composing || event.keyCode === 229) return;
    if (!active && ['ArrowDown', 'ArrowUp'].includes(event.key) && input.matches('[data-autocomplete]')) openText(input);
    const current = active;
    if (!current || current.input !== input) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(Boolean(current.select)); }
    else if (event.key === 'Tab') { if (current.select) { event.preventDefault(); event.stopImmediatePropagation(); close(true); } else close(); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); event.stopImmediatePropagation(); highlight(current.index < 0 ? event.key === 'ArrowDown' ? 0 : current.options.length - 1 : current.index + (event.key === 'ArrowDown' ? 1 : -1));
    } else if ((event.key === 'Home' || event.key === 'End') && current.index >= 0) {
      event.preventDefault(); event.stopImmediatePropagation(); highlight(event.key === 'Home' ? 0 : current.options.length - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault(); event.stopImmediatePropagation();
      if (current.index >= 0) choose(current.index); else close(Boolean(current.select));
    }
  }, true);
  document.addEventListener('kasa:render', enhance);
  document.addEventListener('kasa:suggestions', () => { if (active?.input.isConnected) refresh(); });
  document.addEventListener('scroll', schedulePosition, true);
  window.addEventListener('resize', schedulePosition);
  window.visualViewport?.addEventListener('resize', schedulePosition);
  window.visualViewport?.addEventListener('scroll', schedulePosition);
  window.addEventListener('blur', () => close());
  enhance();
})();
