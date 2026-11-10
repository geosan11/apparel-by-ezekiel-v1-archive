import '../styles/main.css';
import { store, getStoreMode, setStoreMode, isBackendConnected, onUpgradeBlocked, onVersionChange } from '../store/index.js';
import { parseExpenseText, CATEGORIES } from './expenseParser.js';
import {
  initCrmView,
  renderClientsView,
  openCustomerProfile,
  getMeasurementUnit,
  setMeasurementUnit,
  initBackupSettings
} from './crmView.js';
import { escapeHtml, normalizePhone } from './crm.js';

// State
let isAuthenticated = false;
let isDemoSession = false;
let currentTab = 'overview';
let cachedOrders = [];
let cachedExpenses = [];
let cachedBookings = [];
let cachedCustomers = [];
let pendingExpenseParsed = null;
let lastAddedExpenseId = null;

// Auth Initialization
document.addEventListener('DOMContentLoaded', async () => {
  await store.init();
  checkAuthSession();
  setupEventListeners();
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }
});

function checkAuthSession() {
  const session = sessionStorage.getItem('apparel_admin_auth');
  if (session === 'demo') {
    isDemoSession = true;
    isAuthenticated = true;
    showDashboard();
    return;
  }

  if (isBackendConnected()) {
    import('../store/supabase.js')
      .then(({ supabaseAdapter }) => supabaseAdapter.getSession())
      .then((sess) => {
        if (sess) {
          isAuthenticated = true;
          isDemoSession = false;
          showDashboard();
        } else {
          showLogin();
        }
      })
      .catch(() => showLogin());
  } else {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('adminLoginView').style.display = 'flex';
  document.getElementById('adminDashboardView').style.display = 'none';

  // Toggle Supabase form visibility based on whether env is configured
  const supabaseForm = document.getElementById('supabaseAuthForm');
  const supabaseNotice = document.getElementById('supabaseConfigNotice');

  if (isBackendConnected()) {
    supabaseForm.style.display = 'block';
    supabaseNotice.style.display = 'none';
  } else {
    supabaseForm.style.display = 'none';
    supabaseNotice.style.display = 'block';
  }
}

async function showDashboard() {
  document.getElementById('adminLoginView').style.display = 'none';
  document.getElementById('adminDashboardView').style.display = 'block';

  // Show session badge
  const badge = document.getElementById('authModeBadge');
  if (badge) {
    badge.textContent = isDemoSession ? 'Demo Session (Local)' : 'Supabase Live Auth';
    badge.className = isDemoSession ? 'badge badge-beta' : 'badge badge-new';
  }

  checkPreV2BackupBanner();

  await refreshAllData();
}

async function refreshAllData() {
  [cachedOrders, cachedExpenses, cachedBookings, cachedCustomers] = await Promise.all([
    store.getOrders(),
    store.getExpenses(),
    store.getBookings(),
    store.getCustomers()
  ]);

  renderOverview();
  renderOrders();
  renderClientsView({ customers: cachedCustomers, orders: cachedOrders, store, showToast });
  renderExpenses();
  renderBookingsLeads();
}

function setupEventListeners() {
  // Demo Login Button (Instant access, no hardcoded password)
  const demoLoginBtn = document.getElementById('demoLoginBtn');
  if (demoLoginBtn) {
    demoLoginBtn.addEventListener('click', () => {
      sessionStorage.setItem('apparel_admin_auth', 'demo');
      isDemoSession = true;
      isAuthenticated = true;
      setStoreMode('indexeddb');
      showDashboard();
    });
  }

  // Supabase Auth Form
  const authForm = document.getElementById('supabaseAuthForm');
  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('authEmail').value.trim();
      const pass = document.getElementById('authPassword').value;
      const errorEl = document.getElementById('authErrorMessage');

      try {
        const { supabaseAdapter } = await import('../store/supabase.js');
        await supabaseAdapter.signIn(email, pass);
        sessionStorage.setItem('apparel_admin_auth', 'supabase');
        isDemoSession = false;
        isAuthenticated = true;
        setStoreMode('supabase');
        showDashboard();
      } catch (err) {
        if (errorEl) {
          errorEl.textContent = err.message || 'Authentication failed.';
          errorEl.style.display = 'block';
        }
      }
    });
  }

  // Logout
  const logoutBtn = document.getElementById('adminLogoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      sessionStorage.removeItem('apparel_admin_auth');
      if (!isDemoSession && isBackendConnected()) {
        const { supabaseAdapter } = await import('../store/supabase.js');
        await supabaseAdapter.signOut().catch(() => {});
      }
      isAuthenticated = false;
      isDemoSession = false;
      showLogin();
    });
  }

  // Tab switching
  document.querySelectorAll('.admin-nav-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-nav-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      currentTab = tab.dataset.tab;

      document.querySelectorAll('.admin-tab-screen').forEach((screen) => {
        screen.style.display = screen.id === `tab-${currentTab}` ? 'block' : 'none';
      });

      if (currentTab === 'settings') {
        initBackupSettings();
      }
    });
  });

  // Manual Order Form
  const orderForm = document.getElementById('newOrderForm');
  if (orderForm) {
    orderForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newOrder = {
        customer_name: document.getElementById('orderCustomerName').value.trim(),
        customer_phone: document.getElementById('orderCustomerPhone').value.trim(),
        design_title: document.getElementById('orderDesignTitle').value.trim(),
        amount: parseFloat(document.getElementById('orderAmount').value),
        deposit_amount: parseFloat(document.getElementById('orderDepositAmount').value || 0),
        deposit_status: parseFloat(document.getElementById('orderDepositAmount').value || 0) > 0 ? 'paid' : 'pending',
        source: document.getElementById('orderSource').value,
        status: document.getElementById('orderStatus').value,
        fitting_date: document.getElementById('orderFittingDate').value,
        notes: document.getElementById('orderNotes').value.trim()
      };

      await store.addOrder(newOrder);
      orderForm.reset();
      document.getElementById('newOrderModal').classList.remove('open');
      await refreshAllData();
      showToast('Order recorded successfully.');
    });
  }

  // Expense Chat natural language input
  const expenseChatForm = document.getElementById('expenseChatForm');
  const expenseChatInput = document.getElementById('expenseChatInput');
  const confirmChip = document.getElementById('expenseConfirmChip');

  if (expenseChatForm && expenseChatInput) {
    expenseChatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = expenseChatInput.value.trim();
      if (!text) return;

      const parsed = parseExpenseText(text);
      if (!parsed) {
        showToast('Could not recognize amount in message. Try: "Paid 18k for fabric today"');
        return;
      }

      pendingExpenseParsed = parsed;
      showConfirmChip(parsed);
    });
  }

  // Confirm Chip Save
  const confirmChipSaveBtn = document.getElementById('confirmChipSaveBtn');
  if (confirmChipSaveBtn) {
    confirmChipSaveBtn.addEventListener('click', async () => {
      if (!pendingExpenseParsed) return;
      const saved = await store.addExpense({
        amount: pendingExpenseParsed.amount,
        category: pendingExpenseParsed.category,
        date: pendingExpenseParsed.date,
        description: pendingExpenseParsed.description,
        raw_input: pendingExpenseParsed.rawInput
      });

      lastAddedExpenseId = saved.id;
      pendingExpenseParsed = null;
      hideConfirmChip();
      expenseChatInput.value = '';
      await refreshAllData();

      // Show Undo Toast
      showUndoToast(`Saved ${saved.description} (${formatNaira(saved.amount)})`, saved.id);
    });
  }

  // Confirm Chip Cancel
  const confirmChipCancelBtn = document.getElementById('confirmChipCancelBtn');
  if (confirmChipCancelBtn) {
    confirmChipCancelBtn.addEventListener('click', () => {
      pendingExpenseParsed = null;
      hideConfirmChip();
    });
  }

  // Standard Expense Form
  const standardExpenseForm = document.getElementById('standardExpenseForm');
  if (standardExpenseForm) {
    standardExpenseForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = parseFloat(document.getElementById('expAmount').value);
      const category = document.getElementById('expCategory').value;
      const date = document.getElementById('expDate').value;
      const desc = document.getElementById('expDescription').value.trim();

      const saved = await store.addExpense({
        amount,
        category,
        date,
        description: desc
      });

      standardExpenseForm.reset();
      await refreshAllData();
      showUndoToast(`Expense recorded (${formatNaira(amount)})`, saved.id);
    });
  }

  // Settings: JSON Export
  const exportBtn = document.getElementById('exportBackupBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      const backup = await store.exportAll();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `apparel-ezekiel-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      showToast('Database backup downloaded.');
    });
  }

  // Settings: JSON Import
  const importInput = document.getElementById('importBackupInput');
  if (importInput) {
    importInput.addEventListener('change', async (e) => {
      if (e.target.files && e.target.files[0]) {
        try {
          const text = await e.target.files[0].text();
          const json = JSON.parse(text);
          await store.importAll(json);
          await refreshAllData();
          showToast('Data backup restored successfully.');
        } catch (err) {
          showToast('Error restoring backup. Invalid JSON format.');
        }
      }
    });
  }

  // Settings: Reset to Demo Data
  const resetDemoBtn = document.getElementById('resetDemoDataBtn');
  if (resetDemoBtn) {
    resetDemoBtn.addEventListener('click', async () => {
      if (confirm('Reset database to pristine demo data? Any unsaved edits will be cleared.')) {
        await store.resetToDemo();
        await refreshAllData();
        showToast('Database reset to initial demo dataset.');
      }
    });
  }

  // Order Filters
  document.getElementById('orderSourceFilter')?.addEventListener('change', () => renderOrders());
  document.getElementById('orderStatusFilter')?.addEventListener('change', () => renderOrders());

  // Settings: Measurement Unit
  const unitSelect = document.getElementById('settingMeasureUnit');
  if (unitSelect) {
    unitSelect.value = getMeasurementUnit();
    unitSelect.addEventListener('change', async () => {
      setMeasurementUnit(unitSelect.value);
      await refreshAllData();
      showToast('Measurement unit updated.');
    });
  }

  // Store lifecycle notices
  onUpgradeBlocked(() => {
    const banner = document.getElementById('storeNoticeBanner');
    if (banner) {
      banner.textContent = 'Please close other Apparel tabs to finish updating.';
      banner.style.display = 'block';
    }
  });

  onVersionChange(() => {
    const banner = document.getElementById('storeNoticeBanner');
    if (banner) {
      banner.textContent = 'A newer version is open — please reload.';
      banner.style.display = 'block';
    }
  });

  // Pre-v2 Backup Banner Listeners
  const downloadBackupBannerBtn = document.getElementById('downloadPreV2BackupBannerBtn');
  if (downloadBackupBannerBtn) {
    downloadBackupBannerBtn.addEventListener('click', () => {
      try {
        const raw = localStorage.getItem('apparel_pre_v2_backup');
        if (raw) {
          const blob = new Blob([raw], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          const dateStr = new Date().toISOString().slice(0, 10);
          a.download = `apparel-ezekiel-pre-update-backup-${dateStr}.json`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      } catch (e) {
        console.warn('Backup download failed:', e);
      }
      try {
        localStorage.setItem('apparel_pre_v2_backup_downloaded', 'true');
      } catch (e) {}
      const banner = document.getElementById('preV2BackupBanner');
      if (banner) banner.style.display = 'none';
    });
  }

  const dismissBackupBannerBtn = document.getElementById('dismissPreV2BackupBannerBtn');
  if (dismissBackupBannerBtn) {
    dismissBackupBannerBtn.addEventListener('click', () => {
      try {
        localStorage.setItem('apparel_pre_v2_backup_downloaded', 'true');
      } catch (e) {}
      const banner = document.getElementById('preV2BackupBanner');
      if (banner) banner.style.display = 'none';
    });
  }

  // CRM View Init
  initCrmView({ store, onRefresh: refreshAllData, showToast });
}

export function checkPreV2BackupBanner() {
  const banner = document.getElementById('preV2BackupBanner');
  if (!banner) return;

  if (
    typeof localStorage !== 'undefined' &&
    localStorage.getItem('apparel_pre_v2_backup') &&
    !localStorage.getItem('apparel_pre_v2_backup_downloaded')
  ) {
    banner.style.display = 'block';
  } else {
    banner.style.display = 'none';
  }
}

function showConfirmChip(parsed) {
  const chip = document.getElementById('expenseConfirmChip');
  const text = document.getElementById('confirmChipText');
  if (chip && text) {
    text.innerHTML = `Confirm: <strong>${escapeHtml(parsed.formattedAmount)}</strong> • <span class="label-caps">${escapeHtml(parsed.category)}</span> • ${escapeHtml(parsed.date)} (${escapeHtml(parsed.description)})`;
    chip.style.display = 'flex';
  }
}

function hideConfirmChip() {
  const chip = document.getElementById('expenseConfirmChip');
  if (chip) chip.style.display = 'none';
}

function showUndoToast(msg, expenseId) {
  let toast = document.getElementById('adminToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'adminToast';
    toast.className = 'toast-notice';
    document.body.appendChild(toast);
  }

  toast.innerHTML = `
    <span>${escapeHtml(msg)}</span>
    <button id="toastUndoBtn" class="btn btn-outline btn-sm" style="padding: 4px 10px; margin-left: 8px; border-color: var(--color-gold);">Undo</button>
  `;
  toast.classList.add('show');

  const undoBtn = document.getElementById('toastUndoBtn');
  if (undoBtn) {
    undoBtn.onclick = async () => {
      await store.deleteExpense(expenseId);
      toast.classList.remove('show');
      await refreshAllData();
      showToast('Expense entry reverted.');
    };
  }

  setTimeout(() => {
    toast.classList.remove('show');
  }, 6000);
}

// Render Overview Screen
function renderOverview() {
  const totalOrders = cachedOrders.length;
  const totalRevenue = cachedOrders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
  const totalDeposits = cachedOrders.reduce((sum, o) => sum + (Number(o.deposit_amount) || 0), 0) +
    cachedBookings.filter((b) => b.deposit_status === 'paid').reduce((sum, b) => sum + (Number(b.deposit_amount) || 50000), 0);
  const totalExpenses = cachedExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const netMargin = totalRevenue - totalExpenses;

  // This month calculations (November 2026)
  const currentMonth = new Date().toISOString().slice(0, 7); // '2026-11'
  const monthOrders = cachedOrders.filter((o) => (o.created_at || '').startsWith(currentMonth));
  const monthRevenue = monthOrders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
  const monthExpenses = cachedExpenses.filter((e) => (e.date || '').startsWith(currentMonth)).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  document.getElementById('statTotalOrders').textContent = totalOrders;
  document.getElementById('statRevenue').textContent = formatNaira(totalRevenue);
  document.getElementById('statDeposits').textContent = formatNaira(totalDeposits);
  document.getElementById('statExpenses').textContent = formatNaira(totalExpenses);
  document.getElementById('statNetMargin').textContent = formatNaira(netMargin);

  document.getElementById('statMonthOrders').textContent = monthOrders.length;
  document.getElementById('statMonthRevenue').textContent = formatNaira(monthRevenue);
  document.getElementById('statMonthExpenses').textContent = formatNaira(monthExpenses);
}

// Render Orders Screen
function renderOrders() {
  const container = document.getElementById('ordersTableBody');
  if (!container) return;

  const sourceFilter = document.getElementById('orderSourceFilter')?.value || 'all';
  const statusFilter = document.getElementById('orderStatusFilter')?.value || 'all';

  let list = [...cachedOrders];
  if (sourceFilter !== 'all') list = list.filter((o) => o.source === sourceFilter);
  if (statusFilter !== 'all') list = list.filter((o) => o.status === statusFilter);

  if (list.length === 0) {
    container.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 32px; color: var(--color-text-secondary);">No orders match criteria.</td></tr>`;
    return;
  }

  container.innerHTML = list.map((o) => {
    const normPhone = normalizePhone(o.customer_phone);
    const matchedCustomer = cachedCustomers.find(
      (c) =>
        (o.customer_id && c.id === o.customer_id) ||
        (normPhone && c.phone_norm && c.phone_norm === normPhone)
    );

    const clientHtml = matchedCustomer
      ? `
        <button type="button" class="order-client-profile-link" data-customer-id="${escapeHtml(matchedCustomer.id)}" style="background: none; border: none; padding: 0; text-align: left; cursor: pointer; text-decoration: underline; color: inherit; font-weight: 600; font-size: 0.88rem;">
          ${escapeHtml(o.customer_name)}
        </button>
        <div style="font-size: 0.8rem; color: var(--color-text-secondary);">${escapeHtml(o.customer_phone)}</div>
      `
      : `
        <div style="font-weight: 600;">${escapeHtml(o.customer_name)}</div>
        <div style="font-size: 0.8rem; color: var(--color-text-secondary);">${escapeHtml(o.customer_phone)}</div>
      `;

    const channelClass = {
      'WhatsApp': 'ui-badge-whatsapp',
      'Instagram': 'ui-badge-instagram',
      'Walk-in': 'ui-badge-walkin',
      'Site': 'ui-badge-site'
    }[o.source] || 'ui-badge-secondary';

    return `
      <tr>
        <td style="font-family: monospace; font-size: 0.82rem; color: var(--color-gold);">${escapeHtml(o.id)}</td>
        <td>${clientHtml}</td>
        <td>
          <div>${escapeHtml(o.design_title)}</div>
          <div style="font-size: 0.75rem; color: var(--color-text-muted);">Fitting: ${escapeHtml(o.fitting_date || 'N/A')}</div>
        </td>
        <td>
          <span class="badge ${channelClass}">${escapeHtml(o.source)}</span>
        </td>
        <td>
          <div><strong>${formatNaira(o.amount)}</strong></div>
          <div style="font-size: 0.75rem; color: ${o.deposit_status === 'paid' ? 'var(--success)' : 'var(--color-text-muted)'};">
            Dep: ${formatNaira(o.deposit_amount)} (${escapeHtml(o.deposit_status)})
          </div>
        </td>
        <td>
          <select class="form-select status-select" data-order-id="${escapeHtml(o.id)}" style="padding: 4px 8px; font-size: 0.8rem;">
            ${['Pending', 'Confirmed', 'In Progress', 'Ready', 'Delivered', 'Cancelled'].map((s) => `
              <option value="${s}" ${o.status === s ? 'selected' : ''}>${s}</option>
            `).join('')}
          </select>
        </td>
        <td>
          <button class="btn btn-outline btn-sm delete-order-btn ui-btn-destructive" data-order-id="${escapeHtml(o.id)}" style="padding: 4px 8px; border-color: transparent;">✕</button>
        </td>
      </tr>
    `;
  }).join('');

  // Client profile link click handlers
  container.querySelectorAll('.order-client-profile-link').forEach((btn) => {
    btn.addEventListener('click', () => {
      openCustomerProfile(btn.dataset.customerId, { store, showToast });
    });
  });

  // Status change handlers
  container.querySelectorAll('.status-select').forEach((sel) => {
    sel.addEventListener('change', async (e) => {
      const orderId = e.target.dataset.orderId;
      await store.updateOrder(orderId, { status: e.target.value });
      await refreshAllData();
      showToast(`Order ${orderId} status updated to ${e.target.value}`);
    });
  });

  // Delete handlers
  container.querySelectorAll('.delete-order-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (confirm('Delete this order record?')) {
        await store.deleteOrder(btn.dataset.orderId);
        await refreshAllData();
        showToast('Order removed.');
      }
    });
  });
}

// Render Expenses Screen
function renderExpenses() {
  const container = document.getElementById('expensesListContainer');
  if (!container) return;

  if (cachedExpenses.length === 0) {
    container.innerHTML = `<p style="padding: 24px; text-align: center; color: var(--color-text-secondary);">No expenses recorded.</p>`;
    return;
  }

  container.innerHTML = cachedExpenses.map((exp) => `
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--border); background: var(--card);">
      <div style="display: flex; align-items: center; gap: 14px;">
        <span class="badge ui-badge-secondary">${escapeHtml(exp.category)}</span>
        <div>
          <div style="font-weight: 500; font-size: 0.875rem;">${escapeHtml(exp.description || exp.category)}</div>
          <div style="font-size: 0.78rem; color: var(--color-text-secondary);">${escapeHtml(exp.date)} ${exp.raw_input ? `• "${escapeHtml(exp.raw_input)}"` : ''}</div>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 16px;">
        <div style="font-weight: 700; color: var(--foreground); font-size: 1rem;">${formatNaira(exp.amount)}</div>
        <button class="btn btn-outline btn-sm delete-expense-btn ui-btn-destructive" data-exp-id="${escapeHtml(exp.id)}" style="padding: 4px 8px; border-color: transparent;">✕</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.delete-expense-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await store.deleteExpense(btn.dataset.expId);
      await refreshAllData();
      showToast('Expense deleted.');
    });
  });
}

// Render Bookings Leads
function renderBookingsLeads() {
  const container = document.getElementById('bookingsLeadList');
  if (!container) return;

  if (cachedBookings.length === 0) {
    container.innerHTML = `<p style="padding: 16px; color: var(--color-text-secondary);">No online booking inquiries yet.</p>`;
    return;
  }

  container.innerHTML = cachedBookings.map((b) => `
    <div style="padding: 12px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
      <div>
        <div style="font-weight: 600;">${escapeHtml(b.customer_name)} <span style="font-size: 0.8rem; font-weight: normal; color: var(--color-text-secondary);">(${escapeHtml(b.phone)})</span></div>
        <div style="font-size: 0.82rem; color: var(--color-gold);">${escapeHtml(b.design_title)} • Fitting: ${escapeHtml(b.fitting_date)}</div>
        ${b.notes ? `<div style="font-size: 0.78rem; color: var(--color-text-muted);">Note: ${escapeHtml(b.notes)}</div>` : ''}
      </div>
      <div style="text-align: right;">
        <span class="badge ${b.deposit_status === 'paid' ? 'ui-badge-default' : 'ui-badge-outline'}" style="${b.deposit_status === 'paid' ? 'background: rgba(34, 197, 94, 0.15); color: var(--success); border-color: rgba(34, 197, 94, 0.3);' : ''}">
          ${b.deposit_status === 'paid' ? 'Deposit Paid' : 'Deposit Pending'}
        </span>
        <div style="margin-top: 6px;">
          <button class="btn btn-outline btn-sm convert-to-order-btn" data-booking-id="${escapeHtml(b.id)}" style="font-size: 0.7rem; padding: 2px 8px;">
            Convert to Order
          </button>
        </div>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.convert-to-order-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const b = cachedBookings.find((item) => item.id === btn.dataset.bookingId);
      if (b) {
        await store.addOrder({
          booking_id: b.id,
          customer_name: b.customer_name,
          customer_phone: b.phone,
          design_title: b.design_title,
          amount: 250000,
          deposit_amount: b.deposit_status === 'paid' ? 50000 : 0,
          deposit_status: b.deposit_status,
          source: 'Site',
          status: 'Confirmed',
          fitting_date: b.fitting_date,
          notes: b.notes
        });
        await refreshAllData();
        showToast('Converted booking inquiry into confirmed atelier order.');
      }
    });
  });
}

function formatNaira(num) {
  return `₦${(Number(num) || 0).toLocaleString('en-NG')}`;
}

function showToast(message) {
  let toast = document.getElementById('adminToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'adminToast';
    toast.className = 'toast-notice';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}
