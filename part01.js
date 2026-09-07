const STORAGE_KEY = 'kasa-pro-data-v1';
const state = loadState();
let currentTab = 'list';
let filters = { searchText: '', startDate: '', endDate: '', minAmount: '', maxAmount: '', type: 'all' };
let groupBy = 'daily';
let filterExpanded = false;
let activeModal = null;
let calc = { display: '0', previous: null, operation: null, overwrite: false, returnTo: null };

const commonIncome = ['Satış', 'Hizmet bedeli', 'Tahsilat', 'Maaş', 'İade', 'Diğer gelir'];
const commonExpense = ['Kira', 'Fatura', 'Malzeme', 'Ulaşım', 'Yemek', 'Maaş ödemesi', 'Diğer gider'];
const commonAccounts = ['Nakit Kasa', 'Banka Hesabı', 'Garanti Bankası', 'İş Bankası', 'Kredi Kartı', 'Satış Ekibi'];

function id() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 9); }
function today() { return new Date().toISOString().slice(0, 10); }
function money(value) { return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2 }).format(value || 0); }
function number(value) { return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0); }
function dateText(value, long = false) { return new Intl.DateTimeFormat('tr-TR', long ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value)); }
function escapeHTML(value) { return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
function normalizeName(value) { return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR'); }
function duplicateName(name, except) { return state.kasalar.find(k => k.id !== except && normalizeName(k.name) === normalizeName(name)); }
function hasDuplicateNames(accounts) { const names = new Set(); return accounts.some(k => { const name = normalizeName(k.name); if (!name || names.has(name)) return true; names.add(name); return false; }); }
function activeKasa() { return state.kasalar.find(k => k.id === state.activeKasaId); }
function descendants(kasaId, includedOnly = false) { const result = new Set([kasaId]); let changed = true; while (changed) { changed = false; state.kasalar.forEach(k => { if (k.parentId && result.has(k.parentId) && !result.has(k.id) && (!includedOnly || k.includeInParentTotals !== false)) { result.add(k.id); changed = true; } }); } return result; }
function kasaTransactions(kasaId) { const ids = descendants(kasaId, true); return state.transactions.filter(t => ids.has(t.kasaId)); }
function allDescendantIds(kasaId) { return descendants(kasaId, false); }
function balance(kasaId) { return kasaTransactions(kasaId).reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0); }
