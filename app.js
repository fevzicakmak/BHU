'use strict';

const Core = window.KasaCore;
const STORAGE_KEY = 'kasa-pro-data-v1'; // Keep existing installations and data.
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
const today = () => Core.localDate();
const currencyFormat = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });
const money = cents => {
  const absolute = BigInt(Math.abs(cents));
  const parts = currencyFormat.formatToParts(absolute / 100n);
  return (cents < 0 ? '−' : '') + parts.map(part => part.type === 'fraction' ? String(absolute % 100n).padStart(2, '0') : part.value).join('');
};
const dateText = value => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
const emptyState = () => ({ version: 2, kasalar: [], transactions: [], activeKasaId: null, revision: null });
const emptyFilters = () => ({ searchText: '', startDate: '', endDate: '', minAmount: '', maxAmount: '', type: 'all' });
let state = emptyState();
let storedRaw = null;
let recoveryRaw = null;
let loadError = '';
let currentTab = 'network';
let filters = emptyFilters();
let groupBy = 'daily';
let filterExpanded = false;
let saving = false;
let filePending = false;
let externalChange = false;
let pendingImport = null;
let modalTrigger = null;
let modalCleanup = null;
let draft = blankDraft();
let calc = { display: '0', previous: null, operation: null, overwrite: false };
const commonIncome = ['Satış', 'Hizmet bedeli', 'Tahsilat', 'Maaş', 'İade', 'Diğer gelir'];
const commonExpense = ['Kira', 'Fatura', 'Malzeme', 'Ulaşım', 'Yemek', 'Maaş ödemesi', 'Diğer gider'];

function blankDraft(accountId = null) {
  return { id: null, original: null, kasaId: accountId, type: 'income', amount: '', customerName: '', description: '', date: today(), attachments: [], dirty: false };
}
function activeAccount() { return state.kasalar.find(k => k.id === state.activeKasaId); }
function descendants(id, included = false) { return Core.descendants(state.kasalar, id, included); }
function accountTransactions(id) {
  const ids = descendants(id, true);
  return state.transactions.filter(t => ids.has(t.kasaId));
}
function balance(id) { return Core.totals(accountTransactions(id)).balance; }
function accountDepth(account) {
  let count = 0, parent = account.parentId;
  while (parent) { count++; parent = state.kasalar.find(k => k.id === parent)?.parentId; }
  return count;
}
function sortedAccounts() {
  const result = [];
  function append(parent) {
    state.kasalar.filter(k => k.parentId === parent).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name, 'tr')).forEach(k => { result.push(k); append(k.id); });
  }
  append(null);
  return result;
}
function accountOptions(selected, excluded = new Set()) {
  return sortedAccounts().filter(k => !excluded.has(k.id)).map(k => `<option value="${esc(k.id)}" ${k.id === selected ? 'selected' : ''}>${'— '.repeat(accountDepth(k))}${esc(k.name)}</option>`).join('');
}
function loadInitialState() {
  try {
    storedRaw = localStorage.getItem(STORAGE_KEY);
    if (storedRaw) {
      const saved = JSON.parse(storedRaw);
      state = Core.normalizeState(saved);
      if (saved.version !== 2) recoveryRaw = storedRaw;
    }
  } catch (error) {
    recoveryRaw = storedRaw;
    loadError = `Mevcut veriler açılamadı: ${error.message} Ayarlardan ham kaydı indirebilir ve geçerli bir yedek yükleyebilirsiniz. Mevcut kayıt değiştirilmedi.`;
  }
  draft = blankDraft(state.activeKasaId);
}
function notice(message, persistent = false) {
  const el = $('#notice');
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(notice.timer);
  if (!persistent) notice.timer = setTimeout(() => el.classList.add('hidden'), 6500);
}
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add('hidden'), 3200);
}
function showError(error, inline = null) {
  const message = error.name === 'QuotaExceededError'
    ? 'Tarayıcı depolaması dolu. Değişiklik kaydedilmedi; formunuz korundu. Yedek alın veya ekli belgeleri azaltın.'
    : error.name === 'SecurityError' ? 'Tarayıcı yerel kaydı engelliyor. Değişiklik kaydedilmedi; formunuz korundu.' : error.message;
  if (inline && $(inline)) { $(inline).textContent = message; $(inline).focus(); }
  else notice(message, true);
}
async function commit(mutator, options = {}) {
  if (saving) return false;
  saving = true;
  updateSaveButtons();
  try {
    const write = () => {
      if (loadError && !options.recovery) throw new Error('Mevcut veriler okunamadığı için kayıt korumaya alındı. Ayarlardan ham kaydı indirip geçerli bir yedek yükleyin.');
      const candidate = structuredClone(state);
      mutator(candidate);
      candidate.version = 2;
      candidate.revision = uid();
      // Keep the original legacy snapshot when there is room; failure here must not prevent a valid main write.
      let createdRecovery = false;
      if (recoveryRaw && !loadError) {
        try { if (!localStorage.getItem('kasa-pro-recovery-v1')) { localStorage.setItem('kasa-pro-recovery-v1', recoveryRaw); createdRecovery = true; } } catch (_) { /* Original remains downloadable in this session. */ }
      }
      let result;
      try { result = Core.saveSnapshot(localStorage, STORAGE_KEY, candidate, storedRaw); }
      catch (error) {
        if (createdRecovery && error.name === 'QuotaExceededError') {
          localStorage.removeItem('kasa-pro-recovery-v1');
          result = Core.saveSnapshot(localStorage, STORAGE_KEY, candidate, storedRaw);
        } else throw error;
      }
      state = result.state;
      storedRaw = result.raw;
      externalChange = false;
      if (options.recovery) loadError = '';
    };
    // Serialize cooperating tabs, then compare snapshots inside the lock.
    if (navigator.locks?.request) await navigator.locks.request('kasa-pro-write', write);
    else write();
    if (options.render !== false) render();
    return true;
  } catch (error) {
    try { externalChange = localStorage.getItem(STORAGE_KEY) !== storedRaw; } catch (_) { /* Storage unavailable. */ }
    showError(error, options.errorTarget);
    updateSyncBanner();
    return false;
  } finally {
    saving = false;
    updateSaveButtons();
  }
}
function updateSaveButtons() {
  document.querySelectorAll('[data-save]').forEach(button => { button.disabled = saving || filePending || (button.dataset.action === 'confirm-import' && !importCheckpoint); });
  document.querySelectorAll('#transaction-form input, #transaction-form select, #transaction-form button:not([data-save]), #account-form input, #account-form select, #move-form select').forEach(el => { el.disabled = saving; });
  const hint = $('#draft-status');
  if (hint) hint.textContent = filePending ? 'Belgeler okunuyor…' : saving ? 'Kaydediliyor…' : draft.dirty ? 'Kaydedilmemiş taslak · Sekmeler arasında korunur' : 'Bu cihazda saklanır · Düzenli yedek alın';
}
function updateSyncBanner() { $('#sync-banner').classList.toggle('hidden', !externalChange); }
function render() {
  const account = activeAccount();
  if (!account) currentTab = 'network';
  $('#active-kasa-label').textContent = account ? `${account.name} · ${descendants(account.id, true).size - 1} alt hesap dahil` : 'İlk hesabınızı oluşturarak başlayın';
  $('#account-button-label').textContent = account?.name || 'Hesap Seç';
  document.querySelectorAll('.nav-item').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === currentTab);
    if (button.dataset.tab === currentTab) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    button.disabled = !account && button.dataset.tab !== 'network';
  });
  let txs = account ? accountTransactions(account.id) : [];
  let filterError = '';
  if (account && currentTab === 'list') {
    try { txs = Core.filterTransactions(txs, filters); } catch (error) { txs = []; filterError = error.message; }
  }
  $('#summary').innerHTML = account ? summaryHTML(txs) : '';
  $('#summary-caption').textContent = !account ? '' : currentTab === 'list' ? 'Listelenen işlemlerin toplamı · Dahil edilen alt hesaplarla birlikte' : 'Hesabın tüm dönem toplamı · Dahil edilen alt hesaplarla birlikte';
  $('#tab-content').innerHTML = currentTab === 'list' ? listHTML(txs, filterError) : currentTab === 'add' ? formHTML() : currentTab === 'stats' ? statsHTML(txs) : networkHTML();
  const menu = $('#account-menu');
  if (!menu.classList.contains('hidden')) menu.innerHTML = accountMenuHTML();
  updateSaveButtons();
  updateSyncBanner();
}
function summaryHTML(txs) {
  const total = Core.totals(txs);
  return [['income', '↗ Gelir', total.income], ['expense', '↘ Gider', total.expense], [total.balance < 0 ? 'negative' : 'balance', '▣ Bakiye', total.balance]].map(([kind, label, amount]) => `<div class="summary-card ${kind}"><div class="summary-label">${label}</div><div class="summary-value" title="${esc(money(amount))}">${money(amount)}</div></div>`).join('');
}
function filterHTML() {
  const active = Object.entries(filters).some(([key, value]) => key === 'type' ? value !== 'all' : value);
  return `<div class="panel filter-panel no-print">
    <div class="search-line"><div class="input-wrap"><span class="input-icon" aria-hidden="true">⌕</span><input id="search-input" aria-label="İşlemlerde ara" value="${esc(filters.searchText)}" placeholder="Cari veya açıklama ara…" type="search"></div><button class="icon-button ${filterExpanded || active ? 'active' : ''}" data-action="toggle-filters" aria-label="Filtreler" aria-expanded="${filterExpanded}">☷</button></div>
    ${filterExpanded ? `<div class="filters"><div class="quick-dates">${[['all', 'Tüm dönem'], ['today', 'Bugün'], ['month', 'Bu ay']].map(([key, label]) => `<button data-action="quick-date" data-range="${key}">${label}</button>`).join('')}</div>
    <div class="filter-block"><span class="field-label">İşlem türü</span><div class="segmented">${[['all', 'Tümü'], ['income', 'Gelir'], ['expense', 'Gider']].map(([key, label]) => `<button data-filter-type="${key}" class="${filters.type === key ? 'selected' : ''}" aria-pressed="${filters.type === key}">${label}</button>`).join('')}</div></div>
    <div class="filter-grid">${[['start-date', 'Başlangıç', 'date', filters.startDate], ['end-date', 'Bitiş', 'date', filters.endDate], ['min-amount', 'Min. tutar (₺)', 'text', filters.minAmount], ['max-amount', 'Maks. tutar (₺)', 'text', filters.maxAmount]].map(([id, label, type, value]) => `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type}" ${type === 'text' ? 'inputmode="decimal" placeholder="0,00"' : ''} value="${esc(value)}"></div>`).join('')}</div>
    <div class="filter-block"><span class="field-label">Gruplama</span><div class="segmented four">${[['none', 'Yok'], ['daily', 'Günlük'], ['monthly', 'Aylık'], ['yearly', 'Yıllık']].map(([key, label]) => `<button data-group-by="${key}" class="${groupBy === key ? 'selected' : ''}" aria-pressed="${groupBy === key}">${label}</button>`).join('')}</div></div>${active ? '<button class="clear-filters" data-action="clear-filters">Filtreleri temizle</button>' : ''}</div>` : ''}</div>`;
}
function groupLabel(key) {
  if (groupBy === 'daily') return dateText(key);
  if (groupBy === 'yearly') return key;
  return new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(new Date(`${key}-01T12:00:00`));
}
function listHTML(txs, error) {
  const head = filterHTML();
  if (error) return `${head}<p class="inline-error" role="alert">${esc(error)}</p>`;
  if (!txs.length) return `${head}<div class="panel empty-state"><div class="empty-inner"><div class="empty-icon">☷</div><h2>Henüz listelenecek işlem yok</h2><p>Bu hesapta işlem oluşturabilir veya filtreleri değiştirebilirsiniz.</p><button class="primary-button" data-tab="add">＋ İşlem ekle</button></div></div>`;
  const groups = new Map();
  txs.forEach(t => { const key = groupBy === 'none' ? 'all' : t.date.slice(0, groupBy === 'daily' ? 10 : groupBy === 'monthly' ? 7 : 4); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(t); });
  return `${head}<p class="result-count" aria-live="polite">${txs.length} işlem listeleniyor</p>${[...groups].map(([key, entries]) => {
    const total = Core.totals(entries);
    return `<div class="group">${groupBy !== 'none' ? `<div class="group-head"><span>${groupLabel(key)}</span><span class="group-totals"><span class="income-text">+${money(total.income)}</span><span class="expense-text">−${money(total.expense)}</span></span></div>` : ''}<div class="panel">${entries.map(transactionHTML).join('')}</div></div>`;
  }).join('')}`;
}
function transactionHTML(t) {
  const account = state.kasalar.find(k => k.id === t.kasaId);
  const meta = [account?.name, t.customerName && t.description ? t.description : '', dateText(t.date)].filter(Boolean).join(' · ');
  return `<button class="tx-row" data-tx-id="${esc(t.id)}"><span class="tx-icon ${t.type}" aria-hidden="true">${t.type === 'income' ? '↗' : '↘'}</span><span class="tx-body"><span class="tx-main"><strong class="tx-title">${esc(t.customerName || t.description || (t.type === 'income' ? 'Gelir' : 'Gider'))}</strong><strong class="tx-amount ${t.type}-text">${t.type === 'income' ? '+' : '−'}${money(t.amountCents)}</strong></span><span class="tx-sub"><span class="tx-meta">${esc(meta)}${t.attachments.length ? `<span class="attachment-badge">${t.attachments.length} belge</span>` : ''}</span></span></span></button>`;
}
function formHTML() {
  if (!draft.kasaId) draft.kasaId = state.activeKasaId;
  return `<form id="transaction-form" class="panel form-panel" novalidate>
    <div class="form-heading"><div><p class="eyebrow">KASA HAREKETİ</p><h2>${draft.id ? 'İşlemi düzenle' : 'Yeni işlem'}</h2></div>${draft.dirty || draft.id ? '<button type="button" class="link-button" data-action="reset-draft">Yeni işlem</button>' : ''}</div>
    <div class="form-body"><div class="type-toggle">${[['income', '＋ Gelir'], ['expense', '− Gider']].map(([type, label]) => `<button type="button" data-form-type="${type}" class="${draft.type === type ? `selected ${type}` : ''}" aria-pressed="${draft.type === type}">${label}</button>`).join('')}</div>
    <div class="field amount-field"><label for="form-amount">Tutar (₺) <span aria-hidden="true">*</span></label><div class="amount-entry"><span aria-hidden="true">₺</span><input id="form-amount" name="amount" type="text" inputmode="decimal" autocomplete="off" required maxlength="20" placeholder="0,00" value="${esc(draft.amount)}" aria-describedby="amount-help form-error"><button type="button" class="calc-trigger" data-action="open-calculator" aria-label="Hesap makinesini aç">⌗</button></div><p id="amount-help" class="field-hint">Tutarı yazın; hesaplamak için sağdaki simgeyi kullanın.</p></div>
    <div class="form-grid"><div class="field"><label for="form-account">İşlemin hesabı *</label><select id="form-account" required>${accountOptions(draft.kasaId)}</select></div><div class="field"><label for="form-date">Tarih *</label><input id="form-date" type="date" min="1900-01-01" max="9999-12-31" required value="${esc(draft.date)}"><div class="date-shortcuts"><button type="button" data-action="form-date" data-offset="0">Bugün</button><button type="button" data-action="form-date" data-offset="-1">Dün</button></div></div></div>
    <div class="field"><label for="form-customer">Cari / müşteri <span class="optional">isteğe bağlı</span></label><input id="form-customer" list="customer-suggestions" maxlength="200" autocomplete="off" value="${esc(draft.customerName)}" placeholder="Müşteri veya cari adı"><datalist id="customer-suggestions">${suggestions('customerName').map(s => `<option value="${esc(s)}"></option>`).join('')}</datalist></div>
    <div class="field"><label for="form-description">Açıklama <span class="optional">isteğe bağlı</span></label><input id="form-description" list="description-suggestions" maxlength="2000" autocomplete="off" value="${esc(draft.description)}" placeholder="İşlem ne içindi?"><datalist id="description-suggestions">${suggestions('description').map(s => `<option value="${esc(s)}"></option>`).join('')}</datalist><div id="description-chips" class="suggestion-chips">${descriptionChips()}</div></div>
    <details class="attachment-section" ${draft.attachments.length ? 'open' : ''}><summary>⌕ Belge veya fotoğraf ekle <span>${draft.attachments.length ? `(${draft.attachments.length})` : 'isteğe bağlı'}</span></summary><div class="attachment-body"><label class="upload-label" for="file-input">＋ Dosya seç</label><input id="file-input" type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.pdf,.doc,.docx,.xls,.xlsx,.txt"><p class="field-hint">Yeni dosya başına en fazla 1 MB. Büyük fotoğrafları eklemeden önce küçültün.</p><div id="form-attachments" class="attachment-list">${attachmentsHTML(draft.attachments, true)}</div><p id="file-error" class="inline-error" role="alert" tabindex="-1"></p></div></details>
    <p id="form-error" class="inline-error" role="alert" tabindex="-1"></p></div>
    <div class="form-footer"><p id="draft-status" class="field-hint"></p><div class="form-save-actions"><button type="submit" class="primary-button ${draft.type === 'expense' ? 'expense' : ''}" data-save>${draft.id ? 'Değişiklikleri kaydet' : draft.type === 'income' ? 'Geliri kaydet' : 'Gideri kaydet'}</button>${!draft.id ? '<button type="submit" class="secondary-button" name="saveAnother" value="yes" data-save>Kaydet ve devam et</button>' : ''}</div></div></form>`;
}
function suggestions(field) {
  const ids = descendants(draft.kasaId);
  const past = state.transactions.filter(t => ids.has(t.kasaId)).slice().reverse().map(t => t[field]).filter(Boolean);
  const common = field === 'description' ? draft.type === 'expense' ? commonExpense : commonIncome : [];
  return [...new Set([...past, ...common])].slice(0, 40);
}
function descriptionChips() { return suggestions('description').slice(0, 5).map(s => `<button type="button" data-description="${esc(s)}">${esc(s)}</button>`).join(''); }
function attachmentsHTML(files, removable) {
  return files.map(a => `<div class="attachment">${['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(a.type) ? `<img src="${esc(a.url)}" alt="" loading="lazy">` : '<span class="attachment-icon" aria-hidden="true">▤</span>'}<span class="attachment-info"><strong>${esc(a.name)}</strong><small>${(a.size / 1024).toFixed(1)} KB</small></span>${removable ? `<button type="button" class="close-button" data-remove-attachment="${esc(a.id)}" aria-label="${esc(a.name)} belgesini kaldır">×</button>` : `<button type="button" class="link-button" data-download-attachment="${esc(a.id)}">İndir</button>`}</div>`).join('');
}
function statsHTML(txs) {
  const inc = txs.filter(t => t.type === 'income'), exp = txs.filter(t => t.type === 'expense');
  const avg = list => list.length ? money(Math.round(Core.safeSum(list.map(t => t.amountCents)) / list.length)) : '—';
  const max = list => list.length ? money(list.reduce((amount, t) => Math.max(amount, t.amountCents), 0)) : '—';
  const rows = [['Toplam işlem', txs.length], ['Gelir işlemi', inc.length], ['Gider işlemi', exp.length], ['Ortalama gelir', avg(inc)], ['Ortalama gider', avg(exp)], ['En büyük gelir', max(inc)], ['En büyük gider', max(exp)]];
  return `<div class="panel panel-pad"><h2 class="section-title">Hesap istatistikleri</h2><p class="field-hint">Tüm dönem · Dahil edilen alt hesaplarla birlikte</p><div class="stats-detail">${rows.map(([label, value]) => `<div class="stats-line"><span>${label}</span><strong>${value}</strong></div>`).join('')}</div></div>`;
}
function networkHTML() {
  const roots = state.kasalar.filter(k => !k.parentId);
  return `<div class="panel network-panel" data-drop-root><div class="network-title"><div><h2 class="section-title">⌘ Hesap ağ şeması <small>${state.kasalar.length} hesap</small></h2><p>Kartları tutamaçlarından sürükleyin. Boş alana bırakılan hesap ana hesap olur.<br>“Düzenle” ile de üst hesabı değiştirebilirsiniz.</p></div><button class="primary-button" style="width:auto" data-action="add-account">＋ Ana hesap</button></div><div class="tree">${roots.map(treeNodeHTML).join('') || '<div class="network-empty"><span class="empty-icon">⌂</span><h2>Kasalarınızı tek yerde takip edin</h2><p>Bir ana hesap oluşturun, gerekiyorsa alt hesaplar ekleyin.</p><button class="primary-button" data-action="add-account">İlk hesabımı oluştur</button></div>'}</div>${roots.length ? '<div class="root-drop-hint">Ana hesap yapmak için tutamacı buraya bırakın</div>' : ''}</div>`;
}
function treeNodeHTML(k) {
  const children = state.kasalar.filter(child => child.parentId === k.id);
  return `<div class="tree-root"><div class="tree-node ${k.id === state.activeKasaId ? 'active' : ''}" data-drag-id="${esc(k.id)}"><div class="node-top"><button class="node-select" data-select-account="${esc(k.id)}"><strong>${esc(k.name)}</strong><small>${money(balance(k.id))} · ${descendants(k.id, true).size - 1} alt hesap</small></button><span class="drag-handle" data-drag-handle aria-hidden="true" title="Hesabı sürükleyin">⠿</span></div>${k.parentId && !k.includeInParentTotals ? '<span class="excluded-badge">Üst hesap toplamına dahil değil</span>' : ''}<div class="node-actions"><button data-action="add-account" data-parent-id="${esc(k.id)}">＋ Alt</button><button data-action="edit-account" data-account-id="${esc(k.id)}">Düzenle</button><button data-action="delete-account" data-account-id="${esc(k.id)}">Sil</button></div></div>${children.length ? `<div class="tree-children">${children.map(treeNodeHTML).join('')}</div>` : ''}</div>`;
}
function accountMenuHTML() {
  return `<div class="menu-heading">Hesaplar</div>${sortedAccounts().map(k => `<div class="account-row ${k.id === state.activeKasaId ? 'selected' : ''}"><button class="account-select" data-select-account="${esc(k.id)}" style="padding-left:${Math.min(accountDepth(k), 5) * 12}px"><strong>${k.parentId ? '↳ ' : ''}${esc(k.name)}</strong><small>${money(balance(k.id))}</small></button><button class="row-icon" data-action="edit-account" data-account-id="${esc(k.id)}" aria-label="${esc(k.name)} hesabını düzenle">✎</button><button class="row-icon" data-action="move-account-transactions" data-account-id="${esc(k.id)}" aria-label="${esc(k.name)} hesabının işlemlerini taşı">⇄</button></div>`).join('') || '<p class="panel-pad">Henüz hesap yok.</p>'}`;
}

function openModal(title, content, footer = '') {
  const alreadyOpen = Boolean($('#modal-root').firstElementChild);
  if (!alreadyOpen) modalTrigger = document.activeElement;
  if (modalCleanup) { modalCleanup(); modalCleanup = null; }
  $('#modal-root').innerHTML = `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1"><div class="modal-head"><h2 id="modal-title">${esc(title)}</h2><button type="button" class="close-button" data-action="close-modal" aria-label="Pencereyi kapat">×</button></div><div class="modal-body">${content}</div>${footer ? `<div class="modal-footer">${footer}</div>` : ''}</section></div>`;
  document.body.classList.add('modal-open');
  const focusTarget = $('.modal [autofocus]') || $('.modal');
  focusTarget.focus();
}
function closeModal() {
  if (modalCleanup) { modalCleanup(); modalCleanup = null; }
  $('#modal-root').replaceChildren();
  pendingImport = null; importCheckpoint = false;
  document.body.classList.remove('modal-open');
  if (modalTrigger?.isConnected) modalTrigger.focus();
  else ($(`[data-tab="${currentTab}"]`) || $('#app')).focus();
  modalTrigger = null;
}
function accountModal(accountId = null, parentId = null) {
  const account = state.kasalar.find(k => k.id === accountId);
  const parent = account?.parentId || parentId || '';
  openModal(account ? 'Hesabı düzenle' : parent ? 'Alt hesap ekle' : 'Yeni ana hesap', `<form id="account-form" data-account-id="${esc(accountId || '')}" novalidate><div class="field"><label for="account-name">Hesap adı *</label><input id="account-name" maxlength="120" value="${esc(account?.name || '')}" required autofocus></div><div class="field"><label for="account-parent">Üst hesap</label><select id="account-parent"><option value="">Üst hesap yok (ana hesap)</option>${accountOptions(parent, accountId ? descendants(accountId) : new Set())}</select></div><label class="check-field"><input id="account-included" type="checkbox" ${account?.includeInParentTotals !== false ? 'checked' : ''}>Üst hesabın toplamına dahil et</label><p class="field-hint">Ana hesaplarda bu seçim kullanılmaz. Hariç tutulan alt hesabın kendi toplamı korunur.</p><p id="account-error" class="inline-error" role="alert" tabindex="-1"></p><div class="form-actions"><button type="button" class="secondary-button" data-action="close-modal">İptal</button><button type="submit" class="primary-button" data-save>${account ? 'Kaydet' : 'Hesabı oluştur'}</button></div></form>`);
}
async function saveAccount(form) {
  const name = $('#account-name').value.trim();
  const parentId = $('#account-parent').value || null;
  const includeInParentTotals = $('#account-included').checked;
  const accountId = form.dataset.accountId;
  const okay = await commit(next => {
    if (!name) throw new Error('Hesap adını yazın.');
    const existing = next.kasalar.find(k => k.id === accountId);
    if (accountId && !existing) throw new Error('Düzenlenen hesap artık bulunamıyor.');
    if (existing) Object.assign(existing, { name, parentId, includeInParentTotals });
    else {
      const account = { id: uid(), name, parentId, includeInParentTotals, createdAt: new Date().toISOString() };
      next.kasalar.push(account);
      if (!next.activeKasaId) next.activeKasaId = account.id;
    }
  }, { errorTarget: '#account-error' });
  if (okay) { closeModal(); toast(accountId ? 'Hesap güncellendi' : 'Hesap oluşturuldu'); }
}
function transactionModal(t) {
  const account = state.kasalar.find(k => k.id === t.kasaId);
  openModal('İşlem detayı', `<div class="detail-amount ${t.type}-text">${t.type === 'income' ? '+' : '−'}${money(t.amountCents)}</div><div class="detail-list">${[['Hesap', account?.name], ['Tür', t.type === 'income' ? 'Gelir' : 'Gider'], ['Tarih', dateText(t.date)], ['Cari / müşteri', t.customerName || '—'], ['Açıklama', t.description || '—']].map(([label, value]) => `<div class="detail-line"><span>${label}</span><strong>${esc(value)}</strong></div>`).join('')}</div>${t.attachments.length ? `<div class="attachment-list">${attachmentsHTML(t.attachments, false)}</div>` : ''}<div class="modal-actions"><button data-action="edit-transaction" data-id="${esc(t.id)}">✎ Düzenle</button><button class="blue" data-action="move-transaction" data-id="${esc(t.id)}">⇄ Taşı</button><button class="red" data-action="delete-transaction" data-id="${esc(t.id)}">⌫ Sil</button></div>`);
}
function editTransaction(t) {
  if (draft.dirty && !confirm('Açık taslak yerine bu işlem düzenlensin mi? Taslaktaki değişiklikler silinir.')) return;
  draft = { id: t.id, original: JSON.stringify(t), kasaId: t.kasaId, type: t.type, amount: Core.centsInput(t.amountCents), customerName: t.customerName, description: t.description, date: t.date, attachments: structuredClone(t.attachments), dirty: false };
  closeModal();
  currentTab = 'add';
  render();
  $('#form-amount').focus();
}
async function saveTransaction(another) {
  if (filePending) return;
  const snapshot = structuredClone(draft);
  let amountCents;
  try {
    amountCents = Core.parseCents(snapshot.amount);
    if (!Core.validDate(snapshot.date)) throw new Error('Geçerli bir işlem tarihi seçin.');
    if (!state.kasalar.some(k => k.id === snapshot.kasaId)) throw new Error('İşlemin hesabını seçin.');
  } catch (error) { showError(error, '#form-error'); return; }
  const okay = await commit(next => {
    const tx = { id: snapshot.id || uid(), kasaId: snapshot.kasaId, type: snapshot.type, amountCents,
      date: snapshot.date, customerName: snapshot.customerName.trim(), description: snapshot.description.trim(), attachments: snapshot.attachments, createdAt: new Date().toISOString() };
    if (snapshot.id) {
      const index = next.transactions.findIndex(t => t.id === snapshot.id);
      if (index < 0 || JSON.stringify(next.transactions[index]) !== snapshot.original) throw new Error('Bu işlem başka bir yerde değişti veya silindi. Taslağınız korundu. İşlemi yeniden açıp güncel kaydı kontrol edin.');
      tx.createdAt = next.transactions[index].createdAt;
      next.transactions[index] = tx;
    } else next.transactions.push(tx);
    next.activeKasaId = snapshot.kasaId;
  }, { render: false, errorTarget: '#form-error' });
  if (!okay) return;
  draft = blankDraft(snapshot.kasaId);
  if (another) { draft.type = snapshot.type; draft.date = snapshot.date; }
  currentTab = another ? 'add' : 'list';
  render();
  toast(snapshot.id ? 'Değişiklikler kaydedildi' : 'İşlem kaydedildi');
  if (another) $('#form-amount').focus();
}
function moveModal(type, sourceId, deleting = false) {
  const tx = type === 'transaction' ? state.transactions.find(t => t.id === sourceId) : null;
  const source = state.kasalar.find(k => k.id === (tx ? tx.kasaId : sourceId));
  if (!source) return;
  if (state.kasalar.length < 2) { notice('İşlemleri taşımak için önce başka bir hesap oluşturun.'); return; }
  const count = tx ? 1 : state.transactions.filter(t => t.kasaId === source.id).length;
  openModal('İşlemleri başka hesaba taşı', `<p><strong>${esc(source.name)}</strong> hesabından ${count} işlem taşınacak.</p><p class="field-hint">İşlemlerin hesap bağlantısı değişir; yeni gelir veya gider oluşmaz. Alt hesapların işlemleri taşınmaz.</p><form id="move-form" data-kind="${type}" data-id="${esc(sourceId)}"><div class="field"><label for="move-target">Hedef hesap</label><select id="move-target">${accountOptions('', new Set([source.id]))}</select></div>${type === 'account' ? `<label class="check-field"><input type="checkbox" id="delete-source" ${deleting ? 'checked' : ''}>Taşıdıktan sonra kaynak hesabı sil</label><p class="field-hint">Kaynak silinirse alt hesapları bir üst seviyeye alınır.</p>` : ''}<p id="move-error" class="inline-error" role="alert" tabindex="-1"></p><button type="submit" class="primary-button" data-save>İşlemleri taşı</button></form>`);
}
function removeAccount(next, id) {
  const account = next.kasalar.find(k => k.id === id);
  if (!account) throw new Error('Hesap bulunamıyor.');
  next.kasalar = next.kasalar.filter(k => k.id !== id).map(k => k.parentId === id ? { ...k, parentId: account.parentId } : k);
  if (next.activeKasaId === id) next.activeKasaId = next.kasalar[0]?.id || null;
}
async function saveMove(form) {
  const target = $('#move-target').value, sourceId = form.dataset.id, type = form.dataset.kind;
  const deleting = Boolean($('#delete-source')?.checked);
  if (!confirm('Seçilen işlemler hedef hesaba taşınsın mı?' + (deleting ? ' Kaynak hesap da silinecek.' : ''))) return;
  const okay = await commit(next => {
    if (!next.kasalar.some(k => k.id === target)) throw new Error('Hedef hesap bulunamıyor.');
    if (type === 'transaction') {
      const tx = next.transactions.find(t => t.id === sourceId);
      if (!tx || tx.kasaId === target) throw new Error('Kaynak ve hedef hesapları kontrol edin.');
      tx.kasaId = target;
    } else {
      if (sourceId === target) throw new Error('Kaynak ve hedef aynı olamaz.');
      next.transactions.forEach(t => { if (t.kasaId === sourceId) t.kasaId = target; });
      if (deleting) removeAccount(next, sourceId);
    }
  }, { errorTarget: '#move-error' });
  if (okay) { closeModal(); toast('İşlemler taşındı'); }
}
function downloadText(text, name, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportData() {
  if (loadError) { notice('Mevcut kayıt açılamadı. Önce ayarlardan ham kaydı indirin.', true); return; }
  downloadText(JSON.stringify({ ...state, exportDate: new Date().toISOString() }, null, 2), `kasa-pro-yedek-${today()}.json`);
  toast('Yedek indirmesi başlatıldı');
}
function settingsModal() {
  const chars = storedRaw?.length || 0;
  let oldRecovery = null;
  try { oldRecovery = localStorage.getItem('kasa-pro-recovery-v1'); } catch (_) { /* Current recovery is still available. */ }
  openModal('Ayarlar ve yedekleme', `<div class="storage-info"><strong>Veriler yalnızca bu tarayıcıda saklanır</strong><p>Hesaplar, işlemler ve belgeler için düzenli JSON yedeği alın. Tarayıcı verilerini temizlemek kayıtları siler.</p><small>Bu uygulamanın yaklaşık depolama kullanımı: ${(chars * 2 / 1024 / 1024).toFixed(2)} MB</small></div>
    <div class="settings-actions"><button class="tx-row" data-action="export-data"><span class="tx-icon income" aria-hidden="true">↓</span><span><strong>Yedek indir</strong><small>Hesaplar, işlemler ve belgeler</small></span></button><label class="tx-row import-label" for="import-input"><span class="tx-icon income" aria-hidden="true">↑</span><span><strong>Yedek yükle</strong><small>Önce kontrol edilir, sonra onayınızla yüklenir</small></span><input id="import-input" type="file" accept="application/json,.json"></label><button class="tx-row" data-action="print-data"><span class="tx-icon" aria-hidden="true">▣</span><span><strong>İşlem listesini yazdır</strong><small>Seçili hesap ve mevcut filtreler</small></span></button>${recoveryRaw || oldRecovery ? '<button class="tx-row" data-action="download-recovery"><span class="tx-icon" aria-hidden="true">↶</span><span><strong>Önceki / ham kaydı indir</strong><small>Geçiş öncesindeki özgün veri</small></span></button>' : ''}</div><p id="settings-error" class="inline-error" role="alert" tabindex="-1"></p>`);
}
async function inspectImport(file) {
  if (!file) return;
  try {
    if (file.size > 25 * 1024 * 1024) throw new Error('Yedek dosyası 25 MB sınırını aşıyor.');
    const text = await file.text();
    const data = JSON.parse(text);
    const loaded = Core.normalizeState(data);
    pendingImport = loaded; importCheckpoint = false;
    const legacy = data.version !== 2;
    const rounded = legacy ? data.transactions.filter(t => Math.abs(t.amount - Core.roundCents(t.amount) / 100) > 1e-8).length : 0;
    openModal('Yedeği kontrol edin', `<div class="detail-list"><div class="detail-line"><span>Hesap</span><strong>${loaded.kasalar.length}</strong></div><div class="detail-line"><span>İşlem</span><strong>${loaded.transactions.length}</strong></div><div class="detail-line"><span>Belge</span><strong>${loaded.transactions.reduce((n, t) => n + t.attachments.length, 0)}</strong></div></div><p>Mevcut kayıtlar bu yedekle değiştirilecek. Devam etmeden önce mevcut kaydın yedeğini indirin.</p>${legacy ? `<p class="field-hint">Eski sürüm yedeği yeni biçime dönüştürülecek.${rounded ? ` ${rounded} tutar en yakın kuruşa yuvarlanacak.` : ''}</p>` : ''}<button class="secondary-button" data-action="backup-before-import">${loadError ? 'Mevcut ham kaydı indir' : 'Mevcut veriyi yedekle'}</button><p id="import-checkpoint-status" class="field-hint" role="status"></p><p id="import-error" class="inline-error" role="alert" tabindex="-1"></p>`, '<button class="secondary-button" data-action="close-modal">İptal</button><button class="danger-button" data-action="confirm-import" data-save disabled>Yedeği yükle</button>');
  } catch (error) { pendingImport = null; showError(error instanceof SyntaxError ? new Error('Dosya geçerli bir JSON yedeği değil.') : error, '#settings-error'); }
}
function calculatorModal() {
  calc = { display: '0', previous: null, operation: null, overwrite: false };
  openModal('Hesap makinesi', `<output id="calc-display" class="calculator-display" aria-live="polite">0</output><div class="keypad">${['C', '⌫', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', ',', '='].map((key, i) => `<button type="button" class="${i === 16 ? 'wide' : ''} ${[3, 7, 11, 15, 18].includes(i) ? 'op' : ''}" data-calc="${key}">${key}</button>`).join('')}</div><p id="calc-error" class="inline-error" role="alert" tabindex="-1"></p><button class="primary-button" data-action="use-calculator">Tutarı forma aktar</button>`);
}
function evaluate(a, b, op) {
  a = Number(a); b = Number(b);
  const result = op === '+' ? a + b : op === '−' ? a - b : op === '×' ? a * b : b === 0 ? NaN : a / b;
  return Number.isFinite(result) && Math.abs(result) <= Core.MAX_CENTS / 100 ? String(Number(result.toPrecision(15))) : 'Hata';
}
function calculatorAction(key) {
  if (key === 'C') calc = { display: '0', previous: null, operation: null, overwrite: false };
  else if (key === '⌫') { calc.display = calc.overwrite || calc.display === 'Hata' ? '0' : calc.display.slice(0, -1) || '0'; calc.overwrite = false; }
  else if (key === '%') { calc.display = String(Number(calc.display) / 100); calc.overwrite = true; }
  else if (['+', '−', '×', '÷'].includes(key)) {
    if (calc.previous !== null && !calc.overwrite) calc.display = evaluate(calc.previous, calc.display, calc.operation);
    calc.previous = calc.display; calc.operation = key; calc.overwrite = true;
  } else if (key === '=') {
    if (calc.previous !== null && !calc.overwrite) { calc.display = evaluate(calc.previous, calc.display, calc.operation); calc.previous = null; calc.operation = null; calc.overwrite = true; }
  } else {
    const char = key === ',' ? '.' : key;
    if (calc.overwrite || calc.display === 'Hata') { calc.display = char === '.' ? '0.' : char; calc.overwrite = false; }
    else if (char !== '.' || !calc.display.includes('.')) calc.display = calc.display === '0' && char !== '.' ? char : calc.display.length < 18 ? calc.display + char : calc.display;
  }
  $('#calc-display').textContent = calc.display.replace('.', ',');
  $('#calc-error').textContent = '';
}
function setDraftField(field, value) { draft[field] = value; draft.dirty = true; updateSaveButtons(); }
function preserveFocusRender() {
  const el = document.activeElement;
  const id = el?.id;
  const start = el && ['text', 'search'].includes(el.type) ? el.selectionStart : null;
  const end = el && ['text', 'search'].includes(el.type) ? el.selectionEnd : null;
  render();
  const replacement = id ? document.getElementById(id) : null;
  if (replacement) { replacement.focus({ preventScroll: true }); if (start !== null) replacement.setSelectionRange(start, end); }
}
async function readAttachments(files) {
  const currentDraft = draft;
  if (filePending) return;
  filePending = true;
  updateSaveButtons();
  try {
    const list = [...files];
    if (currentDraft.attachments.length + list.length > 20) throw new Error('Bir işleme en fazla 20 belge eklenebilir.');
    if (list.some(file => file.size > Core.MAX_FILE_BYTES)) throw new Error('Yeni dosyalar en fazla 1 MB olabilir. Daha küçük bir dosya seçin.');
    if (list.some(file => !Core.MIME_TYPES.has(file.type || 'application/octet-stream'))) throw new Error('Dosya türü desteklenmiyor. SVG ve HTML eklenemez.');
    const total = [...state.transactions.filter(t => t.id !== currentDraft.id).flatMap(t => t.attachments), ...currentDraft.attachments, ...list].reduce((sum, file) => sum + file.size, 0);
    if (total > 2 * 1024 * 1024) throw new Error('Yeni ekler için toplam belge sınırı 2 MB. Önce yedek alın ve gereksiz belgeleri kaldırın.');
    const added = [];
    for (const file of list) {
      const url = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reader.onabort = () => reject(new Error('Dosya okunamadı. Yeniden seçin.'));
        reader.readAsDataURL(file);
      });
      added.push(Core.attachment({ id: uid(), name: file.name, size: file.size, type: file.type || 'application/octet-stream', url }));
    }
    if (draft !== currentDraft) return;
    currentDraft.attachments.push(...added); currentDraft.dirty = true;
    if ($('#form-attachments')) $('#form-attachments').innerHTML = attachmentsHTML(draft.attachments, true);
    if ($('#file-error')) $('#file-error').textContent = '';
  } catch (error) { showError(error, '#file-error'); }
  finally { filePending = false; if ($('#file-input')) $('#file-input').value = ''; updateSaveButtons(); }
}

async function handleAction(button) {
  const action = button.dataset.action, id = button.dataset.id || button.dataset.accountId;
  if (action === 'toggle-filters') { filterExpanded = !filterExpanded; preserveFocusRender(); }
  else if (action === 'clear-filters') { filters = emptyFilters(); render(); $('#search-input')?.focus(); }
  else if (action === 'quick-date') {
    const now = today();
    filters.startDate = button.dataset.range === 'today' ? now : button.dataset.range === 'month' ? `${now.slice(0, 7)}-01` : '';
    filters.endDate = button.dataset.range === 'all' ? '' : now;
    render();
  } else if (action === 'open-flow') { currentTab = 'network'; closeAccountMenu(); render(); }
  else if (action === 'open-settings') settingsModal();
  else if (action === 'toggle-account-menu') {
    const menu = $('#account-menu'); menu.classList.toggle('hidden');
    $('#account-menu-button').setAttribute('aria-expanded', String(!menu.classList.contains('hidden')));
    if (!menu.classList.contains('hidden')) { menu.innerHTML = accountMenuHTML(); menu.querySelector('button')?.focus(); }
  } else if (action === 'add-account') accountModal(null, button.dataset.parentId);
  else if (action === 'edit-account') accountModal(id);
  else if (action === 'close-modal') { if (!saving) closeModal(); }
  else if (action === 'delete-account') {
    const account = state.kasalar.find(k => k.id === id);
    if (!account) return;
    if (state.transactions.some(t => t.kasaId === id)) { moveModal('account', id, true); return; }
    if (confirm(`“${account.name}” hesabı silinsin mi? Alt hesapları bir üst seviyeye alınır.`) && await commit(next => removeAccount(next, id))) toast('Hesap silindi');
  } else if (action === 'edit-transaction') {
    const tx = state.transactions.find(t => t.id === id); if (tx) editTransaction(tx);
  } else if (action === 'delete-transaction') {
    if (confirm('Bu işlem kalıcı olarak silinsin mi?') && await commit(next => { next.transactions = next.transactions.filter(t => t.id !== id); })) { closeModal(); toast('İşlem silindi'); }
  } else if (action === 'move-transaction') moveModal('transaction', id);
  else if (action === 'move-account-transactions') moveModal('account', id);
  else if (action === 'reset-draft') {
    if (draft.dirty && !confirm('Kaydedilmemiş değişiklikler silinsin mi?')) return;
    draft = blankDraft(state.activeKasaId); render(); $('#form-amount')?.focus();
  } else if (action === 'form-date') {
    const date = new Date(); date.setDate(date.getDate() + Number(button.dataset.offset));
    setDraftField('date', Core.localDate(date)); $('#form-date').value = draft.date;
  } else if (action === 'open-calculator') calculatorModal();
  else if (action === 'use-calculator') {
    if (calc.previous !== null && !calc.overwrite) calculatorAction('=');
    const result = Number(calc.display);
    if (!Number.isFinite(result) || result <= 0 || result > Core.MAX_CENTS / 100) { showError(new Error('Geçerli, pozitif bir sonuç hesaplayın.'), '#calc-error'); return; }
    const rounded = Core.roundCents(result);
    if (rounded <= 0) { showError(new Error('Sonuç en az 0,01 TL olmalı.'), '#calc-error'); return; }
    setDraftField('amount', Core.centsInput(rounded));
    closeModal(); if ($('#form-amount')) { $('#form-amount').value = draft.amount; $('#form-amount').focus(); }
    toast('Sonuç en yakın kuruşa yuvarlanarak aktarıldı');
  } else if (action === 'export-data') exportData();
  else if (action === 'download-recovery') {
    let raw = recoveryRaw;
    try { raw ||= localStorage.getItem('kasa-pro-recovery-v1'); } catch (_) { /* In-memory original is preferred. */ }
    if (raw) downloadText(raw, `kasa-pro-ham-kayit-${today()}.json`);
  } else if (action === 'backup-before-import') {
    if (storedRaw) downloadText(storedRaw, `kasa-pro-yukleme-oncesi-${today()}.json`);
    else downloadText(JSON.stringify(state, null, 2), `kasa-pro-yukleme-oncesi-${today()}.json`);
    importCheckpoint = true;
    $('#import-checkpoint-status').textContent = 'İndirme başlatıldı. Dosyanızı sakladıktan sonra yedeği yükleyin.';
    updateSaveButtons();
  } else if (action === 'confirm-import' && pendingImport && importCheckpoint) {
    if (draft.dirty && !confirm('Kaydedilmemiş işlem taslağı da silinecek. Yedek yüklensin mi?')) return;
    const loaded = pendingImport;
    if (await commit(next => Object.assign(next, loaded), { recovery: true, render: false, errorTarget: '#import-error' })) {
      draft = blankDraft(state.activeKasaId); filters = emptyFilters(); currentTab = 'network';
      $('#notice').classList.add('hidden'); closeModal(); render(); toast('Yedek doğrulanarak yüklendi');
    }
  } else if (action === 'print-data') {
    if (!activeAccount()) { notice('Önce bir hesap seçin.'); return; }
    closeModal(); currentTab = 'list'; render(); window.print();
  } else if (action === 'reload-data') reloadExternalData();
}
function closeAccountMenu() { $('#account-menu').classList.add('hidden'); $('#account-menu-button').setAttribute('aria-expanded', 'false'); }
async function selectAccount(id) {
  if (!state.kasalar.some(k => k.id === id)) return;
  if (await commit(next => { next.activeKasaId = id; }, { render: false })) {
    if (!draft.dirty && !draft.id) draft.kasaId = id;
    closeAccountMenu(); render();
    if (currentTab === 'add' && draft.kasaId !== id) toast('Taslak korundu. Kaydedilecek hesabı formdan seçebilirsiniz.');
  }
}
function reloadExternalData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const loaded = raw ? Core.normalizeState(JSON.parse(raw)) : emptyState();
    state = loaded; storedRaw = raw; externalChange = false; loadError = '';
    if (!draft.dirty && !draft.id) draft = blankDraft(state.activeKasaId);
    render(); toast('Güncel veriler yüklendi; açık taslağınız korundu');
  } catch (error) { showError(new Error(`Güncel kayıt açılamadı: ${error.message}`)); }
}

document.addEventListener('click', async event => {
  const target = event.target.closest('button, [data-tab]');
  if (!target || target.disabled) { if (!event.target.closest('#account-menu, #account-menu-button')) closeAccountMenu(); return; }
  try {
    if (target.dataset.action) { await handleAction(target); return; }
    if (target.dataset.tab) {
      currentTab = target.dataset.tab;
      if (currentTab === 'add' && !draft.kasaId) draft.kasaId = state.activeKasaId;
      render(); return;
    }
    if (target.dataset.selectAccount) { await selectAccount(target.dataset.selectAccount); return; }
    if (target.dataset.txId) {
      const tx = state.transactions.find(t => t.id === target.dataset.txId); if (tx) transactionModal(tx); return;
    }
    if (target.dataset.filterType) { filters.type = target.dataset.filterType; render(); return; }
    if (target.dataset.groupBy) { groupBy = target.dataset.groupBy; render(); return; }
    if (target.dataset.formType) {
      setDraftField('type', target.dataset.formType);
      render(); $(`[data-form-type="${draft.type}"]`)?.focus(); return;
    }
    if (target.dataset.description) { setDraftField('description', target.dataset.description); $('#form-description').value = draft.description; return; }
    if (target.dataset.removeAttachment) {
      setDraftField('attachments', draft.attachments.filter(a => a.id !== target.dataset.removeAttachment));
      $('#form-attachments').innerHTML = attachmentsHTML(draft.attachments, true); return;
    }
    if (target.dataset.downloadAttachment) {
      const file = state.transactions.flatMap(t => t.attachments).find(a => a.id === target.dataset.downloadAttachment);
      if (file) {
        // Download as a Blob, never navigate to user-supplied document URLs.
        const base64 = file.url.slice(file.url.indexOf(',') + 1), decoded = atob(base64);
        const bytes = Uint8Array.from(decoded, char => char.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
        const link = document.createElement('a'); link.href = url; link.download = file.name; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      return;
    }
    if (target.dataset.calc) calculatorAction(target.dataset.calc);
  } catch (error) { showError(error); }
});
document.addEventListener('submit', async event => {
  event.preventDefault();
  try {
    if (event.target.id === 'transaction-form') await saveTransaction(event.submitter?.name === 'saveAnother');
    if (event.target.id === 'account-form') await saveAccount(event.target);
    if (event.target.id === 'move-form') await saveMove(event.target);
  } catch (error) { showError(error); }
});
const draftFields = { 'form-amount': 'amount', 'form-customer': 'customerName', 'form-description': 'description', 'form-date': 'date', 'form-account': 'kasaId' };
const filterFields = { 'search-input': 'searchText', 'start-date': 'startDate', 'end-date': 'endDate', 'min-amount': 'minAmount', 'max-amount': 'maxAmount' };
document.addEventListener('input', event => {
  const el = event.target;
  if (draftFields[el.id]) setDraftField(draftFields[el.id], el.value);
  if (filterFields[el.id]) { filters[filterFields[el.id]] = el.value; preserveFocusRender(); }
});
document.addEventListener('change', async event => {
  const el = event.target;
  if (draftFields[el.id]) {
    setDraftField(draftFields[el.id], el.value);
    if (el.id === 'form-account') {
      $('#customer-suggestions').innerHTML = suggestions('customerName').map(s => `<option value="${esc(s)}"></option>`).join('');
      $('#description-chips').innerHTML = descriptionChips();
    }
  }
  if (el.id === 'file-input') await readAttachments(el.files);
  if (el.id === 'import-input') { importCheckpoint = false; await inspectImport(el.files[0]); if (el.isConnected) el.value = ''; }
});
document.addEventListener('keydown', event => {
  const modal = $('.modal');
  if (event.key === 'Escape') {
    if (modal && !saving) { event.preventDefault(); closeModal(); }
    else { closeAccountMenu(); $('#account-menu-button').focus(); }
    return;
  }
  if (modal && event.key === 'Tab') {
    const elements = [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]')].filter(el => el.getClientRects().length);
    if (!elements.length) { event.preventDefault(); modal.focus(); return; }
    const first = elements[0], last = elements.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === modal)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === modal)) { event.preventDefault(); first.focus(); }
  }
  if (modal && $('#calc-display') && !event.ctrlKey && !event.metaKey) {
    const mapped = { '*': '×', '/': '÷', '-': '−', '.': ',', Enter: '=', Backspace: '⌫', Delete: 'C' }[event.key] || event.key;
    if (/^\d$/.test(mapped) || ['×', '÷', '−', '+', ',', '=', '⌫', 'C', '%'].includes(mapped)) { event.preventDefault(); calculatorAction(mapped); }
  }
  if (!modal && currentTab === 'add' && (event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); saveTransaction(false); }
});
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  try { externalChange = localStorage.getItem(STORAGE_KEY) !== storedRaw; updateSyncBanner(); } catch (error) { showError(error); }
});
window.addEventListener('beforeunload', event => { if (draft.dirty || filePending || saving) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('error', event => { console.error(event.error); notice('Beklenmeyen bir hata oluştu. Kaydedilmemiş alanları kontrol edin; gerekirse yedek alın.', true); });
window.addEventListener('unhandledrejection', event => { console.error(event.reason); showError(new Error('İşlem tamamlanamadı. Kaydedilmemiş alanlarınızı kontrol edin.')); });

// Pointer events work on mouse and touch. Only the handle blocks scrolling.
(function installAccountDrag() {
  let drag = null, ignoreClickUntil = 0;
  function reset() {
    if (!drag) return;
    drag.node.classList.remove('bhu-moving');
    drag.target?.classList.remove('bhu-target', 'bhu-invalid');
    drag.ghost?.remove();
    try { drag.handle.releasePointerCapture(drag.pointer); } catch (_) { /* Pointer already released. */ }
    drag = null;
  }
  const nodeAt = (x, y) => document.elementFromPoint(x, y)?.closest('[data-drag-id]');
  document.addEventListener('pointerdown', event => {
    const handle = event.target.closest('[data-drag-handle]');
    if (!handle || drag || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const node = handle.closest('[data-drag-id]');
    drag = { pointer: event.pointerId, handle, node, id: node.dataset.dragId, x: event.clientX, y: event.clientY, active: false, target: null, ghost: null };
    handle.setPointerCapture(event.pointerId);
  });
  document.addEventListener('pointermove', event => {
    const item = drag;
    if (!item || item.pointer !== event.pointerId) return;
    if (!item.active && Math.hypot(event.clientX - item.x, event.clientY - item.y) < 6) return;
    if (!item.active) {
      item.active = true; item.node.classList.add('bhu-moving');
      item.ghost = document.createElement('div'); item.ghost.className = 'bhu-ghost'; item.ghost.textContent = item.node.querySelector('strong').textContent; document.body.appendChild(item.ghost);
    }
    if (event.cancelable) event.preventDefault();
    item.ghost.style.left = `${event.clientX}px`; item.ghost.style.top = `${event.clientY}px`;
    const next = nodeAt(event.clientX, event.clientY);
    if (next !== item.target) { item.target?.classList.remove('bhu-target', 'bhu-invalid'); item.target = next; }
    if (next) { const invalid = descendants(item.id).has(next.dataset.dragId); next.classList.toggle('bhu-invalid', invalid); next.classList.toggle('bhu-target', !invalid); }
    const panel = $('.network-panel');
    if (panel) { const rect = panel.getBoundingClientRect(); if (event.clientX > rect.right - 35) panel.scrollLeft += 12; if (event.clientX < rect.left + 35) panel.scrollLeft -= 12; }
  }, { passive: false });
  document.addEventListener('pointerup', async event => {
    const item = drag;
    if (!item || item.pointer !== event.pointerId) return;
    const active = item.active;
    const target = active ? nodeAt(event.clientX, event.clientY) : null;
    const inRoot = active && document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-drop-root]');
    const sourceId = item.id, targetId = target?.dataset.dragId || null;
    reset(); if (!active) return;
    ignoreClickUntil = Date.now() + 500;
    if (targetId && descendants(sourceId).has(targetId)) { toast('Hesap kendi içine veya altına taşınamaz'); return; }
    if (!targetId && !inRoot) return;
    if (await commit(next => { const account = next.kasalar.find(k => k.id === sourceId); if (!account) throw new Error('Hesap bulunamadı.'); account.parentId = targetId; })) toast(targetId ? 'Hesap hiyerarşisi güncellendi' : 'Hesap ana seviyeye taşındı');
  });
  document.addEventListener('pointercancel', reset);
  window.addEventListener('blur', reset);
  document.addEventListener('click', event => { if (Date.now() < ignoreClickUntil && event.target.closest('[data-drag-id]')) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
})();

let importCheckpoint = false;
loadInitialState();
render();
if (loadError) notice(loadError, true);
else if (recoveryRaw) notice('Eski kayıtlarınız açıldı. Tutarlar kuruş hassasiyetine dönüştürüldü; özgün kaydı ayarlardan indirebilirsiniz. İlk değişiklikte yeni biçim kaydedilir.', true);
