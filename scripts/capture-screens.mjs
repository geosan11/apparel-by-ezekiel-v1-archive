import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const outDir = process.argv[2] || 'docs/screenshots/redesign/after';
fs.mkdirSync(outDir, { recursive: true });
const apparelShotsDir = '/workspace/apparel_shots';
fs.mkdirSync(apparelShotsDir, { recursive: true });

const PORT = 5199;
const CDP_PORT = 9447;
const PROFILE_DIR = `/tmp/chrome-profile-${Date.now()}`;
fs.mkdirSync(PROFILE_DIR, { recursive: true });

console.log(`Starting Vite dev server on port ${PORT}...`);
const vite = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
  stdio: 'inherit',
  cwd: process.cwd()
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Wait for Vite to be up
for (let i = 0; i < 30; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/`);
    if (res.ok) {
      console.log('Vite dev server is ready.');
      break;
    }
  } catch (e) {}
  await sleep(300);
}

console.log(`Starting headless Chrome on port ${CDP_PORT}...`);
const chrome = spawn('google-chrome', [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${PROFILE_DIR}`,
  'about:blank'
], { stdio: 'ignore' });

let tabs;
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
    tabs = await res.json();
    if (tabs.find((t) => t.type === 'page')) break;
  } catch (e) {}
  await sleep(250);
}

const pageTab = tabs.find((t) => t.type === 'page');
if (!pageTab) {
  console.error('Could not find Chrome page tab!');
  chrome.kill();
  vite.kill();
  process.exit(1);
}

const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener('open', resolve));

let reqId = 0;
const pending = new Map();
const consoleLogs = [];

ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    consoleLogs.push('ERR: ' + m.params.args.map((a) => a.value || a.description).join(' '));
  }
  if (m.method === 'Runtime.exceptionThrown') {
    consoleLogs.push('EXC: ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text));
  }
  if (pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});

const send = (method, params = {}) =>
  new Promise((resolve) => {
    const i = ++reqId;
    pending.set(i, resolve);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

const evaluate = async (expr) => {
  const res = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  return res.result?.result?.value;
};

await send('Runtime.enable');
await send('Page.enable');

const viewports = [
  { tag: 'desktop', width: 1280, height: 800, mobile: false },
  { tag: 'mobile', width: 390, height: 844, mobile: true }
];

async function capture(filename, apparelShotName = null) {
  await sleep(600);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(shot.result.data, 'base64');
  const filepath = path.join(outDir, filename);
  fs.writeFileSync(filepath, buf);
  console.log(`Saved screenshot: ${filepath}`);

  if (apparelShotName) {
    const shotPath = path.join(apparelShotsDir, apparelShotName);
    fs.writeFileSync(shotPath, buf);
    console.log(`Saved copy to apparel_shots: ${shotPath}`);
  }
}

async function captureFullPage(filename, apparelShotName = null) {
  await sleep(600);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const buf = Buffer.from(shot.result.data, 'base64');
  if (filename) {
    const filepath = path.join(outDir, filename);
    fs.writeFileSync(filepath, buf);
    console.log(`Saved full-page screenshot: ${filepath}`);
  }
  if (apparelShotName) {
    const shotPath = path.join(apparelShotsDir, apparelShotName);
    fs.writeFileSync(shotPath, buf);
    console.log(`Saved copy to apparel_shots: ${shotPath}`);
  }
}

try {
  for (const vp of viewports) {
    console.log(`\n--- Capturing for viewport: ${vp.tag} (${vp.width}x${vp.height}) ---`);
    await send('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 1,
      mobile: vp.mobile
    });

    // 1. PUBLIC NAV & HERO
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    await sleep(2000);
    const heroOverflow = await evaluate(`({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth })`);
    console.log(`[Viewport ${vp.tag}] Home dimensions: clientWidth=${heroOverflow?.clientWidth}, scrollWidth=${heroOverflow?.scrollWidth}`);
    
    // Viewport shot
    const deskOrMobName = vp.mobile ? 'light_mobile.png' : 'light_desk.png';
    await capture(`01-public-nav-hero-${vp.tag}.png`, deskOrMobName);
    if (vp.mobile) {
      fs.copyFileSync(path.join(apparelShotsDir, 'light_mobile.png'), path.join(apparelShotsDir, 'mobile_disclosure_homepage.png'));
    }

    // Ensure all reveal elements are visible and capture full page
    await evaluate(`document.querySelectorAll('.reveal-on-scroll').forEach(el => el.classList.add('revealed'))`);
    await sleep(500);
    const fullDeskOrMobName = vp.mobile ? 'light_full_mobile.png' : 'light_full_desk.png';
    await captureFullPage(null, fullDeskOrMobName);

    // 2. PUBLIC GALLERY SCROLLED (with card progressive disclosure open)
    await evaluate(`window.scrollTo(0, 750)`);
    await sleep(800);
    if (vp.mobile) {
      // Open progressive disclosure accordion on the first design card
      await evaluate(`
        const disc = document.querySelector('.card-details-disclosure');
        if (disc) disc.setAttribute('open', '');
      `);
      await sleep(400);
    }
    await capture(`02-public-gallery-${vp.tag}.png`, vp.mobile ? 'mobile_disclosure_gallery_card.png' : null);

    // 2b. PUBLIC DESIGN DETAIL MODAL (showing progressive disclosure accordions)
    await evaluate(`
      const detailLink = document.querySelector('.design-detail-link');
      if (detailLink) detailLink.click();
    `);
    await sleep(800);
    if (vp.mobile) {
      await evaluate(`
        const firstDetailAcc = document.querySelector('#detailModalContent .detail-accordion');
        if (firstDetailAcc) firstDetailAcc.setAttribute('open', '');
      `);
      await sleep(400);
    }
    await capture(`02b-public-detail-${vp.tag}.png`, vp.mobile ? 'mobile_disclosure_detail.png' : null);
    await evaluate(`
      document.querySelector('#modalDetail .modal-close-btn')?.click();
      document.getElementById('modalDetail')?.classList.remove('open');
    `);
    await sleep(400);

    // 3. 3D PREVIEW MODAL
    await evaluate(`
      const btn3d = document.querySelector('.card-action-btn[data-action="3d"]') || document.getElementById('openModal3d');
      if (btn3d) btn3d.click();
    `);
    await sleep(1500);
    await capture(`03-public-3d-frame-${vp.tag}.png`);
    // Close 3D modal
    await evaluate(`
      const closeBtn = document.getElementById('closeModal3d') || document.querySelector('#modal3d .modal-close-btn');
      if (closeBtn) closeBtn.click();
      document.getElementById('modal3d')?.classList.remove('open');
    `);
    await sleep(500);

    // 4. TRY-ON PANEL
    await evaluate(`
      const tryonBtn = document.querySelector('.card-action-btn[data-action="tryon"]');
      if (tryonBtn) tryonBtn.click();
      else document.getElementById('modalTryOn')?.classList.add('open');
    `);
    await sleep(1500);
    await capture(`04-public-tryon-${vp.tag}.png`);
    // Close try-on modal
    await evaluate(`
      document.querySelector('#modalTryOn .modal-close-btn')?.click();
      document.getElementById('modalTryOn')?.classList.remove('open');
    `);
    await sleep(500);

    // 5. BOOKING FORM MODAL (with optional details disclosure open)
    await evaluate(`
      const bookBtn = document.querySelector('.design-card') ? document.querySelector('.card-action-btn[data-action="book"]') : null;
      if (bookBtn) {
        bookBtn.click();
      } else {
        document.getElementById('modalBooking')?.classList.add('open');
      }
    `);
    await sleep(800);
    // Expand optional details disclosure
    await evaluate(`
      const optDetails = document.getElementById('bookingOptionalDetails');
      if (optDetails) optDetails.setAttribute('open', '');
    `);
    await sleep(400);
    await capture(`05-public-booking-form-${vp.tag}.png`, vp.mobile ? 'mobile_disclosure_booking.png' : null);

    // 6. PAYMENT / DEPOSIT SUMMARY (with deposit breakdown disclosure open)
    await evaluate(`
      document.getElementById('bookingName').value = 'Chief Adebayo Alabi';
      document.getElementById('bookingPhone').value = '+234 803 123 4567';
      document.getElementById('bookingDate').value = '2026-11-20';
      const form = document.getElementById('bookingForm');
      form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    `);
    await sleep(1200);
    // Expand deposit breakdown disclosure
    await evaluate(`
      const depBreakdown = document.querySelector('.deposit-breakdown-disclosure');
      if (depBreakdown) depBreakdown.setAttribute('open', '');
    `);
    await sleep(400);
    await capture(`06-payment-deposit-summary-${vp.tag}.png`, vp.mobile ? 'mobile_disclosure_payment.png' : null);

    // 7. OPAY MODAL
    await evaluate(`
      document.getElementById('simulateOpayBtn')?.click();
    `);
    await sleep(1000);
    await capture(`07-payment-opay-modal-${vp.tag}.png`);
    // Close opay modal and booking modal
    await evaluate(`
      document.getElementById('completeOpaySimBtn')?.click();
      document.getElementById('opayModal')?.classList.remove('open');
      document.getElementById('modalBooking')?.classList.remove('open');
    `);
    await sleep(500);

    // 8. ADMIN LOGIN
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/admin.html` });
    await sleep(1500);
    // Clear session to show login view
    await evaluate(`
      sessionStorage.clear();
      location.reload();
    `);
    await sleep(1500);
    await capture(`08-admin-login-${vp.tag}.png`);

    // Log in with Demo
    await evaluate(`
      document.getElementById('demoLoginBtn')?.click();
    `);
    await sleep(1500);

    // 9. ADMIN OVERVIEW
    await capture(`09-admin-overview-${vp.tag}.png`);

    // 10. ADMIN ORDERS TAB (with filters disclosure and order card accordion open)
    await evaluate(`
      document.querySelector('button[data-tab="orders"]')?.click();
    `);
    await sleep(1000);
    if (vp.mobile) {
      await evaluate(`
        const filtersDisc = document.getElementById('orderFiltersDisclosure');
        if (filtersDisc) filtersDisc.setAttribute('open', '');
        const orderCardDisc = document.querySelector('.order-card-accordion');
        if (orderCardDisc) orderCardDisc.setAttribute('open', '');
      `);
      await sleep(400);
    }
    await capture(`10-admin-orders-${vp.tag}.png`, vp.mobile ? 'mobile_disclosure_admin_orders.png' : null);

    // 11. ADMIN ORDER DETAIL SHEET (Client profile from orders, with accordions)
    await evaluate(`
      const clientLink = document.querySelector('.order-client-profile-link');
      if (clientLink) clientLink.click();
    `);
    await sleep(1000);
    if (vp.mobile) {
      await evaluate(`
        const mAcc = document.getElementById('accordionMeasurements');
        if (mAcc) mAcc.setAttribute('open', '');
      `);
      await sleep(400);
    }
    await capture(`11-admin-order-sheet-${vp.tag}.png`);
    // Close client profile modal
    await evaluate(`
      document.getElementById('customerProfileModal')?.classList.remove('open');
    `);
    await sleep(500);

    // 12. ADMIN EXPENSES TAB
    await evaluate(`
      document.querySelector('button[data-tab="expenses"]')?.click();
    `);
    await sleep(1000);
    await capture(`12-admin-expenses-${vp.tag}.png`);

    // 13. ADMIN EXPENSE CHAT (with parsed chip)
    await evaluate(`
      const input = document.getElementById('expenseChatInput');
      input.value = 'Paid 35k for damask fabric today';
      const form = document.getElementById('expenseChatForm');
      form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    `);
    await sleep(1000);
    await capture(`13-admin-expense-chat-${vp.tag}.png`);

    // 14. ADMIN CRM CLIENTS TAB
    await evaluate(`
      document.querySelector('button[data-tab="clients"]')?.click();
    `);
    await sleep(1000);
    await capture(`14-admin-crm-${vp.tag}.png`);

    // 15. ADMIN CRM CLIENT DRAWER (Open a client profile from CRM list)
    await evaluate(`
      const firstClient = document.querySelector('#crmClientsList button') || document.querySelector('#crmClientsList [data-customer-id]');
      if (firstClient) firstClient.click();
    `);
    await sleep(1000);
    await capture(`15-admin-crm-drawer-${vp.tag}.png`);
    // Close drawer
    await evaluate(`
      document.getElementById('customerProfileModal')?.classList.remove('open');
    `);
    await sleep(500);

    // 16. ADMIN ORDERS EMPTY STATE
    await evaluate(`
      document.querySelector('button[data-tab="orders"]')?.click();
      const statusSelect = document.getElementById('orderStatusFilter');
      if (statusSelect) {
        statusSelect.value = 'Cancelled';
        statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    `);
    await sleep(800);
    await capture(`16-admin-orders-empty-${vp.tag}.png`);
  }

  console.log('\n--- Screenshot capture completed successfully! ---');
  if (consoleLogs.length) {
    console.log('Console logs during capture:\n' + consoleLogs.join('\n'));
  }
} catch (err) {
  console.error('Error during capture:', err);
} finally {
  try { ws.close(); } catch (e) {}
  try { chrome.kill(); } catch (e) {}
  try { vite.kill(); } catch (e) {}
  try { fs.rmSync(PROFILE_DIR, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
}
