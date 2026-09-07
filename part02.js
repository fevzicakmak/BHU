function depth(kasa) { let count = 0, parent = kasa.parentId, guard = new Set(); while (parent && !guard.has(parent)) { guard.add(parent); const found = state.kasalar.find(k => k.id === parent); if (!found) break; count++; parent = found.parentId; } return count; }
function sortedAccounts() { const result = []; const append = parent => state.kasalar.filter(k => (k.parentId && state.kasalar.some(p => p.id === k.parentId) ? k.parentId : null) === parent).sort((a,b) => a.createdAt.localeCompare(b.createdAt)).forEach(k => { result.push(k); append(k.id); }); append(null); return result; }
function loadState() { try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); if (saved && Array.isArray(saved.kasalar) && Array.isArray(saved.transactions)) return normalizeState(saved); } catch (_) {} return { kasalar: [], transactions: [], activeKasaId: null }; }
function normalizeState(value) { const kasalar = value.kasalar.map(k => ({ ...k, parentId: k.parentId ?? null, includeInParentTotals: k.includeInParentTotals !== false })); return { kasalar, transactions: Array.isArray(value.transactions) ? value.transactions : [], activeKasaId: kasalar.some(k => k.id === value.activeKasaId) ? value.activeKasaId : (kasalar[0]?.id || null) }; }
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function commit() { save(); render(); }
function setNotice(message) { const el = document.querySelector('#notice'); el.textContent = message; el.classList.remove('hidden'); clearTimeout(setNotice.timer); setNotice.timer = setTimeout(() => el.classList.add('hidden'), 4500); }
function toast(message) { const old = document.querySelector('.toast'); if (old) old.remove(); const el = document.createElement('div'); el.className = 'toast'; el.textContent = message; document.body.appendChild(el); setTimeout(() => el.remove(), 2600); }
function iconFor(type) { return type === 'income' ? '↗' : '↘'; }
function suggestionsFor(kind, value, kasaId) { const past = new Set(state.transactions.filter(t => !kasaId || descendants(kasaId).has(t.kasaId)).map(t => kind === 'customer' ? t.customerName : t.description).filter(Boolean)); const common = kind === 'description' ? (value === 'expense' ? commonExpense : commonIncome) : []; return [...past, ...common.filter(x => !past.has(x))]; }

function render() {
  const account = activeKasa();
  document.querySelector('#active-kasa-label').textContent = account ? `${account.name}${includedCount(account.id) ? ` · ${includedCount(account.id)} alt hesap dahil` : ''}` : 'Hesap seçilmedi';
  document.querySelector('#account-button-label').textContent = account?.name || 'Hesap Seç';
  const empty = document.querySelector('#empty-state'); const dashboard = document.querySelector('#dashboard'); const nav = document.querySelector('#bottom-nav');
