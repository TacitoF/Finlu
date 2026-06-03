/* ═══════════════════════════════════════════════
   FINLU — Finance PWA · app.js
   ═══════════════════════════════════════════════ */

'use strict';

/* ──────────────────────────────────────────────
   1. DATA STORE (localStorage)
   ────────────────────────────────────────────── */
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

/* ──────────────────────────────────────────────
   2. DEFAULT DATA
   ────────────────────────────────────────────── */
const DEFAULT_CATS = [
  { id: 'alimentacao', name: 'Alimentação',    icon: '🍔', color: '#F59E0B', type: 'expense' },
  { id: 'transporte',  name: 'Transporte',     icon: '🚗', color: '#3B82F6', type: 'expense' },
  { id: 'moradia',     name: 'Moradia',        icon: '🏠', color: '#8B5CF6', type: 'expense' },
  { id: 'saude',       name: 'Saúde',          icon: '❤️', color: '#EF4444', type: 'expense' },
  { id: 'lazer',       name: 'Lazer',          icon: '🎮', color: '#10B981', type: 'expense' },
  { id: 'educacao',    name: 'Educação',       icon: '📚', color: '#6366F1', type: 'expense' },
  { id: 'roupas',      name: 'Roupas',         icon: '👗', color: '#EC4899', type: 'expense' },
  { id: 'tecnologia',  name: 'Tecnologia',     icon: '💻', color: '#14B8A6', type: 'expense' },
  { id: 'outros_exp',  name: 'Outros',         icon: '📦', color: '#94A3B8', type: 'expense' },
  { id: 'salario',     name: 'Salário',        icon: '💼', color: '#10B981', type: 'income' },
  { id: 'freelance',   name: 'Freelance',      icon: '🧑‍💻', color: '#3B82F6', type: 'income' },
  { id: 'investimento',name: 'Investimentos',  icon: '📈', color: '#F59E0B', type: 'income' },
  { id: 'outros_inc',  name: 'Outras receitas',icon: '💰', color: '#94A3B8', type: 'income' },
];

const DEFAULT_SETTINGS = {
  name: '', income: 0, theme: 'dark', currency: 'BRL', installDismissed: false
};

/* ──────────────────────────────────────────────
   3. STATE
   ────────────────────────────────────────────── */
let S = {
  settings:     DB.get(DB.keys.SETTINGS, { ...DEFAULT_SETTINGS }),
  transactions: DB.get(DB.keys.TRANSACTIONS, []),
  budgets:      DB.get(DB.keys.BUDGETS, []),
  goals:        DB.get(DB.keys.GOALS, []),
  categories:   DB.get(DB.keys.CATEGORIES, DEFAULT_CATS),
  currentPage:  'home',
  txFilter:     'all',
  reportMonths: 3,
  editingGoalId: null,
};

function save() {
  DB.set(DB.keys.SETTINGS,     S.settings);
  DB.set(DB.keys.TRANSACTIONS, S.transactions);
  DB.set(DB.keys.BUDGETS,      S.budgets);
  DB.set(DB.keys.GOALS,        S.goals);
  DB.set(DB.keys.CATEGORIES,   S.categories);
}

/* ──────────────────────────────────────────────
   4. UTILITIES
   ────────────────────────────────────────────── */
function fmt(amount) {
  const symbols = { BRL: 'R$', USD: '$', EUR: '€' };
  const sym = symbols[S.settings.currency] || 'R$';
  const n = Number(amount) || 0;
  return `${sym} ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function initials(name) {
  if (!name) return '?';
  return name.trim().split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function getCategory(id) {
  return S.categories.find(c => c.id === id) || { name: 'Outros', icon: '📦', color: '#94A3B8' };
}

function getMonthRange(months) {
  const end = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - months + 1);
  start.setDate(1);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function currentMonthRange() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const start = new Date(y, m, 1).toISOString().slice(0, 10);
  const end   = new Date(y, m + 1, 0).toISOString().slice(0, 10);
  return { start, end };
}

function filterTxByRange(start, end) {
  return S.transactions.filter(t => t.date >= start && t.date <= end);
}

function toast(msg, duration = 2500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), duration);
}

/* ──────────────────────────────────────────────
   5. NAVIGATION
   ────────────────────────────────────────────── */
function navigate(page) {
  S.currentPage = page;
  // pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pg = document.getElementById(`page-${page}`);
  if (pg) pg.classList.add('active');
  // bottom nav
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === page);
    n.setAttribute('aria-current', n.dataset.page === page ? 'page' : 'false');
  });
  // sidebar items
  document.querySelectorAll('.sb-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === page);
    n.setAttribute('aria-current', n.dataset.page === page ? 'page' : 'false');
  });
  // title
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

/* ──────────────────────────────────────────────
   6. SIDEBAR
   ────────────────────────────────────────────── */
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

/* ──────────────────────────────────────────────
   7. HOME PAGE
   ────────────────────────────────────────────── */
function renderHome() {
  const { start, end } = currentMonthRange();
  const txs = filterTxByRange(start, end);
  const income  = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;

  document.getElementById('balance-display').textContent = fmt(balance);
  document.getElementById('home-income').textContent  = fmt(income);
  document.getElementById('home-expense').textContent = fmt(expense);
  document.getElementById('balance-display').style.color = balance >= 0 ? '#fff' : '#fca5a5';

  renderDonutHome(txs);
  renderHomeBudgets(txs);
  renderHomeTransactions();
  renderHomeGoals();
}

function renderDonutHome(txs) {
  const expenses = txs.filter(t => t.type === 'expense');
  const byCat = {};
  expenses.forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const total = entries.reduce((s, e) => s + e[1], 0);

  const canvas = document.getElementById('donut-home');
  const legend = document.getElementById('donut-legend');

  if (!entries.length) {
    canvas.style.display = 'none';
    legend.innerHTML = '<div style="color:var(--c-muted);font-size:13px;padding:.5rem 0">Nenhum gasto registrado</div>';
    return;
  }
  canvas.style.display = '';

  // destroy previous chart if exists
  if (canvas._chart) canvas._chart.destroy();
  canvas._chart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: entries.map(([id]) => getCategory(id).name),
      datasets: [{
        data: entries.map(([, v]) => v),
        backgroundColor: entries.map(([id]) => getCategory(id).color),
        borderWidth: 0, hoverOffset: 4,
        pointStyle: entries.map(() => 'rect')
      }]
    },
    options: {
      cutout: '72%', responsive: false,
      plugins: { legend: { display: false }, tooltip: {
        callbacks: { label: ctx => ` ${fmt(ctx.raw)} (${Math.round(ctx.raw / total * 100)}%)` }
      }}
    }
  });

  legend.innerHTML = entries.map(([id, v]) => {
    const cat = getCategory(id);
    return `<div class="dleg-item">
      <span class="dleg-dot" style="background:${cat.color}"></span>
      <span>${cat.name}</span>
      <span class="dleg-val">${Math.round(v / total * 100)}%</span>
    </div>`;
  }).join('');
}

function renderHomeBudgets(txs) {
  const el = document.getElementById('home-budgets');
  const budgets = S.budgets.slice(0, 3);
  if (!budgets.length) { el.innerHTML = '<p style="color:var(--c-muted);font-size:13px;padding:.25rem 0 1rem">Nenhum orçamento criado.</p>'; return; }
  el.innerHTML = budgets.map(b => budgetItemHTML(b, txs)).join('');
}

function budgetItemHTML(b, txs) {
  const cat = getCategory(b.category);
  const spent = txs ? txs.filter(t => t.type === 'expense' && t.category === b.category).reduce((s, t) => s + t.amount, 0) : (() => {
    const { start, end } = currentMonthRange();
    return filterTxByRange(start, end).filter(t => t.type === 'expense' && t.category === b.category).reduce((s, t) => s + t.amount, 0);
  })();
  const pct = b.limit > 0 ? Math.min(spent / b.limit * 100, 100) : 0;
  const fillClass = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok';
  return `<div class="budget-item" role="listitem">
    <div class="budget-top">
      <div class="budget-name"><span>${cat.icon}</span> ${cat.name}</div>
      <div class="budget-amounts"><strong>${fmt(spent)}</strong> / ${fmt(b.limit)}</div>
    </div>
    <div class="budget-bar"><div class="budget-fill ${fillClass}" style="width:${pct}%"></div></div>
    <div class="budget-pct">${Math.round(pct)}% utilizado</div>
  </div>`;
}

function renderHomeTransactions() {
  const el = document.getElementById('home-transactions');
  const recent = [...S.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  el.innerHTML = recent.length ? recent.map(txItemHTML).join('') : '<p style="color:var(--c-muted);font-size:13px;padding:.25rem 0 1rem">Nenhuma transação registrada.</p>';
}

function renderHomeGoals() {
  const el = document.getElementById('home-goals');
  if (!S.goals.length) { el.innerHTML = '<p style="color:var(--c-muted);font-size:13px;padding:.25rem 0 1rem">Nenhuma meta criada.</p>'; return; }
  el.innerHTML = S.goals.slice(0, 2).map(goalCardHTML).join('');
  setupGoalButtons();
}

/* ──────────────────────────────────────────────
   8. TRANSACTIONS PAGE
   ────────────────────────────────────────────── */
function renderTransactions() {
  let txs = [...S.transactions].sort((a, b) => b.date.localeCompare(a.date));
  if (S.txFilter !== 'all') txs = txs.filter(t => t.type === S.txFilter);
  const q = document.getElementById('tx-search')?.value.trim().toLowerCase();
  if (q) txs = txs.filter(t => t.description.toLowerCase().includes(q) || getCategory(t.category).name.toLowerCase().includes(q));
  const list = document.getElementById('tx-page-list');
  const empty = document.getElementById('tx-empty');
  if (!txs.length) { list.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  list.innerHTML = txs.map((t, i) => txItemHTML(t, true)).join('');
  setupTxSwipe();
}

function txItemHTML(t, withDelete = false) {
  const cat = getCategory(t.category);
  const sign = t.type === 'income' ? '+' : '-';
  return `<div class="tx-item" data-id="${t.id}" role="listitem">
    <div class="tx-cat-icon" style="background:${cat.color}22">${cat.icon}</div>
    <div class="tx-meta">
      <div class="tx-desc">${escapeHtml(t.description)}</div>
      <div class="tx-sub">
        <span>${cat.name}</span>
        <span>·</span>
        <span>${fmtDate(t.date)}</span>
        ${t.note ? `<span>· ${escapeHtml(t.note)}</span>` : ''}
      </div>
    </div>
    <div class="tx-amount ${t.type}">${sign}${fmt(t.amount)}</div>
    ${withDelete ? `<div class="tx-delete-hint" onclick="deleteTx('${t.id}')"><i class="ti ti-trash" style="color:#fff;font-size:22px"></i></div>` : ''}
  </div>`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function setupTxSwipe() {
  document.querySelectorAll('#tx-page-list .tx-item').forEach(el => {
    let startX = 0;
    el.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', e => {
      const dx = startX - e.changedTouches[0].clientX;
      if (dx > 60) { el.classList.add('swiped'); }
      else if (dx < -30) { el.classList.remove('swiped'); }
    }, { passive: true });
  });
}

window.deleteTx = function(id) {
  if (!confirm('Excluir esta transação?')) return;
  S.transactions = S.transactions.filter(t => t.id !== id);
  save();
  renderTransactions();
  if (S.currentPage === 'home') renderHome();
  toast('Transação excluída');
};

/* ──────────────────────────────────────────────
   9. BUDGET PAGE
   ────────────────────────────────────────────── */
function renderBudget() {
  const list  = document.getElementById('budget-list');
  const empty = document.getElementById('budget-empty');
  if (!S.budgets.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  const { start, end } = currentMonthRange();
  const txs = filterTxByRange(start, end);
  list.innerHTML = S.budgets.map(b => `
    <div class="budget-item" role="listitem" style="position:relative">
      ${budgetItemHTML(b, txs)}
      <div style="display:flex;gap:8px;margin-top:.75rem">
        <button onclick="deleteBudget('${b.id}')" class="btn-sm" style="color:var(--c-red)" aria-label="Excluir orçamento de ${getCategory(b.category).name}">
          <i class="ti ti-trash"></i> Excluir
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

/* ──────────────────────────────────────────────
   10. GOALS PAGE
   ────────────────────────────────────────────── */
function goalCardHTML(g) {
  const pct = g.target > 0 ? Math.min(g.current / g.target * 100, 100) : 0;
  const deadline = g.deadline ? `Prazo: ${fmtDate(g.deadline)}` : 'Sem prazo';
  return `<div class="goal-card" role="listitem" data-goal-id="${g.id}">
    <div class="goal-header">
      <div class="goal-emoji">${g.icon || '🎯'}</div>
      <div class="goal-info">
        <div class="goal-name">${escapeHtml(g.name)}</div>
        <div class="goal-date">${deadline}</div>
      </div>
      <button onclick="deleteGoal('${g.id}', event)" class="icon-btn" style="width:36px;height:36px;color:var(--c-muted)" aria-label="Excluir meta ${escapeHtml(g.name)}">
        <i class="ti ti-trash"></i>
      </button>
    </div>
    <div class="goal-amounts">
      <span>Economizado: <strong>${fmt(g.current)}</strong></span>
      <span>Meta: ${fmt(g.target)}</span>
    </div>
    <div class="goal-bar"><div class="goal-fill" style="width:${pct}%"></div></div>
    <div class="goal-pct">${Math.round(pct)}% completo</div>
    <button class="goal-deposit-btn" data-goal-id="${g.id}" aria-label="Depositar na meta ${escapeHtml(g.name)}">
      <i class="ti ti-piggy-bank" style="vertical-align:-2px"></i> Depositar
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
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.goalId;
      openDepositModal(id);
    });
  });
}

window.deleteGoal = function(id, e) {
  e.stopPropagation();
  if (!confirm('Excluir esta meta?')) return;
  S.goals = S.goals.filter(g => g.id !== id);
  save(); renderGoals(); renderHome(); toast('Meta excluída');
};

/* ──────────────────────────────────────────────
   11. REPORTS PAGE
   ────────────────────────────────────────────── */
let barChart = null, pieChart = null;

function renderReports() {
  const months = S.reportMonths;
  const { start, end } = getMonthRange(months);
  const txs = filterTxByRange(start, end);
  const income  = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;
  const rate    = income > 0 ? Math.round(balance / income * 100) : 0;

  document.getElementById('report-income').textContent  = fmt(income);
  document.getElementById('report-expense').textContent = fmt(expense);
  document.getElementById('report-balance').textContent = fmt(balance);
  document.getElementById('report-rate').textContent    = `${rate}%`;

  renderBarChart(months);
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
    data: {
      labels,
      datasets: [
        { label: 'Receitas', data: incomeData,  backgroundColor: 'rgba(16,185,129,.7)',  borderRadius: 4, pointStyle: 'rect' },
        { label: 'Gastos',   data: expenseData, backgroundColor: 'rgba(239,68,68,.7)',   borderRadius: 4, pointStyle: 'rect' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)}` } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,.06)' }, ticks: { color: '#64748b', font: { size: 11 }, callback: v => 'R$' + (v/1000).toFixed(0) + 'k' } }
      }
    }
  });
}

function renderPieChart(txs) {
  const expenses = txs.filter(t => t.type === 'expense');
  const byCat = {};
  expenses.forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);

  const canvas = document.getElementById('pie-report');
  if (pieChart) pieChart.destroy();

  if (!entries.length) { canvas.parentElement.innerHTML = '<p style="color:var(--c-muted);font-size:13px;padding:1rem">Nenhum gasto neste período.</p>'; return; }

  pieChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: entries.map(([id]) => getCategory(id).name),
      datasets: [{
        data: entries.map(([, v]) => v),
        backgroundColor: entries.map(([id]) => getCategory(id).color),
        borderWidth: 0, hoverOffset: 6,
        pointStyle: entries.map(() => 'rect')
      }]
    },
    options: {
      cutout: '60%', responsive: false,
      plugins: { legend: { display: false }, tooltip: {
        callbacks: { label: ctx => ` ${fmt(ctx.raw)} (${Math.round(ctx.raw / total * 100)}%)` }
      }}
    }
  });

  document.getElementById('pie-legend').innerHTML = entries.map(([id, v]) => {
    const cat = getCategory(id);
    return `<div class="pie-leg-item">
      <span class="pie-leg-dot" style="background:${cat.color}"></span>
      <span>${cat.name}</span>
      <span class="pie-leg-pct" style="color:${cat.color}">${Math.round(v / total * 100)}%</span>
    </div>`;
  }).join('');
}

function renderTopExpenses(txs) {
  const top = [...txs.filter(t => t.type === 'expense')].sort((a, b) => b.amount - a.amount).slice(0, 5);
  document.getElementById('top-expenses').innerHTML = top.length ? top.map(t => txItemHTML(t)).join('') : '<p style="color:var(--c-muted);font-size:13px">Nenhum gasto registrado.</p>';
}

/* ──────────────────────────────────────────────
   12. SETTINGS PAGE
   ────────────────────────────────────────────── */
function renderSettings() {
  document.getElementById('settings-name-val').textContent  = S.settings.name || '—';
  document.getElementById('settings-income-val').textContent = fmt(S.settings.income);
  document.getElementById('currency-select').value = S.settings.currency;

  document.querySelectorAll('.toggle-opt').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === S.settings.theme);
    b.setAttribute('aria-checked', b.dataset.theme === S.settings.theme);
  });

  renderCatList();
}

function renderCatList() {
  const el = document.getElementById('cat-list');
  const custom = S.categories.filter(c => !DEFAULT_CATS.find(d => d.id === c.id));
  el.innerHTML = custom.map(c => `<div class="cat-item">
    <div class="cat-item-left"><span>${c.icon}</span><span>${escapeHtml(c.name)}</span></div>
    <button class="icon-btn" style="color:var(--c-red);width:36px;height:36px" onclick="deleteCat('${c.id}')" aria-label="Excluir categoria ${escapeHtml(c.name)}"><i class="ti ti-trash"></i></button>
  </div>`).join('');
  if (!custom.length) el.innerHTML = '<p style="color:var(--c-muted);font-size:13px">Nenhuma categoria personalizada.</p>';
}

window.deleteCat = function(id) {
  S.categories = S.categories.filter(c => c.id !== id);
  save(); renderCatList(); toast('Categoria excluída');
};

/* ──────────────────────────────────────────────
   13. MODALS
   ────────────────────────────────────────────── */
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  // focus first input
  setTimeout(() => {
    const firstInput = document.getElementById(id).querySelector('input, select');
    if (firstInput) firstInput.focus();
  }, 350);
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  document.body.style.overflow = '';
}

// ── Transaction Modal ──
function openTxModal(type = 'expense') {
  populateCatSelect('tx-cat', type);
  document.getElementById('tx-date').value = todayISO();
  document.getElementById('tx-amount').value = '';
  document.getElementById('tx-desc').value = '';
  document.getElementById('tx-note').value = '';
  // set type
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
    populateCatSelect('tx-cat', btn.dataset.type);
  });
});

document.getElementById('save-tx-btn').addEventListener('click', () => {
  const amount = parseFloat(document.getElementById('tx-amount').value);
  const desc   = document.getElementById('tx-desc').value.trim();
  const cat    = document.getElementById('tx-cat').value;
  const date   = document.getElementById('tx-date').value;
  const note   = document.getElementById('tx-note').value.trim();
  const type   = document.querySelector('.type-btn.active').dataset.type;

  if (!amount || amount <= 0) { toast('Informe um valor válido'); return; }
  if (!desc)   { toast('Informe uma descrição'); return; }
  if (!date)   { toast('Informe a data'); return; }

  S.transactions.push({ id: uid(), type, amount, description: desc, category: cat, date, note });
  save();
  closeModal('modal-tx');
  toast(type === 'income' ? '✓ Receita adicionada' : '✓ Gasto adicionado');
  renderPage(S.currentPage);
  if (S.currentPage !== 'home') renderHome();
});

// ── Budget Modal ──
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
  if (!limit || limit <= 0) { toast('Informe um valor válido'); return; }
  if (S.budgets.find(b => b.category === cat)) { toast('Orçamento já existe para esta categoria'); return; }
  S.budgets.push({ id: uid(), category: cat, limit });
  save(); closeModal('modal-budget'); toast('✓ Orçamento criado'); renderPage(S.currentPage);
});

// ── Goal Modal ──
let selectedGoalIcon = '🏖️';
document.getElementById('add-goal-btn').addEventListener('click', () => {
  document.getElementById('goal-name').value = '';
  document.getElementById('goal-target').value = '';
  document.getElementById('goal-current').value = '';
  document.getElementById('goal-deadline').value = '';
  selectedGoalIcon = '🏖️';
  document.querySelectorAll('.icon-opt').forEach(b => { b.classList.toggle('active', b.dataset.icon === '🏖️'); b.setAttribute('aria-checked', b.dataset.icon === '🏖️'); });
  openModal('modal-goal');
});
document.getElementById('goals-empty-add')?.addEventListener('click', () => document.getElementById('add-goal-btn').click());
document.getElementById('modal-goal-close').addEventListener('click', () => closeModal('modal-goal'));
document.getElementById('modal-goal').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal('modal-goal'); });

document.querySelectorAll('.icon-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.icon-opt').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-checked', 'false'); });
    btn.classList.add('active'); btn.setAttribute('aria-checked', 'true');
    selectedGoalIcon = btn.dataset.icon;
  });
});

document.getElementById('save-goal-btn').addEventListener('click', () => {
  const name    = document.getElementById('goal-name').value.trim();
  const target  = parseFloat(document.getElementById('goal-target').value);
  const current = parseFloat(document.getElementById('goal-current').value) || 0;
  const deadline= document.getElementById('goal-deadline').value;
  if (!name)            { toast('Informe o nome da meta'); return; }
  if (!target || target <= 0) { toast('Informe o valor objetivo'); return; }
  S.goals.push({ id: uid(), name, target, current, deadline, icon: selectedGoalIcon });
  save(); closeModal('modal-goal'); toast('✓ Meta criada'); renderPage(S.currentPage);
});

// ── Deposit Modal ──
function openDepositModal(goalId) {
  S.editingGoalId = goalId;
  const g = S.goals.find(g => g.id === goalId);
  if (!g) return;
  document.getElementById('deposit-goal-name').textContent = `${g.icon} ${g.name}`;
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
  toast(g.current >= g.target ? '🎉 Meta atingida!' : `✓ R$ ${amount.toFixed(2)} depositado`);
  renderPage(S.currentPage);
  renderHome();
});

/* ──────────────────────────────────────────────
   14. CATEGORY SELECT
   ────────────────────────────────────────────── */
function populateCatSelect(selectId, type) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const cats = S.categories.filter(c => c.type === type || !c.type);
  sel.innerHTML = cats.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
}

function setupCatSelects() {
  populateCatSelect('tx-cat', 'expense');
  populateCatSelect('budget-cat', 'expense');
}

/* ──────────────────────────────────────────────
   15. SETTINGS ACTIONS
   ────────────────────────────────────────────── */
document.getElementById('edit-name-btn').addEventListener('click', () => {
  const name = prompt('Seu nome:', S.settings.name);
  if (name !== null) {
    S.settings.name = name.trim();
    save(); updateProfileUI(); renderSettings(); toast('Nome atualizado');
  }
});

document.getElementById('edit-income-btn').addEventListener('click', () => {
  const val = prompt('Renda mensal (R$):', S.settings.income);
  if (val !== null) {
    S.settings.income = parseFloat(val) || 0;
    save(); updateProfileUI(); renderSettings(); toast('Renda atualizada');
  }
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
  const name  = prompt('Nome da categoria:');
  if (!name?.trim()) return;
  const icon  = prompt('Emoji da categoria:', '📦') || '📦';
  const color = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  const type  = confirm('Esta categoria é de receita? (OK = Receita, Cancelar = Gasto)') ? 'income' : 'expense';
  S.categories.push({ id: uid(), name: name.trim(), icon, color, type });
  save(); renderCatList(); toast('Categoria criada');
});

document.getElementById('export-btn').addEventListener('click', () => {
  const rows = [['ID', 'Tipo', 'Descrição', 'Categoria', 'Valor', 'Data', 'Nota']];
  S.transactions.forEach(t => rows.push([t.id, t.type, t.description, getCategory(t.category).name, t.amount.toFixed(2), t.date, t.note || '']));
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'finlu-transacoes.csv'; a.click();
  URL.revokeObjectURL(url);
  toast('CSV exportado');
});

document.getElementById('reset-btn').addEventListener('click', () => {
  if (!confirm('⚠️ Apagar TODOS os dados? Esta ação não pode ser desfeita.')) return;
  if (!confirm('Tem certeza? Todos os seus dados serão perdidos.')) return;
  Object.values(DB.keys).forEach(k => localStorage.removeItem(k));
  location.reload();
});

/* ──────────────────────────────────────────────
   16. PROFILE UI
   ────────────────────────────────────────────── */
function updateProfileUI() {
  const ini = initials(S.settings.name);
  document.getElementById('avatar-initials').textContent = ini;
  document.getElementById('sidebar-avatar').textContent  = ini;
  document.getElementById('sidebar-name').textContent    = S.settings.name || 'Usuário';
  document.getElementById('sidebar-income').textContent  = `${fmt(S.settings.income)} / mês`;
}

/* ──────────────────────────────────────────────
   17. NAVIGATION WIRING
   ────────────────────────────────────────────── */
document.querySelectorAll('[data-page]').forEach(el => {
  el.addEventListener('click', () => navigate(el.dataset.page));
});

document.getElementById('menu-btn').addEventListener('click', openSidebar);
document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);
document.getElementById('fab-btn').addEventListener('click', () => openTxModal('expense'));
document.getElementById('qa-add-expense').addEventListener('click', () => openTxModal('expense'));
document.getElementById('qa-add-income').addEventListener('click', () => openTxModal('income'));
document.getElementById('qa-add-goal').addEventListener('click', () => { navigate('goals'); setTimeout(() => document.getElementById('add-goal-btn').click(), 100); });
document.getElementById('qa-scan').addEventListener('click', () => toast('📷 Em breve: escanear recibo'));
document.getElementById('avatar-btn').addEventListener('click', () => navigate('settings'));
document.getElementById('notif-btn').addEventListener('click', () => toast('Sem novas notificações'));

// Report period buttons
document.querySelectorAll('.period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    S.reportMonths = parseInt(btn.dataset.months);
    renderReports();
  });
});

// Transaction filters
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    S.txFilter = btn.dataset.filter;
    renderTransactions();
  });
});

// TX search
document.getElementById('tx-search').addEventListener('input', () => renderTransactions());

// Section links (in home)
document.querySelectorAll('.section-link').forEach(btn => {
  btn.addEventListener('click', () => navigate(btn.dataset.page));
});

/* ──────────────────────────────────────────────
   18. iOS INSTALL BANNER
   ────────────────────────────────────────────── */
function checkInstallBanner() {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true;
  if (isIOS && !isStandalone && !S.settings.installDismissed) {
    setTimeout(() => document.getElementById('ios-install').classList.remove('hidden'), 3000);
  }
}

document.getElementById('ios-install-close').addEventListener('click', () => {
  document.getElementById('ios-install').classList.add('hidden');
  S.settings.installDismissed = true;
  save();
});

/* ──────────────────────────────────────────────
   19. ONBOARDING
   ────────────────────────────────────────────── */
function startOnboarding() {
  document.getElementById('onboarding').classList.remove('hidden');
  let slide = 0;
  const slides = document.querySelectorAll('.onb-slide');
  const dots   = document.querySelectorAll('.onb-dot');
  const nextBtn = document.getElementById('onb-next');
  const skipBtn = document.getElementById('onb-skip');
  const setup   = document.getElementById('onb-setup');

  function goSlide(n) {
    slides.forEach((s, i) => { s.classList.toggle('active', i === n); });
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
  DB.set(DB.keys.ONBOARDED, true);
  save();
  document.getElementById('onboarding').classList.add('hidden');
  launchApp();
}

/* ──────────────────────────────────────────────
   20. LAUNCH
   ────────────────────────────────────────────── */
function launchApp() {
  document.getElementById('main-app').classList.remove('hidden');
  document.documentElement.setAttribute('data-theme', S.settings.theme);
  updateProfileUI();
  navigate('home');
  checkInstallBanner();
}

function init() {
  // Apply theme immediately to avoid flash
  document.documentElement.setAttribute('data-theme', S.settings.theme || 'dark');

  // Hide splash after short delay
  setTimeout(() => {
    document.getElementById('splash').style.opacity = '0';
    document.getElementById('splash').style.transition = 'opacity .3s';
    setTimeout(() => {
      document.getElementById('splash').classList.add('hidden');
      if (DB.get(DB.keys.ONBOARDED)) { launchApp(); }
      else { startOnboarding(); }
    }, 300);
  }, 800);
}

/* ──────────────────────────────────────────────
   21. SERVICE WORKER REGISTRATION
   ────────────────────────────────────────────── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(() => console.log('[Finlu] SW registrado'))
      .catch(err => console.warn('[Finlu] SW falhou:', err));
  });
}

/* ── START ── */
document.addEventListener('DOMContentLoaded', init);
