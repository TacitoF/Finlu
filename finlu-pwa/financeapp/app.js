'use strict';

const SUPABASE_URL      = 'https://cayalobqzlvobhyjrpht.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_aLSU2zrT7TlIfxbFHH5M4w_RC-EMQ_E';

const Cloud = (() => {
  let _client = null;
  let _user   = null;
  const _configured = SUPABASE_URL !== 'YOUR_SUPABASE_URL' && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY';

  function client() {
    if (!_configured) return null;
    if (!_client && window.supabase) _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return _client;
  }

  function isConfigured() { return _configured && !!window.supabase; }
  function currentUser()  { return _user; }

  async function init(onAuthChange) {
    const sb = client();
    if (!sb) return;
    const { data: { session } } = await sb.auth.getSession();
    _user = session?.user ?? null;
    sb.auth.onAuthStateChange((event, sess) => {
      const u = sess?.user ?? null;
      // ignora SIGNED_IN logo apos signup com email ainda nao confirmado
      if (event === 'SIGNED_IN' && u && !u.confirmed_at) return;
      _user = u;
      if (onAuthChange) onAuthChange(_user);
    });
    return _user;
  }

  async function signup(email, password) {
    const sb = client();
    if (!sb) throw new Error('Supabase não configurado');
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) throw error;
    // retorna o objeto completo para verificarmos se a sessão foi gerada
    return data; 
  }

  async function signup(email, password) {
    const sb = client();
    if (!sb) throw new Error('Supabase não configurado');
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) throw error;
    // nao seta _user — so seta apos confirmacao via login explicito
    return data.user;
  }

  async function logout() {
    const sb = client();
    if (!sb) return;
    await sb.auth.signOut();
    _user = null;
  }

  // upsert é idempotente — pode rodar multiplas vezes sem duplicar
  async function pushAll(state) {
    const sb = client();
    if (!sb || !_user) return { ok: false, reason: 'not_logged_in' };
    const uid = _user.id;
    const [r1, r2, r3, r4] = await Promise.all([
      sb.from('finlu_transactions').upsert(state.transactions.map(t => ({ ...t, user_id: uid })), { onConflict: 'id' }),
      sb.from('finlu_budgets').upsert(state.budgets.map(b => ({ ...b, user_id: uid })),           { onConflict: 'id' }),
      sb.from('finlu_goals').upsert(state.goals.map(g => ({ ...g, user_id: uid })),               { onConflict: 'id' }),
      sb.from('finlu_settings').upsert([{ user_id: uid, data: JSON.stringify(state.settings) }],  { onConflict: 'user_id' }),
    ]);
    const errors = [r1, r2, r3, r4].filter(r => r.error).map(r => r.error.message);
    if (errors.length) return { ok: false, reason: errors.join('; ') };
    return { ok: true };
  }

  // cloud prevalece em conflito de ID; mescla local + remoto
  async function pullAll(localState) {
    const sb = client();
    if (!sb || !_user) return null;
    const uid = _user.id;
    const [r1, r2, r3, r4] = await Promise.all([
      sb.from('finlu_transactions').select('*').eq('user_id', uid),
      sb.from('finlu_budgets').select('*').eq('user_id', uid),
      sb.from('finlu_goals').select('*').eq('user_id', uid),
      sb.from('finlu_settings').select('data').eq('user_id', uid).single(),
    ]);
    if (r1.error && r1.error.code !== 'PGRST116') return null;
    const cloudTxs = (r1.data || []).map(({ user_id, ...rest }) => rest);
    return {
      transactions: [...cloudTxs, ...localState.transactions.filter(t => !cloudTxs.find(c => c.id === t.id))],
      budgets:  (r2.data || []).map(({ user_id, ...rest }) => rest),
      goals:    (r3.data || []).map(({ user_id, ...rest }) => rest),
      settings: r4.data ? JSON.parse(r4.data.data) : null,
    };
  }

  return { isConfigured, currentUser, init, login, signup, logout, pushAll, pullAll };
})();

const DB = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} },
  keys: {
    SETTINGS:     'finlu_settings',
    TRANSACTIONS: 'finlu_txs',
    BUDGETS:      'finlu_budgets',
    GOALS:        'finlu_goals',
    CATEGORIES:   'finlu_categories',
    ONBOARDED:    'finlu_onboarded',
  }
};

const DEFAULT_CATS = [
  { id: 'alimentacao', name: 'Alimentação',    icon: 'ti-shopping-cart',  color: '#F59E0B', type: 'expense' },
  { id: 'transporte',  name: 'Transporte',     icon: 'ti-car',            color: '#3B82F6', type: 'expense' },
  { id: 'moradia',     name: 'Moradia',        icon: 'ti-building',       color: '#8B5CF6', type: 'expense' },
  { id: 'saude',       name: 'Saúde',          icon: 'ti-heart-rate-monitor', color: '#EF4444', type: 'expense' },
  { id: 'lazer',       name: 'Lazer',          icon: 'ti-device-gamepad', color: '#10B981', type: 'expense' },
  { id: 'educacao',    name: 'Educação',       icon: 'ti-book',           color: '#6366F1', type: 'expense' },
  { id: 'roupas',      name: 'Roupas',         icon: 'ti-hanger',         color: '#EC4899', type: 'expense' },
  { id: 'tecnologia',  name: 'Tecnologia',     icon: 'ti-device-laptop',  color: '#14B8A6', type: 'expense' },
  { id: 'outros_exp',  name: 'Outros',         icon: 'ti-box',            color: '#94A3B8', type: 'expense' },
  { id: 'salario',     name: 'Salário',        icon: 'ti-briefcase',      color: '#10B981', type: 'income' },
  { id: 'freelance',   name: 'Freelance',      icon: 'ti-device-desktop', color: '#3B82F6', type: 'income' },
  { id: 'investimento',name: 'Investimentos',  icon: 'ti-trending-up',    color: '#F59E0B', type: 'income' },
  { id: 'outros_inc',  name: 'Outras receitas',icon: 'ti-coins',          color: '#94A3B8', type: 'income' },
];

const DEFAULT_SETTINGS = {
  name: '', income: 0, theme: 'dark', currency: 'BRL', installDismissed: false
};

let S = {
  settings:      DB.get(DB.keys.SETTINGS, { ...DEFAULT_SETTINGS }),
  transactions:  DB.get(DB.keys.TRANSACTIONS, []),
  budgets:       DB.get(DB.keys.BUDGETS, []),
  goals:         DB.get(DB.keys.GOALS, []),
  categories:    DB.get(DB.keys.CATEGORIES, DEFAULT_CATS),
  currentPage:   'home',
  txFilter:      'all',
  reportMonths:  3,
  editingGoalId: null,
  // mês visualizado: offset relativo ao mês atual (0 = atual, -1 = anterior, +1 = próximo)
  monthOffset:   0,
};

function save() {
  DB.set(DB.keys.SETTINGS,     S.settings);
  DB.set(DB.keys.TRANSACTIONS, S.transactions);
  DB.set(DB.keys.BUDGETS,      S.budgets);
  DB.set(DB.keys.GOALS,        S.goals);
  DB.set(DB.keys.CATEGORIES,   S.categories);
  if (Cloud.currentUser()) {
    Cloud.pushAll(S)
      .then(r => { if (r.ok) updateSyncStatusUI('online'); else updateSyncStatusUI('error'); })
      .catch(() => updateSyncStatusUI('error'));
  }
}

// --- utilitários ---

function fmt(amount) {
  const sym = { BRL: 'R$', USD: '$', EUR: '€' }[S.settings.currency] || 'R$';
  return `${sym} ${(Number(amount) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function todayISO() { return new Date().toISOString().slice(0, 10); }

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function initials(name) {
  if (!name) return '?';
  return name.trim().split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function getCategory(id) {
  return S.categories.find(c => c.id === id) || { name: 'Outros', icon: 'ti-box', color: '#94A3B8' };
}

// retorna { year, month } para o mês visualizado (month = 0-11)
function viewedMonthYM() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + S.monthOffset);
  return { year: d.getFullYear(), month: d.getMonth() };
}

// retorna o intervalo ISO do mês visualizado
function viewedMonthRange() {
  const { year, month } = viewedMonthYM();
  const start = new Date(year, month, 1).toISOString().slice(0, 10);
  const end   = new Date(year, month + 1, 0).toISOString().slice(0, 10);
  return { start, end };
}

function currentMonthRange() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  return {
    start: new Date(y, m, 1).toISOString().slice(0, 10),
    end:   new Date(y, m + 1, 0).toISOString().slice(0, 10),
  };
}

function getMonthRange(months) {
  const end   = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - months + 1);
  start.setDate(1);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function filterTxByRange(start, end) {
  return S.transactions.filter(t => t.date >= start && t.date <= end);
}

function fmtMonthLabel(offset) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function toast(msg, duration = 2500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), duration);
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ícone de categoria: usa classe Tabler em vez de emoji
function catIcon(cat) {
  return `<i class="ti ${cat.icon || 'ti-box'}" aria-hidden="true"></i>`;
}

// --- navegação entre meses ---

function renderMonthNav(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const isCurrentMonth = S.monthOffset === 0;
  const isFuture = S.monthOffset > 0;
  el.innerHTML = `
    <div class="month-nav" role="group" aria-label="Navegação de mês">
      <button class="month-nav-btn" id="${containerId}-prev" aria-label="Mês anterior">
        <i class="ti ti-chevron-left" aria-hidden="true"></i>
      </button>
      <div class="month-nav-label">
        <span class="month-nav-title">${fmtMonthLabel(S.monthOffset)}</span>
        ${!isCurrentMonth ? `<button class="month-nav-today" aria-label="Voltar para o mês atual">Hoje</button>` : ''}
        ${isFuture ? `<span class="month-nav-badge">futuro</span>` : ''}
      </div>
      <button class="month-nav-btn" id="${containerId}-next" aria-label="Próximo mês">
        <i class="ti ti-chevron-right" aria-hidden="true"></i>
      </button>
    </div>`;

  el.querySelector(`#${containerId}-prev`).addEventListener('click', () => {
    S.monthOffset--;
    renderPage(S.currentPage);
  });
  el.querySelector(`#${containerId}-next`).addEventListener('click', () => {
    S.monthOffset++;
    renderPage(S.currentPage);
  });
  const todayBtn = el.querySelector('.month-nav-today');
  if (todayBtn) todayBtn.addEventListener('click', () => { S.monthOffset = 0; renderPage(S.currentPage); });
}

// swipe horizontal para trocar mês na página principal
function setupMonthSwipe(pageEl) {
  let startX = 0;
  pageEl.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
  pageEl.addEventListener('touchend', e => {
    const dx = startX - e.changedTouches[0].clientX;
    if (Math.abs(dx) < 50) return;
    S.monthOffset += dx > 0 ? 1 : -1;
    renderPage(S.currentPage);
  }, { passive: true });
}

// --- navegação de páginas ---

function navigate(page) {
  S.currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pg = document.getElementById(`page-${page}`);
  if (pg) pg.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === page);
    n.setAttribute('aria-current', n.dataset.page === page ? 'page' : 'false');
  });
  document.querySelectorAll('.sb-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === page);
    n.setAttribute('aria-current', n.dataset.page === page ? 'page' : 'false');
  });
  const titles = { home: 'Início', transactions: 'Transações', budget: 'Orçamento', goals: 'Metas', reports: 'Relatórios', settings: 'Configurações' };
  document.getElementById('page-title').textContent = titles[page] || '';
  closeSidebar();
  renderPage(page);
}

function renderPage(page) {
  switch (page) {
    case 'home':         renderHome(); break;
    case 'transactions': renderTransactions(); break;
    case 'budget':       renderBudget(); break;
    case 'goals':        renderGoals(); break;
    case 'reports':      renderReports(); break;
    case 'settings':     renderSettings(); break;
  }
}

// --- sidebar ---

function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar').setAttribute('aria-hidden', 'false');
  document.getElementById('sidebar-overlay').classList.remove('hidden');
  document.getElementById('menu-btn').setAttribute('aria-expanded', 'true');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar').setAttribute('aria-hidden', 'true');
  document.getElementById('sidebar-overlay').classList.add('hidden');
  document.getElementById('menu-btn').setAttribute('aria-expanded', 'false');
}

// --- página inicial ---

function renderHome() {
  renderMonthNav('home-month-nav');
  setupMonthSwipe(document.getElementById('page-home'));
  const { start, end } = viewedMonthRange();
  const txs     = filterTxByRange(start, end);
  const income  = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;

  document.getElementById('balance-display').textContent   = fmt(balance);
  document.getElementById('home-income').textContent       = fmt(income);
  document.getElementById('home-expense').textContent      = fmt(expense);
  document.getElementById('balance-display').style.color   = balance >= 0 ? '#fff' : '#fca5a5';

  renderDonutHome(txs);
  renderHomeBudgets(txs);
  renderHomeTransactions();
  renderHomeGoals();
}

function renderDonutHome(txs) {
  const byCat = {};
  txs.filter(t => t.type === 'expense').forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const total   = entries.reduce((s, e) => s + e[1], 0);
  const canvas  = document.getElementById('donut-home');
  const legend  = document.getElementById('donut-legend');

  if (!entries.length) {
    canvas.style.display = 'none';
    legend.innerHTML = '<div style="color:var(--c-muted);font-size:13px;padding:.5rem 0">Nenhum gasto registrado</div>';
    return;
  }
  canvas.style.display = '';
  if (canvas._chart) canvas._chart.destroy();
  canvas._chart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: entries.map(([id]) => getCategory(id).name),
      datasets: [{ data: entries.map(([, v]) => v), backgroundColor: entries.map(([id]) => getCategory(id).color), borderWidth: 0, hoverOffset: 4 }]
    },
    options: { cutout: '72%', responsive: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${fmt(ctx.raw)} (${Math.round(ctx.raw / total * 100)}%)` } } } }
  });
  legend.innerHTML = entries.map(([id, v]) => {
    const cat = getCategory(id);
    return `<div class="dleg-item"><span class="dleg-dot" style="background:${cat.color}"></span><span>${cat.name}</span><span class="dleg-val">${Math.round(v / total * 100)}%</span></div>`;
  }).join('');
}

function renderHomeBudgets(txs) {
  const el = document.getElementById('home-budgets');
  const budgets = S.budgets.slice(0, 3);
  if (!budgets.length) { el.innerHTML = '<p style="color:var(--c-muted);font-size:13px;padding:.25rem 0 1rem">Nenhum orçamento criado.</p>'; return; }
  el.innerHTML = budgets.map(b => budgetItemHTML(b, txs)).join('');
}

function budgetItemHTML(b, txs) {
  const cat   = getCategory(b.category);
  const spent = txs
    ? txs.filter(t => t.type === 'expense' && t.category === b.category).reduce((s, t) => s + t.amount, 0)
    : (() => { const { start, end } = viewedMonthRange(); return filterTxByRange(start, end).filter(t => t.type === 'expense' && t.category === b.category).reduce((s, t) => s + t.amount, 0); })();
  const pct       = b.limit > 0 ? Math.min(spent / b.limit * 100, 100) : 0;
  const fillClass = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok';
  return `<div class="budget-item" role="listitem">
    <div class="budget-top">
      <div class="budget-name"><i class="ti ${cat.icon || 'ti-box'}" aria-hidden="true"></i> ${cat.name}</div>
      <div class="budget-amounts"><strong>${fmt(spent)}</strong> / ${fmt(b.limit)}</div>
    </div>
    <div class="budget-bar"><div class="budget-fill ${fillClass}" style="width:${pct}%"></div></div>
    <div class="budget-pct">${Math.round(pct)}% utilizado</div>
  </div>`;
}

function renderHomeTransactions() {
  const { start, end } = viewedMonthRange();
  const el     = document.getElementById('home-transactions');
  const recent = filterTxByRange(start, end).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  el.innerHTML = recent.length ? recent.map(t => txItemHTML(t)).join('') : '<p style="color:var(--c-muted);font-size:13px;padding:.25rem 0 1rem">Nenhuma transação neste mês.</p>';
}

function renderHomeGoals() {
  const el = document.getElementById('home-goals');
  if (!S.goals.length) { el.innerHTML = '<p style="color:var(--c-muted);font-size:13px;padding:.25rem 0 1rem">Nenhuma meta criada.</p>'; return; }
  el.innerHTML = S.goals.slice(0, 2).map(goalCardHTML).join('');
  setupGoalButtons();
}

// --- transações ---

function renderTransactions() {
  renderMonthNav('tx-month-nav');
  setupMonthSwipe(document.getElementById('page-transactions'));
  const { start, end } = viewedMonthRange();
  let txs = filterTxByRange(start, end).sort((a, b) => b.date.localeCompare(a.date));
  if (S.txFilter !== 'all') txs = txs.filter(t => t.type === S.txFilter);
  const q = document.getElementById('tx-search')?.value.trim().toLowerCase();
  if (q) txs = txs.filter(t => t.description.toLowerCase().includes(q) || getCategory(t.category).name.toLowerCase().includes(q));

  const list  = document.getElementById('tx-page-list');
  const empty = document.getElementById('tx-empty');
  if (!txs.length) { list.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  list.innerHTML = txs.map(t => txItemHTML(t, true)).join('');
  setupTxSwipe();
}

function txItemHTML(t, withDelete = false) {
  const cat   = getCategory(t.category);
  const sign  = t.type === 'income' ? '+' : '-';
  // badge de parcela: ex "2/6"
  const installBadge = t.installment_index && t.installment_total
    ? `<span class="tx-installment-badge">${t.installment_index}/${t.installment_total}</span>` : '';
  // badge de débito futuro
  const futureBadge  = t.debit_type === 'debit' && t.date > todayISO()
    ? `<span class="tx-future-badge">débito</span>` : '';
  return `<div class="tx-item" data-id="${t.id}" role="listitem">
    <div class="tx-cat-icon" style="background:${cat.color}22"><i class="ti ${cat.icon || 'ti-box'}" aria-hidden="true"></i></div>
    <div class="tx-meta">
      <div class="tx-desc">${escapeHtml(t.description)}${installBadge}${futureBadge}</div>
      <div class="tx-sub">
        <span>${cat.name}</span><span>·</span><span>${fmtDate(t.date)}</span>
        ${t.note ? `<span>· ${escapeHtml(t.note)}</span>` : ''}
      </div>
    </div>
    <div class="tx-amount ${t.type}">${sign}${fmt(t.amount)}</div>
    ${withDelete ? `<div class="tx-delete-hint" onclick="deleteTx('${t.id}')"><i class="ti ti-trash" style="color:#fff;font-size:20px"></i></div>` : ''}
  </div>`;
}

function setupTxSwipe() {
  document.querySelectorAll('#tx-page-list .tx-item').forEach(el => {
    let startX = 0;
    el.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', e => {
      const dx = startX - e.changedTouches[0].clientX;
      // swipe curto horizontal muda mês — só ativa swipe para deletar se não houver conflito
      if (Math.abs(dx) < 60) return;
      if (dx > 0) el.classList.add('swiped');
      else el.classList.remove('swiped');
    }, { passive: true });
  });
}

window.deleteTx = function(id) {
  if (!confirm('Excluir esta transação?')) return;
  const tx = S.transactions.find(t => t.id === id);
  // se for parcela, pergunta se quer excluir todas do grupo
  if (tx?.installment_group) {
    const group    = S.transactions.filter(t => t.installment_group === tx.installment_group);
    const deleteAll = group.length > 1 && confirm(`Esta é uma transação parcelada (${group.length} parcelas). Excluir todas as parcelas?`);
    if (deleteAll) {
      S.transactions = S.transactions.filter(t => t.installment_group !== tx.installment_group);
      toast(`${group.length} parcelas excluídas`);
    } else {
      S.transactions = S.transactions.filter(t => t.id !== id);
      toast('Parcela excluída');
    }
  } else {
    S.transactions = S.transactions.filter(t => t.id !== id);
    toast('Transação excluída');
  }
  save();
  renderTransactions();
  if (S.currentPage === 'home') renderHome();
};

// --- orçamentos ---

function renderBudget() {
  const list  = document.getElementById('budget-list');
  const empty = document.getElementById('budget-empty');
  if (!S.budgets.length) { list.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  const { start, end } = viewedMonthRange();
  const txs = filterTxByRange(start, end);
  list.innerHTML = S.budgets.map(b => `
    <div class="budget-item" role="listitem" style="position:relative">
      ${budgetItemHTML(b, txs)}
      <div style="display:flex;gap:8px;margin-top:.75rem">
        <button onclick="deleteBudget('${b.id}')" class="btn-sm" style="color:var(--c-red)" aria-label="Excluir orçamento de ${getCategory(b.category).name}">
          <i class="ti ti-trash" aria-hidden="true"></i> Excluir
        </button>
      </div>
    </div>`).join('');
  setupCatSelects();
}

window.deleteBudget = function(id) {
  if (!confirm('Excluir este orçamento?')) return;
  S.budgets = S.budgets.filter(b => b.id !== id);
  save(); renderBudget(); toast('Orçamento excluído');
};

// --- metas ---

function goalCardHTML(g) {
  const pct      = g.target > 0 ? Math.min(g.current / g.target * 100, 100) : 0;
  const deadline = g.deadline ? `Prazo: ${fmtDate(g.deadline)}` : 'Sem prazo';
  return `<div class="goal-card" role="listitem" data-goal-id="${g.id}">
    <div class="goal-header">
      <div class="goal-icon-wrap"><i class="ti ti-target" aria-hidden="true"></i></div>
      <div class="goal-info">
        <div class="goal-name">${escapeHtml(g.name)}</div>
        <div class="goal-date">${deadline}</div>
      </div>
      <button onclick="deleteGoal('${g.id}', event)" class="icon-btn" style="width:36px;height:36px;color:var(--c-muted)" aria-label="Excluir meta ${escapeHtml(g.name)}">
        <i class="ti ti-trash" aria-hidden="true"></i>
      </button>
    </div>
    <div class="goal-amounts">
      <span>Economizado: <strong>${fmt(g.current)}</strong></span>
      <span>Meta: ${fmt(g.target)}</span>
    </div>
    <div class="goal-bar"><div class="goal-fill" style="width:${pct}%"></div></div>
    <div class="goal-pct">${Math.round(pct)}% completo</div>
    <button class="goal-deposit-btn" data-goal-id="${g.id}" aria-label="Depositar na meta ${escapeHtml(g.name)}">
      <i class="ti ti-piggy-bank" aria-hidden="true"></i> Depositar
    </button>
  </div>`;
}

function renderGoals() {
  const list  = document.getElementById('goals-list');
  const empty = document.getElementById('goals-empty');
  if (!S.goals.length) { list.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  list.innerHTML = S.goals.map(goalCardHTML).join('');
  setupGoalButtons();
}

function setupGoalButtons() {
  document.querySelectorAll('.goal-deposit-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); openDepositModal(btn.dataset.goalId); });
  });
}

window.deleteGoal = function(id, e) {
  e.stopPropagation();
  if (!confirm('Excluir esta meta?')) return;
  S.goals = S.goals.filter(g => g.id !== id);
  save(); renderGoals(); renderHome(); toast('Meta excluída');
};

// --- relatórios ---

let barChart = null, pieChart = null;

function renderReports() {
  const { start, end } = getMonthRange(S.reportMonths);
  const txs     = filterTxByRange(start, end);
  const income  = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;
  const rate    = income > 0 ? Math.round(balance / income * 100) : 0;
  document.getElementById('report-income').textContent  = fmt(income);
  document.getElementById('report-expense').textContent = fmt(expense);
  document.getElementById('report-balance').textContent = fmt(balance);
  document.getElementById('report-rate').textContent    = `${rate}%`;
  renderBarChart(S.reportMonths);
  renderPieChart(txs);
  renderTopExpenses(txs);
}

function renderBarChart(months) {
  const labels = [], incomeData = [], expenseData = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const y = d.getFullYear(), m = d.getMonth();
    const start = new Date(y, m, 1).toISOString().slice(0, 10);
    const end   = new Date(y, m + 1, 0).toISOString().slice(0, 10);
    const txs   = filterTxByRange(start, end);
    labels.push(d.toLocaleDateString('pt-BR', { month: 'short' }));
    incomeData.push(txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0));
    expenseData.push(txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0));
  }
  const canvas = document.getElementById('bar-report');
  if (barChart) barChart.destroy();
  barChart = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Receitas', data: incomeData,  backgroundColor: 'rgba(16,185,129,.7)',  borderRadius: 4 },
      { label: 'Gastos',   data: expenseData, backgroundColor: 'rgba(239,68,68,.7)',   borderRadius: 4 }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)}` } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,.06)' }, ticks: { color: '#64748b', font: { size: 11 }, callback: v => 'R$' + (v/1000).toFixed(0) + 'k' } }
      }
    }
  });
}

function renderPieChart(txs) {
  const byCat   = {};
  txs.filter(t => t.type === 'expense').forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const total   = entries.reduce((s, [, v]) => s + v, 0);
  const canvas  = document.getElementById('pie-report');
  if (pieChart) pieChart.destroy();
  if (!entries.length) { canvas.parentElement.innerHTML = '<p style="color:var(--c-muted);font-size:13px;padding:1rem">Nenhum gasto neste período.</p>'; return; }
  pieChart = new Chart(canvas, {
    type: 'doughnut',
    data: { labels: entries.map(([id]) => getCategory(id).name), datasets: [{ data: entries.map(([, v]) => v), backgroundColor: entries.map(([id]) => getCategory(id).color), borderWidth: 0, hoverOffset: 6 }] },
    options: { cutout: '60%', responsive: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${fmt(ctx.raw)} (${Math.round(ctx.raw / total * 100)}%)` } } } }
  });
  document.getElementById('pie-legend').innerHTML = entries.map(([id, v]) => {
    const cat = getCategory(id);
    return `<div class="pie-leg-item"><span class="pie-leg-dot" style="background:${cat.color}"></span><span>${cat.name}</span><span class="pie-leg-pct" style="color:${cat.color}">${Math.round(v / total * 100)}%</span></div>`;
  }).join('');
}

function renderTopExpenses(txs) {
  const top = [...txs.filter(t => t.type === 'expense')].sort((a, b) => b.amount - a.amount).slice(0, 5);
  document.getElementById('top-expenses').innerHTML = top.length ? top.map(t => txItemHTML(t)).join('') : '<p style="color:var(--c-muted);font-size:13px">Nenhum gasto registrado.</p>';
}

// --- configurações ---

function renderSettings() {
  document.getElementById('settings-name-val').textContent   = S.settings.name || '—';
  document.getElementById('settings-income-val').textContent = fmt(S.settings.income);
  document.getElementById('currency-select').value           = S.settings.currency;
  document.querySelectorAll('.toggle-opt').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === S.settings.theme);
    b.setAttribute('aria-checked', b.dataset.theme === S.settings.theme);
  });
  updateSyncStatusUI(Cloud.currentUser() ? 'online' : 'offline');
  renderCatList();
}

function renderCatList() {
  const el     = document.getElementById('cat-list');
  const custom = S.categories.filter(c => !DEFAULT_CATS.find(d => d.id === c.id));
  el.innerHTML = custom.map(c => `<div class="cat-item">
    <div class="cat-item-left"><i class="ti ${c.icon || 'ti-box'}" aria-hidden="true"></i><span>${escapeHtml(c.name)}</span></div>
    <button class="icon-btn" style="color:var(--c-red);width:36px;height:36px" onclick="deleteCat('${c.id}')" aria-label="Excluir categoria ${escapeHtml(c.name)}"><i class="ti ti-trash"></i></button>
  </div>`).join('');
  if (!custom.length) el.innerHTML = '<p style="color:var(--c-muted);font-size:13px">Nenhuma categoria personalizada.</p>';
}

window.deleteCat = function(id) {
  S.categories = S.categories.filter(c => c.id !== id);
  save(); renderCatList(); toast('Categoria excluída');
};

// --- modais ---

function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  setTimeout(() => {
    const firstInput = document.getElementById(id).querySelector('input, select');
    if (firstInput) firstInput.focus();
  }, 350);
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  document.body.style.overflow = '';
}

function openTxModal(type = 'expense', prefillDate) {
  populateCatSelect('tx-cat', type);
  // se vier de um mês futuro, pré-preenche a data com o primeiro dia do mês visualizado
  const dateVal = prefillDate || (S.monthOffset !== 0
    ? new Date(viewedMonthYM().year, viewedMonthYM().month, 1).toISOString().slice(0, 10)
    : todayISO());
  document.getElementById('tx-date').value      = dateVal;
  document.getElementById('tx-amount').value    = '';
  document.getElementById('tx-desc').value      = '';
  document.getElementById('tx-note').value      = '';
  document.getElementById('tx-installments').value = '1';
  document.getElementById('tx-debit-type').value   = 'none';
  document.getElementById('tx-installments-row').style.display = type === 'expense' ? '' : 'none';
  document.getElementById('tx-debit-row').style.display        = type === 'expense' ? '' : 'none';
  document.querySelectorAll('.type-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.type === type);
    b.setAttribute('aria-checked', b.dataset.type === type);
  });
  openModal('modal-tx');
}

document.getElementById('modal-tx-close').addEventListener('click', () => closeModal('modal-tx'));
document.getElementById('modal-tx').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal('modal-tx'); });

document.querySelectorAll('.type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.type-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-checked', 'false'); });
    btn.classList.add('active'); btn.setAttribute('aria-checked', 'true');
    const type = btn.dataset.type;
    populateCatSelect('tx-cat', type);
    // parcelas e débito só fazem sentido em gastos
    document.getElementById('tx-installments-row').style.display = type === 'expense' ? '' : 'none';
    document.getElementById('tx-debit-row').style.display        = type === 'expense' ? '' : 'none';
  });
});

document.getElementById('save-tx-btn').addEventListener('click', () => {
  const amount      = parseFloat(document.getElementById('tx-amount').value);
  const desc        = document.getElementById('tx-desc').value.trim();
  const cat         = document.getElementById('tx-cat').value;
  const date        = document.getElementById('tx-date').value;
  const note        = document.getElementById('tx-note').value.trim();
  const type        = document.querySelector('.type-btn.active').dataset.type;
  const installments = parseInt(document.getElementById('tx-installments').value) || 1;
  const debitType   = document.getElementById('tx-debit-type').value;

  if (!amount || amount <= 0) { toast('Informe um valor válido'); return; }
  if (!desc)                  { toast('Informe uma descrição'); return; }
  if (!date)                  { toast('Informe a data'); return; }

  if (type === 'expense' && installments > 1) {
    // gera uma transação por parcela, cada uma no mês correspondente
    const groupId    = uid();
    const baseDate   = new Date(date + 'T00:00:00');
    for (let i = 0; i < installments; i++) {
      const d = new Date(baseDate);
      d.setMonth(d.getMonth() + i);
      S.transactions.push({
        id: uid(), type, amount, description: desc, category: cat,
        date:               d.toISOString().slice(0, 10),
        note,
        installment_group:  groupId,
        installment_index:  i + 1,
        installment_total:  installments,
        debit_type:         'installment',
      });
    }
    toast(`${installments} parcelas adicionadas`);
  } else {
    S.transactions.push({
      id: uid(), type, amount, description: desc, category: cat, date, note,
      debit_type: type === 'expense' ? debitType : 'none',
    });
    toast(type === 'income' ? 'Receita adicionada' : 'Gasto adicionado');
  }

  save();
  closeModal('modal-tx');
  renderPage(S.currentPage);
  if (S.currentPage !== 'home') renderHome();
});

document.getElementById('add-budget-btn').addEventListener('click', () => {
  populateCatSelect('budget-cat', 'expense');
  document.getElementById('budget-limit').value = '';
  openModal('modal-budget');
});
document.getElementById('budget-empty-add')?.addEventListener('click', () => {
  populateCatSelect('budget-cat', 'expense');
  document.getElementById('budget-limit').value = '';
  openModal('modal-budget');
});
document.getElementById('modal-budget-close').addEventListener('click', () => closeModal('modal-budget'));
document.getElementById('modal-budget').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal('modal-budget'); });

document.getElementById('save-budget-btn').addEventListener('click', () => {
  const cat   = document.getElementById('budget-cat').value;
  const limit = parseFloat(document.getElementById('budget-limit').value);
  if (!limit || limit <= 0)                    { toast('Informe um valor válido'); return; }
  if (S.budgets.find(b => b.category === cat)) { toast('Orçamento já existe para esta categoria'); return; }
  S.budgets.push({ id: uid(), category: cat, limit });
  save(); closeModal('modal-budget'); toast('Orçamento criado'); renderPage(S.currentPage);
});

document.getElementById('add-goal-btn').addEventListener('click', () => {
  document.getElementById('goal-name').value     = '';
  document.getElementById('goal-target').value   = '';
  document.getElementById('goal-current').value  = '';
  document.getElementById('goal-deadline').value = '';
  openModal('modal-goal');
});
document.getElementById('goals-empty-add')?.addEventListener('click', () => document.getElementById('add-goal-btn').click());
document.getElementById('modal-goal-close').addEventListener('click', () => closeModal('modal-goal'));
document.getElementById('modal-goal').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal('modal-goal'); });

document.getElementById('save-goal-btn').addEventListener('click', () => {
  const name     = document.getElementById('goal-name').value.trim();
  const target   = parseFloat(document.getElementById('goal-target').value);
  const current  = parseFloat(document.getElementById('goal-current').value) || 0;
  const deadline = document.getElementById('goal-deadline').value;
  if (!name)                   { toast('Informe o nome da meta'); return; }
  if (!target || target <= 0)  { toast('Informe o valor objetivo'); return; }
  S.goals.push({ id: uid(), name, target, current, deadline });
  save(); closeModal('modal-goal'); toast('Meta criada'); renderPage(S.currentPage);
});

function openDepositModal(goalId) {
  S.editingGoalId = goalId;
  const g = S.goals.find(g => g.id === goalId);
  if (!g) return;
  document.getElementById('deposit-goal-name').textContent = g.name;
  document.getElementById('deposit-amount').value = '';
  openModal('modal-deposit');
}
document.getElementById('modal-deposit-close').addEventListener('click', () => closeModal('modal-deposit'));
document.getElementById('modal-deposit').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal('modal-deposit'); });
document.getElementById('save-deposit-btn').addEventListener('click', () => {
  const amount = parseFloat(document.getElementById('deposit-amount').value);
  if (!amount || amount <= 0) { toast('Informe um valor válido'); return; }
  const g = S.goals.find(g => g.id === S.editingGoalId);
  if (!g) return;
  g.current = Math.min(g.current + amount, g.target);
  save(); closeModal('modal-deposit');
  toast(g.current >= g.target ? 'Meta atingida!' : `R$ ${amount.toFixed(2)} depositado`);
  renderPage(S.currentPage);
  renderHome();
});

// --- selects de categoria ---

function populateCatSelect(selectId, type) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = S.categories.filter(c => c.type === type || !c.type)
    .map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

function setupCatSelects() {
  populateCatSelect('tx-cat', 'expense');
  populateCatSelect('budget-cat', 'expense');
}

// --- ações de configurações ---

document.getElementById('edit-name-btn').addEventListener('click', () => {
  const name = prompt('Seu nome:', S.settings.name);
  if (name !== null) { S.settings.name = name.trim(); save(); updateProfileUI(); renderSettings(); toast('Nome atualizado'); }
});

document.getElementById('edit-income-btn').addEventListener('click', () => {
  const val = prompt('Renda mensal (R$):', S.settings.income);
  if (val !== null) { S.settings.income = parseFloat(val) || 0; save(); updateProfileUI(); renderSettings(); toast('Renda atualizada'); }
});

document.querySelectorAll('.toggle-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.toggle-opt').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-checked', 'false'); });
    btn.classList.add('active'); btn.setAttribute('aria-checked', 'true');
    S.settings.theme = btn.dataset.theme;
    document.documentElement.setAttribute('data-theme', S.settings.theme);
    save();
  });
});

document.getElementById('currency-select').addEventListener('change', e => {
  S.settings.currency = e.target.value;
  save(); renderPage(S.currentPage); toast('Moeda atualizada');
});

document.getElementById('add-cat-btn').addEventListener('click', () => {
  const name = prompt('Nome da categoria:');
  if (!name?.trim()) return;
  const color = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  const type  = confirm('Esta categoria é de receita? (OK = Receita, Cancelar = Gasto)') ? 'income' : 'expense';
  S.categories.push({ id: uid(), name: name.trim(), icon: 'ti-box', color, type });
  save(); renderCatList(); toast('Categoria criada');
});

// --- importação CSV ---
// formato: ID, Tipo, Descrição, Categoria, Valor, Data, Nota — mesmo do export

function parseCSV(text) {
  const lines  = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('CSV vazio ou sem transações');
  const header   = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
  const required = ['id', 'tipo', 'valor', 'data'];
  const missing  = required.filter(r => !header.includes(r));
  if (missing.length) throw new Error(`Colunas ausentes: ${missing.join(', ')}`);
  const col          = name => header.indexOf(name);
  const transactions = [];
  const errors       = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const fields = []; let cur = '', inQ = false;
    for (let c = 0; c < line.length; c++) {
      if (line[c] === '"') { inQ = !inQ; continue; }
      if (line[c] === ',' && !inQ) { fields.push(cur); cur = ''; continue; }
      cur += line[c];
    }
    fields.push(cur);
    const id     = fields[col('id')]?.trim();
    const type   = fields[col('tipo')]?.trim().toLowerCase();
    const amount = parseFloat(fields[col('valor')]?.replace(',', '.'));
    const date   = fields[col('data')]?.trim();
    const desc   = fields[col('descrição') !== -1 ? col('descrição') : col('descricao')]?.trim() || 'Importado';
    const note   = col('nota') >= 0 ? (fields[col('nota')]?.trim() || '') : '';
    if (!id)                                  { errors.push(`Linha ${i+1}: ID ausente`); continue; }
    if (!['income','expense'].includes(type)) { errors.push(`Linha ${i+1}: tipo inválido`); continue; }
    if (isNaN(amount) || amount <= 0)         { errors.push(`Linha ${i+1}: valor inválido`); continue; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))   { errors.push(`Linha ${i+1}: data inválida`); continue; }
    const catName = col('categoria') >= 0 ? fields[col('categoria')]?.trim() : '';
    const cat     = S.categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
    transactions.push({ id, type, amount, date, description: desc, category: cat ? cat.id : (type === 'income' ? 'outros_inc' : 'outros_exp'), note });
  }
  return { transactions, errors };
}

document.getElementById('import-btn').addEventListener('click', () => { document.getElementById('csv-file-input').click(); });

document.getElementById('csv-file-input').addEventListener('change', function () {
  const file = this.files?.[0];
  if (!file) return;
  this.value = '';
  if (!file.name.toLowerCase().endsWith('.csv')) { toast('Selecione um arquivo .csv'); return; }
  if (file.size > 5 * 1024 * 1024)               { toast('Arquivo muito grande (máx 5 MB)'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const { transactions, errors } = parseCSV(e.target.result);
      if (errors.length) console.warn('[Finlu] erros no CSV:', errors);
      const existingIds = new Set(S.transactions.map(t => t.id));
      const newTxs      = transactions.filter(t => !existingIds.has(t.id));
      const duplicates  = transactions.length - newTxs.length;
      if (!newTxs.length && !errors.length) { toast('Nenhuma transação nova'); return; }
      S.transactions.push(...newTxs);
      save(); renderPage(S.currentPage); if (S.currentPage !== 'home') renderHome();
      const parts = [];
      if (newTxs.length) parts.push(`${newTxs.length} importada${newTxs.length > 1 ? 's' : ''}`);
      if (duplicates)    parts.push(`${duplicates} duplicada${duplicates > 1 ? 's' : ''} ignorada${duplicates > 1 ? 's' : ''}`);
      if (errors.length) parts.push(`${errors.length} erro${errors.length > 1 ? 's' : ''}`);
      toast('CSV: ' + parts.join(' · '), 4000);
    } catch (err) { toast('Erro ao ler CSV: ' + err.message, 4000); }
  };
  reader.onerror = () => toast('Falha ao ler o arquivo');
  reader.readAsText(file, 'UTF-8');
});

// --- sync UI ---

function updateSyncStatusUI(status) {
  const dot  = document.getElementById('sync-dot');
  const text = document.getElementById('sync-status-text');
  const btn  = document.getElementById('sync-action-btn');
  if (!dot || !text || !btn) return;
  dot.className = 'sync-dot';
  const user = Cloud.currentUser();
  if (!Cloud.isConfigured()) {
    text.textContent = 'Sincronização não configurada';
    btn.textContent  = 'Saiba mais';
    btn.onclick      = () => openAuthModal();
    return;
  }
  switch (status) {
    case 'online':  dot.classList.add('online');  text.textContent = `Sincronizado · ${user?.email || ''}`; btn.textContent = 'Conta'; break;
    case 'syncing': dot.classList.add('syncing'); text.textContent = 'Sincronizando…'; btn.textContent = 'Conta'; break;
    case 'error':   dot.classList.add('error');   text.textContent = 'Erro de sincronização'; btn.textContent = 'Tentar novamente'; btn.onclick = () => save(); return;
    default: text.textContent = user ? `Offline · ${user.email}` : 'Não conectado — dados locais'; btn.textContent = user ? 'Conta' : 'Entrar';
  }
  btn.onclick = () => openAuthModal();
}

function showAuthPanel(name) {
  ['logged','confirm','reset','login'].forEach(p => {
    document.getElementById(`auth-panel-${p}`).classList.toggle('hidden', p !== name);
  });
}

function openAuthModal(initialPanel) {
  const user = Cloud.currentUser();
  if (user && !initialPanel) {
    showAuthPanel('logged');
    document.getElementById('auth-user-email').textContent = user.email;
  } else {
    showAuthPanel(initialPanel || 'login');
    const warning = document.getElementById('auth-config-warning');
    if (!Cloud.isConfigured()) warning.classList.remove('hidden'); else warning.classList.add('hidden');
    document.getElementById('auth-email').value    = '';
    document.getElementById('auth-password').value = '';
    document.getElementById('auth-error').classList.add('hidden');
    setAuthMode('login');
  }
  openModal('modal-auth');
}

function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll('.auth-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.authTab === mode);
    t.setAttribute('aria-selected', t.dataset.authTab === mode);
  });
  const forgotWrap = document.getElementById('forgot-password-wrap');
  if (forgotWrap) forgotWrap.style.display = mode === 'login' ? '' : 'none';
  document.getElementById('auth-submit-btn').textContent = mode === 'login' ? 'Entrar' : 'Criar conta';
  document.getElementById('auth-error').classList.add('hidden');
}

document.getElementById('modal-auth-close').addEventListener('click', () => closeModal('modal-auth'));
document.getElementById('modal-auth').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal('modal-auth'); });

let authMode = 'login';
document.querySelectorAll('.auth-tab').forEach(tab => { tab.addEventListener('click', () => setAuthMode(tab.dataset.authTab)); });

document.getElementById('forgot-password-btn').addEventListener('click', () => {
  const email = document.getElementById('auth-email').value.trim();
  if (email) document.getElementById('reset-email').value = email;
  document.getElementById('reset-error').classList.add('hidden');
  document.getElementById('reset-success').classList.add('hidden');
  showAuthPanel('reset');
});
document.getElementById('auth-back-from-reset-btn').addEventListener('click', () => { showAuthPanel('login'); });

document.getElementById('reset-submit-btn').addEventListener('click', async () => {
  const email = document.getElementById('reset-email').value.trim();
  const errEl = document.getElementById('reset-error');
  const okEl  = document.getElementById('reset-success');
  const btn   = document.getElementById('reset-submit-btn');
  errEl.classList.add('hidden'); okEl.classList.add('hidden');
  if (!email) { errEl.textContent = 'Informe seu e-mail'; errEl.classList.remove('hidden'); return; }
  btn.disabled = true; btn.textContent = 'Enviando…';
  try {
    const sb = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    if (!sb) throw new Error('Supabase não configurado');
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
    if (error) throw error;
    okEl.textContent = 'Link enviado. Verifique sua caixa de entrada.';
    okEl.classList.remove('hidden');
  } catch (err) {
    errEl.textContent = err.message || 'Erro ao enviar o link';
    errEl.classList.remove('hidden');
  } finally { btn.disabled = false; btn.textContent = 'Enviar link'; }
});

document.getElementById('auth-back-to-login-btn').addEventListener('click', () => { showAuthPanel('login'); setAuthMode('login'); });

document.getElementById('auth-resend-btn').addEventListener('click', async () => {
  const email = document.getElementById('auth-confirm-email').textContent;
  if (!email) return;
  const btn = document.getElementById('auth-resend-btn');
  btn.disabled = true; btn.textContent = 'Enviando…';
  try {
    const sb = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await sb.auth.resend({ type: 'signup', email });
    toast('E-mail reenviado', 4000);
  } catch { toast('Erro ao reenviar'); }
  finally { btn.disabled = false; btn.textContent = 'Reenviar e-mail de confirmação'; }
});

document.getElementById('auth-submit-btn').addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value.trim();
  const pass  = document.getElementById('auth-password').value;
  const errEl = document.getElementById('auth-error');
  const btn   = document.getElementById('auth-submit-btn');
  if (!email || !pass) { showAuthError('Preencha e-mail e senha'); return; }
  if (pass.length < 6) { showAuthError('Senha deve ter mínimo 6 caracteres'); return; }
  btn.disabled = true; btn.textContent = 'Aguarde…';
  errEl.classList.add('hidden'); updateSyncStatusUI('syncing');
  try {
    if (authMode === 'login') {
      await finishLogin(await Cloud.login(email, pass));
    } else {
      const data = await Cloud.signup(email, pass);
      // Se não gerou sessão, o Supabase enviou o e-mail de confirmação
      if (!data.session) {
        document.getElementById('auth-confirm-email').textContent = email;
        showAuthPanel('confirm'); updateSyncStatusUI('offline'); return;
      }
      await finishLogin(data.user);
    }
  } catch (err) {
    const msgs = { 'Invalid login credentials': 'E-mail ou senha incorretos', 'Email not confirmed': 'Confirme seu e-mail antes de entrar', 'User already registered': 'E-mail já cadastrado. Use a aba Entrar.' };
    showAuthError(msgs[err.message] || err.message || 'Erro desconhecido');
    updateSyncStatusUI('offline');
  } finally { btn.disabled = false; btn.textContent = authMode === 'login' ? 'Entrar' : 'Criar conta'; }
  function showAuthError(msg) { errEl.textContent = msg; errEl.classList.remove('hidden'); }
});

async function finishLogin(user) {
  toast('Sincronizando dados…', 4000);
  const remote = await Cloud.pullAll(S);
  if (remote) {
    if (remote.transactions?.length) S.transactions = remote.transactions;
    if (remote.budgets?.length)      S.budgets      = remote.budgets;
    if (remote.goals?.length)        S.goals        = remote.goals;
    if (remote.settings)             Object.assign(S.settings, remote.settings);
    save(); renderPage(S.currentPage); if (S.currentPage !== 'home') renderHome();
  } else {
    await Cloud.pushAll(S);
  }
  updateSyncStatusUI('online');
  closeModal('modal-auth');
  toast('Login efetuado · Dados sincronizados');
  updateProfileUI(); renderSettings();
}

document.getElementById('auth-sync-now-btn').addEventListener('click', async () => {
  const btn = document.getElementById('auth-sync-now-btn');
  btn.disabled = true; btn.textContent = 'Sincronizando…'; updateSyncStatusUI('syncing');
  try {
    const r = await Cloud.pushAll(S);
    if (r.ok) { toast('Sincronizado com sucesso'); updateSyncStatusUI('online'); }
    else      { toast('Erro: ' + r.reason, 4000); updateSyncStatusUI('error'); }
  } catch { toast('Falha na sincronização'); updateSyncStatusUI('error'); }
  finally  { btn.disabled = false; btn.textContent = 'Sincronizar agora'; }
});

document.getElementById('auth-logout-btn').addEventListener('click', async () => {
  await Cloud.logout();
  closeModal('modal-auth'); updateSyncStatusUI('offline'); renderSettings();
  toast('Sessão encerrada · Dados locais mantidos');
});

document.getElementById('sync-action-btn').addEventListener('click', openAuthModal);

document.getElementById('export-btn').addEventListener('click', () => {
  const rows = [['ID', 'Tipo', 'Descrição', 'Categoria', 'Valor', 'Data', 'Nota']];
  S.transactions.forEach(t => rows.push([t.id, t.type, t.description, getCategory(t.category).name, t.amount.toFixed(2), t.date, t.note || '']));
  const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'finlu-transacoes.csv'; a.click();
  URL.revokeObjectURL(url);
  toast('CSV exportado');
});

document.getElementById('reset-btn').addEventListener('click', () => {
  if (!confirm('Apagar TODOS os dados? Esta ação não pode ser desfeita.')) return;
  if (!confirm('Tem certeza?')) return;
  Object.values(DB.keys).forEach(k => localStorage.removeItem(k));
  location.reload();
});

// --- perfil ---

function updateProfileUI() {
  const ini = initials(S.settings.name);
  document.getElementById('avatar-initials').textContent = ini;
  document.getElementById('sidebar-avatar').textContent  = ini;
  document.getElementById('sidebar-name').textContent    = S.settings.name || 'Usuário';
  document.getElementById('sidebar-income').textContent  = `${fmt(S.settings.income)} / mês`;
}

// --- wiring ---

document.querySelectorAll('[data-page]').forEach(el => { el.addEventListener('click', () => navigate(el.dataset.page)); });
document.getElementById('menu-btn').addEventListener('click', openSidebar);
document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);
document.getElementById('fab-btn').addEventListener('click', () => openTxModal('expense'));
document.getElementById('qa-add-expense').addEventListener('click', () => openTxModal('expense'));
document.getElementById('qa-add-income').addEventListener('click', () => openTxModal('income'));
document.getElementById('qa-add-goal').addEventListener('click', () => { navigate('goals'); setTimeout(() => document.getElementById('add-goal-btn').click(), 100); });
document.getElementById('qa-scan').addEventListener('click', () => toast('Em breve: escanear recibo'));
document.getElementById('avatar-btn').addEventListener('click', () => navigate('settings'));
document.getElementById('notif-btn').addEventListener('click', () => toast('Sem novas notificações'));

document.querySelectorAll('.period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    S.reportMonths = parseInt(btn.dataset.months);
    renderReports();
  });
});

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); S.txFilter = btn.dataset.filter; renderTransactions();
  });
});

document.getElementById('tx-search').addEventListener('input', () => renderTransactions());
document.querySelectorAll('.section-link').forEach(btn => { btn.addEventListener('click', () => navigate(btn.dataset.page)); });

// --- banner de instalação iOS ---

function checkInstallBanner() {
  const isIOS        = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true;
  if (isIOS && !isStandalone && !S.settings.installDismissed) {
    setTimeout(() => document.getElementById('ios-install').classList.remove('hidden'), 3000);
  }
}
document.getElementById('ios-install-close').addEventListener('click', () => {
  document.getElementById('ios-install').classList.add('hidden');
  S.settings.installDismissed = true; save();
});

// --- onboarding ---

function startOnboarding() {
  document.getElementById('onboarding').classList.remove('hidden');
  let slide = 0;
  const slides  = document.querySelectorAll('.onb-slide');
  const dots    = document.querySelectorAll('.onb-dot');
  const nextBtn = document.getElementById('onb-next');
  const skipBtn = document.getElementById('onb-skip');
  const setup   = document.getElementById('onb-setup');
  function goSlide(n) {
    slides.forEach((s, i) => s.classList.toggle('active', i === n));
    dots.forEach((d, i) => { d.classList.toggle('active', i === n); d.setAttribute('aria-selected', i === n); });
    slide = n;
    nextBtn.textContent = n === slides.length - 1 ? 'Configurar' : 'Próximo';
  }
  nextBtn.addEventListener('click', () => {
    if (slide < slides.length - 1) { goSlide(slide + 1); }
    else {
      document.querySelector('.onb-slides').classList.add('hidden');
      document.querySelector('.onb-dots').classList.add('hidden');
      nextBtn.classList.add('hidden'); skipBtn.classList.add('hidden');
      setup.classList.remove('hidden');
    }
  });
  skipBtn.addEventListener('click', finishOnboarding);
  document.getElementById('onb-finish').addEventListener('click', () => {
    S.settings.name   = document.getElementById('onb-name').value.trim() || 'Usuário';
    S.settings.income = parseFloat(document.getElementById('onb-income').value) || 0;
    finishOnboarding();
  });
  goSlide(0);
}

function finishOnboarding() {
  DB.set(DB.keys.ONBOARDED, true); save();
  document.getElementById('onboarding').classList.add('hidden');
  launchApp();
}

// --- inicialização ---

function launchApp() {
  document.getElementById('main-app').classList.remove('hidden');
  document.documentElement.setAttribute('data-theme', S.settings.theme);
  updateProfileUI();
  
  // --- LÓGICA DE ROTAS POR URL ---
  const urlParams = new URLSearchParams(window.location.search);
  const action = urlParams.get('action');

  if (action === 'login') {
    navigate('settings'); // Vai para a aba configurações
    setTimeout(() => {
      openAuthModal('login'); // Abre o modal de login
      // Limpa a URL para o modal não reabrir se o usuário atualizar a página
      window.history.replaceState({}, document.title, window.location.pathname);
    }, 300);
  } 
  else if (action === 'add-expense') { // Aproveita para fazer o atalho do manifest.json funcionar
    navigate('home');
    setTimeout(() => openTxModal('expense'), 300);
  }
  else if (action === 'add-income') { // Aproveita para fazer o atalho do manifest.json funcionar
    navigate('home');
    setTimeout(() => openTxModal('income'), 300);
  }
  else {
    navigate('home'); // Comportamento padrão se não tiver parâmetro
  }
  // -------------------------------

  checkInstallBanner();
  Cloud.init((user) => {
    updateSyncStatusUI(user ? 'online' : 'offline');
    if (user) {
      Cloud.pullAll(S).then(remote => {
        if (!remote) return;
        let changed = false;
        if (remote.transactions?.length > S.transactions.length) { S.transactions = remote.transactions; changed = true; }
        if (remote.budgets?.length > S.budgets.length)           { S.budgets = remote.budgets; changed = true; }
        if (remote.goals?.length > S.goals.length)               { S.goals = remote.goals; changed = true; }
        if (changed) { save(); renderPage(S.currentPage); }
      }).catch(() => {});
    }
  });
}

function init() {
  // aplica o tema antes de renderizar para evitar flash
  document.documentElement.setAttribute('data-theme', S.settings.theme || 'dark');
  setTimeout(() => {
    document.getElementById('splash').style.opacity    = '0';
    document.getElementById('splash').style.transition = 'opacity .3s';
    setTimeout(() => {
      document.getElementById('splash').classList.add('hidden');
      if (DB.get(DB.keys.ONBOARDED)) launchApp(); else startOnboarding();
    }, 300);
  }, 800);
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(() => console.log('[Finlu] SW registrado'))
      .catch(err => console.warn('[Finlu] SW falhou:', err));
  });
}

document.addEventListener('DOMContentLoaded', init);