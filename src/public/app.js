import '../styles/main.css';
import { store } from '../store/index.js';
import { open3DViewer, close3DViewer } from './viewer3d.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { getWhatsAppPhone, buildBookingMessage, buildWhatsAppUrl } from '../utils/whatsapp.js';

// State
let allDesigns = [];
let currentCategory = 'all';
let tryOnInstance = null;
let currentBookingDesign = null;
let simulatedBookingRecord = null;

// Storage keys
const WISHLIST_KEY = 'apparel_wishlist_v1';
const RECENT_KEY = 'apparel_recent_v1';

// Init App
document.addEventListener('DOMContentLoaded', async () => {
  await store.init();
  allDesigns = await store.getDesigns();

  const conciergeWaLink = document.getElementById('conciergeWaLink');
  if (conciergeWaLink) {
    conciergeWaLink.href = buildWhatsAppUrl('', getWhatsAppPhone());
  }

  initNavigation();
  initGallery();
  initModals();
  initWishlist();
  initRecentlyViewed();
  initBookingForm();
  initDropCapture();
  initScrollReveals();
  checkUrlParams();
  registerServiceWorker();
});

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }
}

// Navigation & Mobile Drawer
function initNavigation() {
  const toggleBtn = document.getElementById('mobileNavToggle');
  const drawer = document.getElementById('mobileNavDrawer');

  if (toggleBtn && drawer) {
    toggleBtn.addEventListener('click', () => {
      drawer.classList.toggle('open');
      const expanded = drawer.classList.contains('open');
      toggleBtn.setAttribute('aria-expanded', expanded);
    });

    drawer.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        drawer.classList.remove('open');
        toggleBtn.setAttribute('aria-expanded', false);
      });
    });
  }

  // Wishlist drawer toggle
  const wishlistBtn = document.getElementById('navWishlistBtn');
  if (wishlistBtn) {
    wishlistBtn.addEventListener('click', () => openWishlistModal());
  }

  // Privacy link
  const privacyLink = document.getElementById('openPrivacyBtn');
  if (privacyLink) {
    privacyLink.addEventListener('click', (e) => {
      e.preventDefault();
      openModal('privacyModal');
    });
  }
}

// Gallery & Category Filtering
function initGallery() {
  const container = document.getElementById('designsGrid');
  const filterBtns = document.querySelectorAll('.filter-btn');

  function renderGallery() {
    if (!container) return;

    const filtered = currentCategory === 'all'
      ? allDesigns
      : allDesigns.filter((d) => d.category.toLowerCase() === currentCategory.toLowerCase());

    const wishlist = getWishlist();

    const html = filtered.map((d, index) => {
      const isSaved = wishlist.includes(d.id);
      const isWide = d.featured && index === 0;

      return `
        <article class="design-card ui-card reveal-on-scroll ${isWide ? 'featured-wide' : ''}" data-id="${escapeHtml(d.id)}" data-slug="${escapeHtml(d.slug)}">
          <div class="card-media">
            <div class="card-badges">
              ${d.isNewThisWeek ? '<span class="badge badge-new">New Drop</span>' : ''}
              ${d.featured ? '<span class="badge badge-beta">Featured</span>' : ''}
            </div>

            <button class="card-wishlist-btn ${isSaved ? 'saved' : ''}" 
              data-wishlist-id="${escapeHtml(d.id)}" 
              aria-label="${isSaved ? 'Remove from wishlist' : 'Save to wishlist'}">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
              </svg>
            </button>

            <img src="${escapeHtml(d.image)}" alt="${escapeHtml(d.title)} by Ezekiel" class="card-image" loading="lazy" width="800" height="1000"/>

            <div class="card-overlay-actions">
              <button class="card-action-btn view-3d-btn" data-slug="${escapeHtml(d.slug)}">3D Preview <span class="badge badge-beta">Beta</span></button>
              <button class="card-action-btn view-tryon-btn" data-slug="${escapeHtml(d.slug)}">Try-On <span class="badge badge-beta">Beta</span></button>
              <button class="card-action-btn book-btn" data-slug="${escapeHtml(d.slug)}">Book</button>
            </div>
          </div>

          <div class="card-body">
            <div class="card-header-row">
              <span class="label-caps">${escapeHtml(d.category)}</span>
              <span class="card-price">${escapeHtml(d.priceFormatted)}</span>
            </div>
            <h3 class="card-title">
              <a href="/designs/${escapeHtml(d.slug)}/" class="design-detail-link" data-slug="${escapeHtml(d.slug)}">${escapeHtml(d.title)}</a>
            </h3>
            <p class="card-tagline">${escapeHtml(d.tagline)}</p>
            <div class="card-footer-row">
              <span class="label-caps" style="color: var(--color-text-muted);">Lead: ${escapeHtml(d.leadTime)}</span>
              <a href="/designs/${escapeHtml(d.slug)}/" class="btn btn-outline btn-sm design-detail-link" data-slug="${escapeHtml(d.slug)}">View Piece</a>
            </div>
          </div>
        </article>
      `;
    }).join('');

    // Smooth transition using View Transitions API if available
    if (document.startViewTransition) {
      document.startViewTransition(() => {
        container.innerHTML = html;
        attachCardListeners();
        initScrollReveals();
      });
    } else {
      container.innerHTML = html;
      attachCardListeners();
      initScrollReveals();
    }
  }

  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.dataset.category || 'all';
      renderGallery();
    });
  });

  renderGallery();
}

function attachCardListeners() {
  // Wishlist toggle
  document.querySelectorAll('[data-wishlist-id]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.wishlistId;
      toggleWishlist(id);
      btn.classList.toggle('saved');
      const isSaved = btn.classList.contains('saved');
      btn.setAttribute('aria-label', isSaved ? 'Remove from wishlist' : 'Save to wishlist');
      const svg = btn.querySelector('svg');
      if (svg) svg.setAttribute('fill', isSaved ? 'currentColor' : 'none');
    });
  });

  // 3D Preview buttons
  document.querySelectorAll('.view-3d-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const slug = btn.dataset.slug;
      const design = allDesigns.find((d) => d.slug === slug);
      if (design) open3DModal(design);
    });
  });

  // Try-On buttons
  document.querySelectorAll('.view-tryon-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const slug = btn.dataset.slug;
      const design = allDesigns.find((d) => d.slug === slug);
      if (design) openTryOnModal(design);
    });
  });

  // Book buttons
  document.querySelectorAll('.book-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const slug = btn.dataset.slug;
      const design = allDesigns.find((d) => d.slug === slug);
      if (design) openBookingModal(design);
    });
  });

  // Detail link interception for SPA modal view if clicked on index
  document.querySelectorAll('.design-detail-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      // In static build, user can navigate to the static URL, or open modal
      // If clicking with modifier key, allow normal new tab navigation
      if (e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      const slug = link.dataset.slug;
      const design = allDesigns.find((d) => d.slug === slug);
      if (design) {
        openDetailModal(design);
        trackRecentlyViewed(design.id);
      }
    });
  });
}

// 3D Modal
function open3DModal(design) {
  const modal = document.getElementById('modal3d');
  const title = document.getElementById('modal3dTitle');
  const container = document.getElementById('threeCanvasWrap');

  if (title) title.textContent = `${design.title} — 3D Preview`;
  openModal('modal3d');

  open3DViewer(design, container);

  const closeBtn = document.getElementById('closeModal3d');
  if (closeBtn) {
    const handleClose = () => {
      close3DViewer();
      closeModal('modal3d');
      closeBtn.removeEventListener('click', handleClose);
    };
    closeBtn.addEventListener('click', handleClose);
  }
}

// Virtual Try-On Modal (Lazy Loaded)
let tryOnModulesPromise = null;
let currentTryOnDesign = null;
let cachedPoseKeypoints = null;
let forceLoadModel = false;

async function getTryOnModules() {
  if (!tryOnModulesPromise) {
    tryOnModulesPromise = Promise.all([
      import('./tryon.js'),
      import('./tryon/pose.js'),
      import('./tryon/fit.js'),
      import('./tryon/anchors.js')
    ]).then(([tryonMod, poseMod, fitMod, anchorsMod]) => ({
      VirtualTryOn: tryonMod.VirtualTryOn,
      loadPoseModel: poseMod.loadPoseModel,
      detectPose: poseMod.detectPose,
      computePlacement: fitMod.computePlacement,
      isUsablePose: fitMod.isUsablePose,
      getAnchors: anchorsMod.getAnchors
    }));
  }
  return tryOnModulesPromise;
}

function setTryOnState(state, message = '', reason = '') {
  const container = document.getElementById('tryonCanvasContainer');
  const statusEl = document.getElementById('tryonStatusText');
  if (container) {
    container.setAttribute('data-tryon-state', state);
    if (reason) {
      container.setAttribute('data-tryon-reason', reason);
    } else {
      container.removeAttribute('data-tryon-reason');
    }
  }
  if (statusEl) {
    statusEl.innerHTML = message;
  }
}

function applyPlacementForCurrentDesign(modules) {
  if (!cachedPoseKeypoints || !tryOnInstance || !currentTryOnDesign) return;
  const { computePlacement, getAnchors } = modules;
  const anchors = getAnchors(currentTryOnDesign.id);
  const placement = computePlacement(cachedPoseKeypoints, anchors, { width: 600, height: 750 });
  tryOnInstance.setPlacement(placement);

  const scaleSlider = document.getElementById('tryonScaleSlider');
  if (scaleSlider) scaleSlider.value = placement.scale;
  const rotateSlider = document.getElementById('tryonRotateSlider');
  if (rotateSlider) rotateSlider.value = Math.round((placement.rotation * 180) / Math.PI);
}

async function autoFitUserPhoto(fileOrBlob, modules) {
  const { loadPoseModel, detectPose, isUsablePose } = modules;

  setTryOnState('loading-model', 'Loading photo…');
  try {
    await tryOnInstance.loadUserImage(fileOrBlob);
  } catch (err) {
    console.warn('[tryon] photo load failed', err);
    setTryOnState('manual', 'Failed to load photo. Manual fit mode is active.', 'load-error');
    return;
  }

  // Network & resource fallbacks
  if (!forceLoadModel && navigator.connection?.saveData) {
    console.warn('[tryon] data saver active, falling back to manual mode');
    setTryOnState(
      'manual',
      'Data Saver is enabled. Manual fit mode active. <button type="button" class="btn btn-outline btn-sm" id="tryonForceLoadBtn" style="margin-left:6px;padding:1px 6px;font-size:0.75rem;">Load fitting model anyway</button>',
      'save-data'
    );
    const forceBtn = document.getElementById('tryonForceLoadBtn');
    if (forceBtn) {
      forceBtn.onclick = () => {
        forceLoadModel = true;
        autoFitUserPhoto(fileOrBlob, modules);
      };
    }
    return;
  }

  if (navigator.deviceMemory && navigator.deviceMemory < 2) {
    console.warn('[tryon] low device memory detected, falling back to manual mode');
    setTryOnState('manual', 'Low device memory detected. Manual fit mode is active.', 'low-memory');
    return;
  }

  // Load ML pose model with real progress numbers
  setTryOnState('loading-model', 'Downloading fitting model…');
  try {
    await loadPoseModel({
      onProgress: ({ loadedBytes, totalBytes }) => {
        const loadedMb = (loadedBytes / (1024 * 1024)).toFixed(1);
        const totalMb = (totalBytes / (1024 * 1024)).toFixed(1);
        setTryOnState('loading-model', `Downloading fitting model · ${loadedMb} / ${totalMb} MB`);
      }
    });
  } catch (err) {
    console.warn('[tryon] pose model load error', err);
    const isUnsupported = err.message && err.message.includes('initialise');
    setTryOnState(
      'manual',
      'Fitting model could not be loaded. Manual fit mode is active.',
      isUnsupported ? 'unsupported' : 'load-error'
    );
    return;
  }

  // Fitting stage
  setTryOnState('fitting', 'Fitting your garment…');
  try {
    const poseResult = await detectPose(tryOnInstance.userImage);
    const usable = isUsablePose(poseResult?.keypoints, tryOnInstance.userImage.width);

    if (!usable) {
      console.warn('[tryon] low confidence pose', { score: poseResult?.score, keypoints: poseResult?.keypoints });
      cachedPoseKeypoints = null;
      setTryOnState('manual', 'No clear pose detected. You can adjust the fit manually.', 'low-confidence');
      return;
    }

    cachedPoseKeypoints = poseResult.keypoints;
    applyPlacementForCurrentDesign(modules);
    setTryOnState('auto', 'Garment fitted automatically to your pose.');
  } catch (err) {
    console.warn('[tryon] pose failed', err);
    setTryOnState('manual', 'Pose estimation failed. Manual fit mode is active.', 'load-error');
  }
}

async function openTryOnModal(initialDesign = null) {
  openModal('modalTryOn');

  // Request persistent storage for ML model cache
  navigator.storage?.persist?.().catch(() => {});

  const modules = await getTryOnModules();
  const { VirtualTryOn } = modules;

  currentTryOnDesign = initialDesign || allDesigns[0];

  const canvas = document.getElementById('tryonCanvas');
  if (!tryOnInstance && canvas) {
    tryOnInstance = new VirtualTryOn(canvas, {
      onStateChange: (state) => {
        if (state.isAdjusting) {
          const container = document.getElementById('tryonCanvasContainer');
          if (container && container.getAttribute('data-tryon-state') === 'auto') {
            setTryOnState('manual', 'Manual fit adjustment active.', 'manual-adjustment');
          }
        }
      }
    });
  }

  // Populate garment selector pills
  const pillList = document.getElementById('tryonGarmentList');
  if (pillList) {
    pillList.innerHTML = allDesigns.map((d) => `
      <button class="btn btn-sm btn-outline tryon-select-pill ${currentTryOnDesign && currentTryOnDesign.id === d.id ? 'active' : ''}" 
        data-overlay="${escapeHtml(d.overlayImage)}" data-id="${escapeHtml(d.id)}">
        ${escapeHtml(d.title)}
      </button>
    `).join('');

    pillList.querySelectorAll('.tryon-select-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        pillList.querySelectorAll('.tryon-select-pill').forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        const selected = allDesigns.find((d) => d.id === pill.dataset.id);
        if (selected) {
          currentTryOnDesign = selected;
          tryOnInstance.loadGarment(selected.overlayImage);
          const container = document.getElementById('tryonCanvasContainer');
          if (cachedPoseKeypoints && container && container.getAttribute('data-tryon-state') === 'auto') {
            applyPlacementForCurrentDesign(modules);
          }
        }
      });
    });
  }

  // Load initial garment overlay
  if (currentTryOnDesign && tryOnInstance) {
    tryOnInstance.loadGarment(currentTryOnDesign.overlayImage);
  }

  // Order Now button: opens booking prefilled with the currently selected design
  const orderNowBtn = document.getElementById('tryonOrderNowBtn');
  if (orderNowBtn) {
    orderNowBtn.onclick = () => {
      closeModal('modalTryOn');
      openBookingModal(currentTryOnDesign);
    };
  }

  // Adjust Toggle disclosure
  const adjustToggle = document.getElementById('tryonAdjustToggle');
  const adjustControls = document.getElementById('tryonAdjustControls');
  const adjustArrow = document.getElementById('tryonAdjustArrow');
  if (adjustToggle && adjustControls) {
    adjustToggle.onclick = () => {
      const isClosed = adjustControls.style.display === 'none';
      adjustControls.style.display = isClosed ? 'block' : 'none';
      adjustToggle.setAttribute('aria-expanded', isClosed ? 'true' : 'false');
      if (adjustArrow) adjustArrow.textContent = isClosed ? '▴' : '▾';
    };
  }

  // File upload input
  const fileInput = document.getElementById('tryonFileInput');
  if (fileInput) {
    fileInput.onchange = (e) => {
      if (e.target.files && e.target.files[0]) {
        autoFitUserPhoto(e.target.files[0], modules);
      }
    };
  }

  // Camera capture
  const cameraBtn = document.getElementById('tryonCameraBtn');
  if (cameraBtn) {
    cameraBtn.onclick = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        const video = document.createElement('video');
        video.srcObject = stream;
        video.play();
        video.onloadedmetadata = () => {
          setTimeout(() => {
            const captureCanvas = document.createElement('canvas');
            captureCanvas.width = video.videoWidth || 640;
            captureCanvas.height = video.videoHeight || 480;
            const ctx = captureCanvas.getContext('2d');
            ctx.drawImage(video, 0, 0);
            captureCanvas.toBlob((blob) => {
              autoFitUserPhoto(blob, modules);
              stream.getTracks().forEach((track) => track.stop());
            }, 'image/jpeg');
          }, 300);
        };
      } catch (err) {
        showToast('Camera access permission was denied or unavailable.');
      }
    };
  }

  // Scale and Rotate Controls
  const scaleSlider = document.getElementById('tryonScaleSlider');
  if (scaleSlider) {
    scaleSlider.oninput = (e) => {
      tryOnInstance.setManualScale(parseFloat(e.target.value));
    };
  }

  const rotateSlider = document.getElementById('tryonRotateSlider');
  if (rotateSlider) {
    rotateSlider.oninput = (e) => {
      tryOnInstance.setManualRotation(parseFloat(e.target.value));
    };
  }

  // Download button
  const downloadBtn = document.getElementById('tryonDownloadBtn');
  if (downloadBtn) {
    downloadBtn.onclick = () => {
      tryOnInstance.downloadResult(`ezekiel-bespoke-${Date.now()}.png`);
      showToast('Image downloaded to your device.');
    };
  }
}

// Detail Modal
function openDetailModal(design) {
  currentBookingDesign = design;
  const modal = document.getElementById('modalDetail');
  if (!modal) return;

  const content = document.getElementById('detailModalContent');
  if (content) {
    const isSaved = getWishlist().includes(design.id);
    const waShareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(
      `Look at ${design.title} (${design.priceFormatted}) by Apparel by Ezekiel: ${window.location.origin}/designs/${design.slug}/`
    )}`;

    content.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-4);">
        <div>
          <img src="${escapeHtml(design.image)}" alt="${escapeHtml(design.title)}" style="width: 100%; border: 1px solid var(--border); background: var(--card); border-radius: var(--radius);" width="800" height="1000"/>
        </div>
        <div style="display: flex; flex-direction: column; gap: var(--space-2);">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span class="label-caps">${escapeHtml(design.category)}</span>
            <span class="badge ${design.isNewThisWeek ? 'badge-new' : 'badge-beta'}">${design.isNewThisWeek ? 'New Drop' : 'Signature'}</span>
          </div>
          <h2>${escapeHtml(design.title)}</h2>
          <div style="font-size: 1.4rem; color: var(--gold-light); font-weight: 600;">${escapeHtml(design.priceFormatted)}</div>
          <p style="margin-top: 8px;">${escapeHtml(design.description)}</p>
          
          <div class="ui-card" style="padding: 12px 16px; margin: 8px 0;">
            <div style="font-size: 0.85rem; margin-bottom: 4px;"><strong>Fabric:</strong> ${escapeHtml(design.fabric)}</div>
            <div style="font-size: 0.85rem;"><strong>Lead Time:</strong> ${escapeHtml(design.leadTime)}</div>
          </div>

          <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px;">
            <button class="btn btn-primary ui-btn-gold" id="detailBookBtn">Book Bespoke Fitting</button>
            <button class="btn btn-outline" id="detail3dBtn">3D Preview (Beta)</button>
            <button class="btn btn-outline" id="detailTryonBtn">Try-On (Beta)</button>
            <a href="${escapeHtml(waShareUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline" style="border-color: rgba(37, 211, 102, 0.4); color: #25D366;">
              Share on WhatsApp
            </a>
          </div>
        </div>
      </div>
    `;

    document.getElementById('detailBookBtn')?.addEventListener('click', () => {
      closeModal('modalDetail');
      openBookingModal(design);
    });

    document.getElementById('detail3dBtn')?.addEventListener('click', () => {
      closeModal('modalDetail');
      open3DModal(design);
    });

    document.getElementById('detailTryonBtn')?.addEventListener('click', () => {
      closeModal('modalDetail');
      openTryOnModal(design);
    });
  }

  openModal('modalDetail');
}

// Bespoke Booking Form & Simulated OPay Flow
function initBookingForm() {
  const form = document.getElementById('bookingForm');
  const designSelect = document.getElementById('bookingDesignSelect');

  // Populate design dropdown
  if (designSelect) {
    designSelect.innerHTML = `
      <option value="">-- Select Design (Optional) --</option>
      ${allDesigns.map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.title)} (${escapeHtml(d.priceFormatted)})</option>`).join('')}
    `;
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('bookingName').value.trim();
      const phone = document.getElementById('bookingPhone').value.trim();
      const date = document.getElementById('bookingDate').value;
      const designId = document.getElementById('bookingDesignSelect').value;
      const notes = document.getElementById('bookingNotes').value.trim();

      if (!name || !phone || !date) {
        showToast('Please provide your name, WhatsApp phone, and desired fitting date.');
        return;
      }

      const selectedDesign = allDesigns.find((d) => d.id === designId) || currentBookingDesign;

      const bookingRecord = {
        customer_name: name,
        phone: phone,
        fitting_date: date,
        design_id: selectedDesign ? selectedDesign.id : null,
        design_title: selectedDesign ? selectedDesign.title : 'Bespoke Consultation',
        notes: notes,
        deposit_status: 'pending',
        deposit_amount: 50000,
        status: 'pending'
      };

      const saved = await store.addBooking(bookingRecord);
      simulatedBookingRecord = saved;

      // Update prefilled WhatsApp link
      const waMessage = buildBookingMessage({
        name,
        phone,
        date,
        designTitle: selectedDesign ? selectedDesign.title : 'Bespoke Consultation',
        ref: saved.id,
        notes
      });
      const waUrl = buildWhatsAppUrl(waMessage);
      const confirmWaBtn = document.getElementById('bookingConfirmWaBtn');
      if (confirmWaBtn) {
        confirmWaBtn.href = waUrl;
        confirmWaBtn.target = '_blank';
        confirmWaBtn.rel = 'noopener';
      }

      // Show Payment / Confirmation screen
      document.getElementById('bookingFormSection').style.display = 'none';
      document.getElementById('bookingSuccessSection').style.display = 'block';
      document.getElementById('bookingSuccessRef').textContent = saved.id;
    });
  }

  // Simulated OPay Deposit button
  const simulateOpayBtn = document.getElementById('simulateOpayBtn');
  if (simulateOpayBtn) {
    simulateOpayBtn.addEventListener('click', async () => {
      openModal('opayModal');
    });
  }

  // Complete simulated payment
  const completeOpayBtn = document.getElementById('completeOpaySimBtn');
  if (completeOpayBtn) {
    completeOpayBtn.addEventListener('click', () => {
      closeModal('opayModal');
      showToast('Demo, no payment taken. Ezekiel will confirm your deposit on WhatsApp.');
    });
  }
}

function openBookingModal(design = null) {
  currentBookingDesign = design;
  openModal('modalBooking');
  const designSelect = document.getElementById('bookingDesignSelect');
  if (designSelect && design) {
    designSelect.value = design.id;
  }
  document.getElementById('bookingFormSection').style.display = 'block';
  document.getElementById('bookingSuccessSection').style.display = 'none';
}

// Wishlist Functionality
function getWishlist() {
  try {
    return JSON.parse(localStorage.getItem(WISHLIST_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

function toggleWishlist(designId) {
  let list = getWishlist();
  if (list.includes(designId)) {
    list = list.filter((id) => id !== designId);
    showToast('Removed from saved pieces.');
  } else {
    list.push(designId);
    showToast('Saved to your private atelier wishlist.');
  }
  localStorage.setItem(WISHLIST_KEY, JSON.stringify(list));
  updateWishlistCount();
}

function initWishlist() {
  updateWishlistCount();
}

function updateWishlistCount() {
  const count = getWishlist().length;
  const badge = document.getElementById('navWishlistCount');
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
  }
}

function openWishlistModal() {
  const modal = document.getElementById('modalWishlist');
  const container = document.getElementById('wishlistItemsContainer');
  const ids = getWishlist();
  const savedDesigns = allDesigns.filter((d) => ids.includes(d.id));

  if (container) {
    if (savedDesigns.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 48px 0; color: var(--color-text-secondary);">
          <p>Your saved collection is empty.</p>
          <button class="btn btn-outline btn-sm" style="margin-top: 16px;" onclick="document.getElementById('closeWishlistModal').click()">Explore Designs</button>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 16px;">
          ${savedDesigns.map((d) => `
            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--color-border-subtle); padding-bottom: 12px;">
              <div style="display: flex; align-items: center; gap: 16px;">
                <img src="${escapeHtml(d.image)}" alt="${escapeHtml(d.title)}" style="width: 54px; height: 68px; object-fit: cover; border-radius: 2px;" />
                <div>
                  <h4 style="font-size: 1.05rem;">${escapeHtml(d.title)}</h4>
                  <div style="color: var(--color-gold); font-size: 0.9rem;">${escapeHtml(d.priceFormatted)}</div>
                </div>
              </div>
              <div style="display: flex; gap: 8px;">
                <button class="btn btn-outline btn-sm" onclick="window.bookFromWishlist('${escapeHtml(d.id)}')">Book</button>
                <button class="btn btn-outline btn-sm" style="border-color: transparent;" onclick="window.removeWishlist('${escapeHtml(d.id)}')">✕</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
  }

  openModal('modalWishlist');
}

// Global window helpers for modal callbacks
window.bookFromWishlist = (id) => {
  const d = allDesigns.find((item) => item.id === id);
  closeModal('modalWishlist');
  if (d) openBookingModal(d);
};

window.removeWishlist = (id) => {
  toggleWishlist(id);
  openWishlistModal();
};

// Recently Viewed Tracker
function trackRecentlyViewed(designId) {
  try {
    let recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    recent = [designId, ...recent.filter((id) => id !== designId)].slice(0, 4);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    renderRecentlyViewed();
  } catch (e) {}
}

function initRecentlyViewed() {
  renderRecentlyViewed();
}

function renderRecentlyViewed() {
  const container = document.getElementById('recentItemsContainer');
  const section = document.getElementById('recentlyViewedSection');
  if (!container || !section) return;

  try {
    const recentIds = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    const recentDesigns = recentIds.map((id) => allDesigns.find((d) => d.id === id)).filter(Boolean);

    if (recentDesigns.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    container.innerHTML = recentDesigns.map((d) => `
      <div class="drop-pill" style="cursor: pointer;" onclick="window.openDesignDetail('${escapeHtml(d.slug)}')">
        <span>${escapeHtml(d.title)}</span>
        <span style="color: var(--color-gold);">${escapeHtml(d.priceFormatted)}</span>
      </div>
    `).join('');
  } catch (e) {}
}

window.openDesignDetail = (slug) => {
  const design = allDesigns.find((d) => d.slug === slug);
  if (design) openDetailModal(design);
};

// Drop Notification Capture
function initDropCapture() {
  const form = document.getElementById('dropCaptureForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('dropContactInput');
      const val = input.value.trim();
      if (!val) return;

      const channel = val.includes('@') ? 'email' : 'whatsapp';
      await store.addSubscriber(val, channel);
      input.value = '';
      showToast('You are registered for exclusive drop notifications.');
    });
  }
}

// Modal helper system
function initModals() {
  document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        closeModal(backdrop.id);
      }
    });
  });

  document.querySelectorAll('.modal-close-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal-backdrop');
      if (modal) closeModal(modal.id);
    });
  });
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
}

// Toast Feedback Notice
function showToast(message) {
  let toast = document.getElementById('globalToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'globalToast';
    toast.className = 'toast-notice';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3200);
}

// IntersectionObserver for Staggered Section Reveals
function initScrollReveals() {
  // If user prefers reduced motion, skip animations
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('.reveal-on-scroll').forEach((el) => el.classList.add('revealed'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry, idx) => {
        if (entry.isIntersecting) {
          // 40ms stagger
          setTimeout(() => {
            entry.target.classList.add('revealed');
          }, idx * 40);
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 }
  );

  document.querySelectorAll('.reveal-on-scroll:not(.revealed)').forEach((el) => {
    observer.observe(el);
  });
}

// Handle Direct URLs / Query params (e.g. ?design=imperial-agbada)
function checkUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const designSlug = params.get('design');
  if (designSlug) {
    const d = allDesigns.find((item) => item.slug === designSlug);
    if (d) {
      setTimeout(() => openDetailModal(d), 300);
    }
  }
}
