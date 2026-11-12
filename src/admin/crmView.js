/**
 * Simple CRM Admin UI View (src/admin/crmView.js)
 * Adheres to: EXTREME SIMPLICITY, PROGRESSIVE DISCLOSURE, ONLY ESSENTIAL FIELDS.
 * Gold accent ONLY for:
 * 1. Due dot (#B89B6A)
 * 2. Primary button (.btn-primary)
 * 3. Follow-up card left edge (border-left: 3px solid var(--color-gold))
 */

import {
  STATUS_COLORS,
  MEASUREMENT_FIELDS,
  CUSTOMER_SOURCES,
  normalizePhone,
  ordersForCustomer,
  deriveStatus,
  nextFollowUp,
  validateMeasurements,
  formatMeasurement,
  findPossibleDuplicates,
  escapeHtml
} from './crm.js';

let activeCustomer = null;
let cachedCustomers = [];
let cachedOrders = [];
let refreshCallback = null;
let appStore = null;
let appShowToast = null;

export function getMeasurementUnit() {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('apparel_measure_unit') || 'in';
  }
  return 'in';
}

export function setMeasurementUnit(unit) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('apparel_measure_unit', unit === 'cm' ? 'cm' : 'in');
  }
}

export function initCrmView({ store, onRefresh, showToast }) {
  refreshCallback = onRefresh;
  appStore = store;
  appShowToast = showToast;

  // Backdrop click to close modals
  ['addCustomerModal', 'customerProfileModal'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', (e) => {
        if (e.target === el) el.classList.remove('open');
      });
    }
  });

  // Add Customer modal submit
  const addCustForm = document.getElementById('addCustomerForm');
  if (addCustForm) {
    addCustForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('addCustName').value.trim();
      const phone = document.getElementById('addCustPhone').value.trim();
      const source = document.getElementById('addCustSource').value;

      if (!name || !phone) return;

      const newCustomer = await store.addCustomer({ name, phone, source });
      addCustForm.reset();
      closeModal('addCustomerModal');

      if (refreshCallback) await refreshCallback();
      showToast('Client added.');
      openCustomerProfile(newCustomer.id, { store, showToast });
    });
  }

  // Search input progressive disclosure
  const searchToggleBtn = document.getElementById('crmSearchToggleBtn');
  const searchInput = document.getElementById('crmSearchInput');
  if (searchToggleBtn && searchInput) {
    searchToggleBtn.addEventListener('click', () => {
      const isHidden = searchInput.style.display === 'none';
      searchInput.style.display = isHidden ? 'inline-block' : 'none';
      if (isHidden) {
        searchInput.focus();
      } else {
        searchInput.value = '';
        renderClientsList();
      }
    });

    searchInput.addEventListener('input', () => {
      renderClientsList();
    });
  }

  // Pre-update backup check in settings
  initBackupSettings();
}

export function renderClientsView({ customers, orders, store, showToast }) {
  cachedCustomers = customers || [];
  cachedOrders = orders || [];

  renderFollowUpCard({ store, showToast });
  renderClientsList({ store, showToast });
}

function renderFollowUpCard({ store, showToast }) {
  const container = document.getElementById('crmFollowUpCardContainer');
  if (!container) return;

  const today = new Date().toISOString().slice(0, 10);
  const next = nextFollowUp(cachedCustomers, today);

  if (!next) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }

  // Calculate overdue relative text
  let dueText = 'Today';
  if (next.due < today) {
    const diffMs = new Date(today) - new Date(next.due);
    const diffDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
    dueText = `Overdue · ${diffDays} ${diffDays === 1 ? 'day' : 'days'}`;
  }

  const phoneDigits = (next.phone_norm || '').replace(/\D/g, '');

  container.style.display = 'block';
  container.innerHTML = `
    <div id="activeFollowUpCard" style="background: var(--card); border: 1px solid var(--border); border-left: 3px solid var(--gold); padding: 18px 20px; border-radius: var(--radius); margin-bottom: 24px; transition: opacity 240ms cubic-bezier(0.2, 0.7, 0.2, 1), transform 240ms cubic-bezier(0.2, 0.7, 0.2, 1);">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
        <div>
          <div class="label-caps" style="color: var(--gold); margin-bottom: 4px;">Follow up</div>
          <button type="button" id="followUpClientNameBtn" style="background: none; border: none; padding: 0; font-family: var(--font-display); font-size: 1.35rem; font-weight: 600; color: var(--foreground); cursor: pointer; text-align: left;">
            ${escapeHtml(next.customerName || next.name)}
          </button>
          <div style="font-size: 0.88rem; color: var(--foreground); margin: 6px 0 10px;">
            ${escapeHtml(next.note || '')}
          </div>
          <div style="font-size: 0.78rem; color: var(--muted-foreground);">
            Due: <strong>${escapeHtml(dueText)}</strong> (${escapeHtml(next.due)})
          </div>
        </div>

        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          ${
            phoneDigits
              ? `<a href="https://wa.me/${phoneDigits}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm ui-btn ui-btn-outline ui-btn-sm" style="border-color: rgba(37, 211, 102, 0.4); color: #25D366; padding: 6px 14px; font-size: 0.75rem;">WhatsApp ↗</a>`
              : ''
          }
          <button type="button" id="markFollowUpDoneBtn" class="btn btn-outline btn-sm ui-btn ui-btn-outline ui-btn-sm" style="padding: 6px 14px; font-size: 0.75rem;">
            Mark Done
          </button>
        </div>
      </div>
    </div>
  `;

  // Tapping client name opens profile
  const nameBtn = document.getElementById('followUpClientNameBtn');
  if (nameBtn) {
    nameBtn.addEventListener('click', () => {
      openCustomerProfile(next.customerId || next.id, { store, showToast });
    });
  }

  // Mark Done action with smooth fadeout
  const doneBtn = document.getElementById('markFollowUpDoneBtn');
  if (doneBtn) {
    doneBtn.addEventListener('click', async () => {
      const card = document.getElementById('activeFollowUpCard');
      if (card) {
        card.style.opacity = '0';
        card.style.transform = 'translateY(-6px)';
      }

      setTimeout(async () => {
        await store.updateCustomer(next.customerId || next.id, {
          follow_up: {
            ...next.follow_up,
            done_at: new Date().toISOString()
          }
        });
        if (refreshCallback) await refreshCallback();
        showToast('Follow-up marked as completed.');
      }, 240);
    });
  }
}

function renderClientsList({ store, showToast } = {}) {
  const container = document.getElementById('crmClientsList');
  if (!container) return;

  const searchInput = document.getElementById('crmSearchInput');
  const query = (searchInput?.value || '').trim().toLowerCase();

  let list = [...cachedCustomers];
  if (query) {
    list = list.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(query) ||
        (c.phone || '').includes(query) ||
        (c.phone_norm || '').includes(query)
    );
  }

  if (list.length === 0) {
    if (cachedCustomers.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 48px 20px; color: var(--color-text-secondary);">
          <p style="margin-bottom: 16px; font-size: 0.95rem;">No clients yet.</p>
          <button type="button" class="btn btn-primary btn-sm" onclick="document.getElementById('addCustomerModal').classList.add('open')">
            + Add Customer
          </button>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div style="text-align: center; padding: 36px 20px; color: var(--color-text-secondary); font-size: 0.88rem;">
          No clients match "${escapeHtml(query)}".
        </div>
      `;
    }
    return;
  }

  const today = new Date().toISOString().slice(0, 10);

  container.innerHTML = list
    .map((c) => {
      const status = deriveStatus(c, cachedOrders, today);
      const dotColor = STATUS_COLORS[status] || STATUS_COLORS.quiet;

      return `
        <div class="crm-client-row" data-customer-id="${escapeHtml(c.id)}" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 18px; border-bottom: 1px solid var(--border); cursor: pointer; min-height: 44px; transition: background-color var(--duration-hover) var(--ease-out);">
          <div style="display: flex; align-items: center; gap: 14px; min-width: 0;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${dotColor}; flex-shrink: 0;" title="Status: ${status}"></span>
            <span style="font-weight: 500; font-size: 0.92rem; color: var(--foreground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(c.name)}</span>
          </div>
          <div style="font-size: 0.84rem; color: var(--muted-foreground); white-space: nowrap; margin-left: 12px;">
            ${escapeHtml(c.phone)}
          </div>
        </div>
      `;
    })
    .join('');

  container.querySelectorAll('.crm-client-row').forEach((row) => {
    row.addEventListener('click', () => {
      openCustomerProfile(row.dataset.customerId, { store, showToast });
    });
  });
}

export function openCustomerProfile(customerId, { store, showToast } = {}) {
  const usedStore = store || appStore;
  const usedToast = showToast || appShowToast;
  const customer = cachedCustomers.find((c) => c.id === customerId);
  if (!customer) return;

  activeCustomer = customer;
  const modal = document.getElementById('customerProfileModal');
  const content = document.getElementById('customerProfileContent');
  if (!modal || !content) return;

  const today = new Date().toISOString().slice(0, 10);
  const status = deriveStatus(customer, cachedOrders, today);
  const dotColor = STATUS_COLORS[status] || STATUS_COLORS.quiet;
  const linkedOrders = ordersForCustomer(customer, cachedOrders);
  const duplicates = findPossibleDuplicates(customer, cachedCustomers);
  const phoneDigits = (customer.phone_norm || '').replace(/\D/g, '');
  const unit = getMeasurementUnit();
  const isCm = unit === 'cm';

  // Measurements display values
  const m = customer.measurements || {};

  content.innerHTML = `
    <!-- Header Card -->
    <div style="background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin-bottom: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;">
        <div>
          <h3 style="font-family: var(--font-display); font-size: 1.6rem; line-height: 1.1; margin: 0 0 6px; color: var(--foreground);">
            ${escapeHtml(customer.name)}
          </h3>
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <span style="font-size: 0.88rem; color: var(--muted-foreground);">${escapeHtml(customer.phone)}</span>
            ${
              phoneDigits
                ? `<a href="https://wa.me/${phoneDigits}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm" style="border-color: rgba(37, 211, 102, 0.4); color: #25D366; padding: 2px 10px; font-size: 0.72rem; min-height: 36px; display: inline-flex; align-items: center;">WhatsApp ↗</a>`
                : ''
            }
          </div>
        </div>

        <div style="text-align: right;">
          <span style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; color: ${dotColor};">
            <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${dotColor};"></span>
            ${status}
          </span>
        </div>
      </div>

      <!-- Possible Duplicate subtle hint -->
      ${
        duplicates.length > 0
          ? `
        <div style="margin-top: 12px; padding: 8px 12px; background: rgba(246, 243, 238, 0.04); border-left: 2px solid var(--color-text-secondary); font-size: 0.78rem; color: var(--muted-foreground);">
          Possible duplicate of ${escapeHtml(duplicates.map((d) => d.name).join(', '))} (shared phone).
        </div>
      `
          : ''
      }
    </div>

    <!-- Accordion 1: Linked Orders -->
    <details class="profile-accordion" id="accordionOrders" open>
      <summary class="profile-accordion-summary">
        <span>Linked Orders (${linkedOrders.length})</span>
        <span class="disclosure-arrow">▾</span>
      </summary>
      <div class="profile-accordion-content">
        ${
          linkedOrders.length === 0
            ? '<p style="color: var(--muted-foreground); font-size: 0.85rem; margin: 0;">No orders yet.</p>'
            : `
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${linkedOrders
                .map(
                  (o) => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: var(--secondary); border: 1px solid var(--border); border-radius: var(--radius-sm);">
                  <div>
                    <div style="font-size: 0.78rem; font-family: monospace; color: var(--gold);">${escapeHtml(o.id)}</div>
                    <div style="font-weight: 500; font-size: 0.88rem; color: var(--foreground);">${escapeHtml(o.design_title)}</div>
                  </div>
                  <span class="badge ui-badge-secondary">${escapeHtml(o.status)}</span>
                </div>
              `
                )
                .join('')}
            </div>
          `
        }
      </div>
    </details>

    <!-- Accordion 2: Measurements -->
    <details class="profile-accordion" id="accordionMeasurements">
      <summary class="profile-accordion-summary">
        <span>Body Measurements (${isCm ? 'cm' : 'inches'})</span>
        <span class="disclosure-arrow">▾</span>
      </summary>
      <div class="profile-accordion-content">
        <form id="profileMeasurementsForm">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-bottom: 14px;">
            ${MEASUREMENT_FIELDS.map((field) => {
              const inchVal = m[field];
              let displayVal = '';
              if (inchVal != null && inchVal !== '') {
                displayVal = isCm ? Math.round(inchVal * 2.54) : inchVal;
              }

              return `
                <div class="form-group" style="margin-bottom: 0;">
                  <label class="form-label" for="m_${field}" style="font-size: 0.72rem;">
                    ${field.charAt(0).toUpperCase() + field.slice(1)} (${isCm ? 'cm' : '"'})
                  </label>
                  <input
                    type="number"
                    step="${isCm ? '1' : '0.25'}"
                    id="m_${field}"
                    class="form-input measurement-field"
                    data-field="${field}"
                    value="${displayVal}"
                    style="padding: 8px 10px; font-size: 0.88rem; min-height: 40px;"
                  />
                  <div class="m-error-msg" id="err_${field}" style="display: none; color: #D9534F; font-size: 0.72rem; margin-top: 4px;"></div>
                </div>
              `;
            }).join('')}
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div style="font-size: 0.75rem; color: var(--muted-foreground);" id="measurementsUpdatedDate">
              ${m.updated_at ? `Updated ${new Date(m.updated_at).toLocaleDateString()}` : ''}
            </div>
            <button type="submit" class="btn btn-outline btn-sm" style="padding: 6px 16px; font-size: 0.78rem; min-height: 40px;">
              Save Measurements
            </button>
          </div>
        </form>
      </div>
    </details>

    <!-- Accordion 3: Follow-ups & Reminders -->
    <details class="profile-accordion" id="accordionFollowUps">
      <summary class="profile-accordion-summary">
        <span>Follow-ups & Reminders ${customer.follow_up?.due && !customer.follow_up?.done_at ? `• Due ${escapeHtml(customer.follow_up.due)}` : ''}</span>
        <span class="disclosure-arrow">▾</span>
      </summary>
      <div class="profile-accordion-content">
        ${
          customer.follow_up?.due && !customer.follow_up?.done_at
            ? `
            <div style="padding: 12px; background: var(--secondary); border: 1px solid var(--border); border-left: 3px solid var(--gold); border-radius: var(--radius-sm); margin-bottom: 12px;">
              <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--gold); font-weight: 600;">Active Follow-up Due</div>
              <div style="font-weight: 600; font-size: 0.95rem; margin: 4px 0;">${escapeHtml(customer.follow_up.note || 'Fitting check-in')}</div>
              <div style="font-size: 0.8rem; color: var(--muted-foreground);">Scheduled for: <strong>${escapeHtml(customer.follow_up.due)}</strong></div>
            </div>
          `
            : '<p style="color: var(--muted-foreground); font-size: 0.85rem; margin: 0 0 10px;">No pending follow-ups scheduled.</p>'
        }

        <div style="margin-bottom: 10px;">
          <button type="button" id="toggleSetFollowUpBtn" class="btn btn-outline btn-sm" style="min-height: 38px;">
            ${customer.follow_up?.due && !customer.follow_up?.done_at ? 'Reschedule follow-up' : '+ Schedule follow-up'}
          </button>
        </div>

        <!-- Schedule / Reschedule Follow-up Panel -->
        <div id="setFollowUpPanel" style="display: none; padding: 14px; background: var(--secondary); border: 1px solid var(--border); border-radius: var(--radius-sm);">
          <div class="label-caps" style="margin-bottom: 8px; font-size: 0.7rem;">Schedule Follow-up</div>
          <form id="profileFollowUpForm">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
              <div>
                <label class="form-label" for="profileFollowUpDue" style="font-size: 0.7rem;">Due Date *</label>
                <input type="date" id="profileFollowUpDue" class="form-input" style="padding: 6px 10px; font-size: 0.82rem; min-height: 40px;" value="${escapeHtml(customer.follow_up?.due || today)}" required />
              </div>
              <div>
                <label class="form-label" for="profileFollowUpNote" style="font-size: 0.7rem;">Short Note *</label>
                <input type="text" id="profileFollowUpNote" class="form-input" style="padding: 6px 10px; font-size: 0.82rem; min-height: 40px;" placeholder="e.g. Call for second fitting" value="${escapeHtml(customer.follow_up?.note || '')}" required />
              </div>
            </div>
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
              <button type="button" id="cancelFollowUpBtn" class="btn btn-outline btn-sm" style="padding: 6px 12px; font-size: 0.75rem; min-height: 38px;">Cancel</button>
              <button type="submit" class="btn btn-primary btn-sm" style="padding: 6px 14px; font-size: 0.75rem; min-height: 38px;">Save Follow-up</button>
            </div>
          </form>
        </div>
      </div>
    </details>

    <!-- Accordion 4: Notes -->
    <details class="profile-accordion" id="accordionNotes">
      <summary class="profile-accordion-summary">
        <span>Atelier Client Notes</span>
        <span class="disclosure-arrow">▾</span>
      </summary>
      <div class="profile-accordion-content">
        <div style="position: relative;">
          <textarea
            id="profileNotesInput"
            class="form-textarea"
            placeholder="Style preferences, fabric choices, fitting remarks..."
            style="min-height: 80px; font-size: 0.88rem;"
          >${escapeHtml(customer.notes || '')}</textarea>
          <div style="display: flex; justify-content: flex-end; margin-top: 4px;">
            <span id="notesSavedIndicator" style="font-size: 0.75rem; color: var(--muted-foreground); opacity: 0; transition: opacity 200ms;">Saved</span>
          </div>
        </div>
      </div>
    </details>

    <!-- Delete client -->
    <div style="padding-top: 16px; text-align: center;">
      <button type="button" id="deleteClientBtn" style="background: none; border: none; color: var(--muted-foreground); font-size: 0.78rem; cursor: pointer; text-decoration: underline; padding: 10px; min-height: 44px;">
        Delete client
      </button>
    </div>
  `;

  // Follow-up toggle handler
  const toggleBtn = document.getElementById('toggleSetFollowUpBtn');
  const panel = document.getElementById('setFollowUpPanel');
  const cancelFollowUpBtn = document.getElementById('cancelFollowUpBtn');
  if (toggleBtn && panel) {
    toggleBtn.addEventListener('click', () => {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
  }
  if (cancelFollowUpBtn && panel) {
    cancelFollowUpBtn.addEventListener('click', () => {
      panel.style.display = 'none';
    });
  }

  // Follow-up form submit
  const followUpForm = document.getElementById('profileFollowUpForm');
  if (followUpForm) {
    followUpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const due = document.getElementById('profileFollowUpDue').value;
      const note = document.getElementById('profileFollowUpNote').value.trim();

      await usedStore.updateCustomer(customer.id, {
        follow_up: {
          due,
          note,
          done_at: null
        }
      });

      if (refreshCallback) await refreshCallback();
      usedToast('Follow-up scheduled.');
      openCustomerProfile(customer.id, { store: usedStore, showToast: usedToast });
    });
  }

  // Measurements form submit & validation
  const mForm = document.getElementById('profileMeasurementsForm');
  if (mForm) {
    mForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const rawValues = {};
      MEASUREMENT_FIELDS.forEach((f) => {
        const input = document.getElementById(`m_${f}`);
        rawValues[f] = input ? input.value.trim() : '';
        const errEl = document.getElementById(`err_${f}`);
        if (errEl) errEl.style.display = 'none';
      });

      const validated = validateMeasurements(rawValues, unit);
      if (!validated.ok) {
        for (const [field, msg] of Object.entries(validated.errors)) {
          const errEl = document.getElementById(`err_${field}`);
          if (errEl) {
            errEl.textContent = msg;
            errEl.style.display = 'block';
          }
        }
        return;
      }

      await usedStore.updateCustomer(customer.id, {
        measurements: {
          ...validated.inches,
          updated_at: new Date().toISOString()
        }
      });

      if (refreshCallback) await refreshCallback();
      usedToast('Measurements saved.');
      openCustomerProfile(customer.id, { store: usedStore, showToast: usedToast });
    });
  }

  // Notes autosave on blur
  const notesTextarea = document.getElementById('profileNotesInput');
  const savedIndicator = document.getElementById('notesSavedIndicator');
  if (notesTextarea) {
    notesTextarea.addEventListener('blur', async () => {
      const val = notesTextarea.value.trim();
      if (val !== (customer.notes || '')) {
        await usedStore.updateCustomer(customer.id, { notes: val });
        customer.notes = val;
        if (refreshCallback) await refreshCallback();
        if (savedIndicator) {
          savedIndicator.style.opacity = '1';
          setTimeout(() => {
            savedIndicator.style.opacity = '0';
          }, 1500);
        }
      }
    });
  }

  // Delete client handler
  const deleteBtn = document.getElementById('deleteClientBtn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (confirm('Delete client record? (Orders will not be deleted)')) {
        await usedStore.deleteCustomer(customer.id);
        closeModal('customerProfileModal');
        if (refreshCallback) await refreshCallback();
        usedToast('Client record deleted.');
      }
    });
  }

  modal.classList.add('open');
}

export function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('open');
}

export function initBackupSettings() {
  const backupKey = 'apparel_pre_v2_backup';
  const container = document.getElementById('preV2BackupNotice');
  if (!container) return;

  if (typeof localStorage !== 'undefined' && localStorage.getItem(backupKey)) {
    container.style.display = 'block';
    const downloadBtn = document.getElementById('downloadPreV2BackupBtn');
    if (downloadBtn) {
      downloadBtn.onclick = () => {
        try {
          const raw = localStorage.getItem(backupKey);
          const blob = new Blob([raw], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `apparel-pre-v2-backup-${new Date().toISOString().slice(0, 10)}.json`;
          a.click();
          localStorage.removeItem(backupKey);
          container.style.display = 'none';
          const banner = document.getElementById('preV2BackupBanner');
          if (banner) banner.style.display = 'none';
        } catch (e) {
          console.warn('Backup download failed:', e);
        }
      };
    }
  } else {
    container.style.display = 'none';
  }
}
