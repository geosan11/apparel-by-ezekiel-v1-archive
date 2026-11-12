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
  const backdrop = document.getElementById('mobileNavBackdrop');
  const closeBtn = document.getElementById('mobileNavClose');

  const closeDrawer = () => {
    if (drawer) drawer.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
  };

  const openDrawer = () => {
    if (drawer) drawer.classList.add('open');
    if (backdrop) backdrop.classList.add('open');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
  };

  if (toggleBtn && drawer) {
    toggleBtn.addEventListener('click', () => {
      const isOpen = drawer.classList.contains('open');
      if (isOpen) {
        closeDrawer();
      } else {
        openDrawer();
      }
    });

    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
    if (backdrop) backdrop.addEventListener('click', closeDrawer);

    drawer.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', closeDrawer);
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
  const mobileCatSelect = document.getElementById('galleryCategorySelect');

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

            <!-- Primary Action First -->
            <div class="card-primary-action-wrap">
              <button class="btn btn-primary ui-btn-gold book-btn card-action-btn" data-action="book" data-slug="${escapeHtml(d.slug)}" style="width: 100%;">
                Book Bespoke Fitting
              </button>
            </div>

            <!-- Progressive Disclosure: Sizing, Fabric, Care & Pricing Breakdown -->
            <details class="card-details-disclosure">
              <summary class="card-details-summary">
                <span>Fabric, sizing & preview</span>
                <span class="disclosure-arrow">▾</span>
              </summary>
              <div class="card-disclosure-content">
                <div class="card-spec-row">
                  <span class="spec-label">Fabric:</span>
                  <span class="spec-value">${escapeHtml(d.fabric)}</span>
                </div>
                <div class="card-spec-row">
                  <span class="spec-label">Sizing:</span>
                  <span class="spec-value">Made-to-measure (Muslin fitting included)</span>
                </div>
                <div class="card-spec-row">
                  <span class="spec-label">Care:</span>
                  <span class="spec-value">Specialist dry clean only</span>
                </div>
                <div class="card-spec-row">
                  <span class="spec-label">Pricing:</span>
                  <span class="spec-value">₦50k deposit to book • Balance on delivery</span>
                </div>
                <div class="card-spec-row">
                  <span class="spec-label">Lead Time:</span>
                  <span class="spec-value">${escapeHtml(d.leadTime)}</span>
                </div>

                <!-- Secondary Actions inside Disclosure -->
                <div class="card-secondary-actions">
                  <button class="card-action-btn view-3d-btn btn btn-outline btn-sm" data-action="3d" data-slug="${escapeHtml(d.slug)}">
                    3D Preview <span class="badge badge-beta">Beta</span>
                  </button>
                  <button class="card-action-btn view-tryon-btn btn btn-outline btn-sm" data-action="tryon" data-slug="${escapeHtml(d.slug)}">
                    Try-On <span class="badge badge-beta">Beta</span>
                  </button>
                  <a href="/designs/${escapeHtml(d.slug)}/" class="btn btn-outline btn-sm design-detail-link" data-slug="${escapeHtml(d.slug)}">
                    Full Details
                  </a>
                </div>
              </div>
            </details>
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
      if (mobileCatSelect) {
        mobileCatSelect.value = currentCategory;
      }
      renderGallery();
    });
  });

  if (mobileCatSelect) {
    mobileCatSelect.addEventListener('change', () => {
      currentCategory = mobileCatSelect.value || 'all';
      filterBtns.forEach((b) => {
        b.classList.toggle('active', (b.dataset.category || 'all').toLowerCase() === currentCategory.toLowerCase());
      });
      renderGallery();
    });
  }

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

  const nameEl = document.getElementById('modal3dGarmentName');
  if (nameEl) nameEl.textContent = design.title;

  const priceEl = document.getElementById('modal3dGarmentPrice');
  if (priceEl) priceEl.textContent = design.priceFormatted;

  const detailsEl = document.getElementById('modal3dDetailsContent');
  if (detailsEl) {
    detailsEl.innerHTML = `
      <div style="margin-bottom: 6px;"><strong>Bespoke Sizing:</strong> Drafted to your anatomical posture measurements. Muslin fitting included.</div>
      <div style="margin-bottom: 6px;"><strong>Fabric:</strong> ${escapeHtml(design.fabric)}</div>
      <div style="margin-bottom: 6px;"><strong>Care:</strong> Specialist dry clean only. Store on wide cedar hanger.</div>
      <div><strong>Pricing:</strong> Total ${escapeHtml(design.priceFormatted)} includes fittings & pressing. ₦50,000 commitment deposit required to book. Lead time: ${escapeHtml(design.leadTime)}.</div>
    `;
  }

  const bookBtn = document.getElementById('modal3dBookBtn');
  if (bookBtn) {
    bookBtn.onclick = () => {
      close3DViewer();
      closeModal('modal3d');
      openBookingModal(design);
    };
  }

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
          <h2 style="font-family: var(--font-display); font-size: 1.75rem; margin: 4px 0;">${escapeHtml(design.title)}</h2>
          <div style="font-size: 1.4rem; color: var(--gold-text); font-weight: 700;">${escapeHtml(design.priceFormatted)}</div>
          <p style="margin: 8px 0 12px; font-size: 0.95rem; color: var(--foreground);">${escapeHtml(design.description)}</p>

          <!-- Primary Action First -->
          <div style="margin-bottom: 12px;">
            <button class="btn btn-primary ui-btn-gold" id="detailBookBtn" style="width: 100%; min-height: 48px; font-size: 0.95rem;">Book Bespoke Fitting</button>
          </div>

          <!-- Progressive Disclosure Accordions: Sizing, Fabric, Care & Pricing Breakdowns -->
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <details class="detail-accordion" open>
              <summary class="detail-accordion-summary">
                <span>Fabric & Artisanal Textile</span>
                <span class="disclosure-arrow">▾</span>
              </summary>
              <div class="detail-accordion-content">
                <div><strong>Textile:</strong> ${escapeHtml(design.fabric)}</div>
                <div style="margin-top: 4px;">Precision hand-cut and reinforced with luxury lining. Hand-embossed geometric threading.</div>
              </div>
            </details>

            <details class="detail-accordion">
              <summary class="detail-accordion-summary">
                <span>Bespoke Sizing & Fitting Process</span>
                <span class="disclosure-arrow">▾</span>
              </summary>
              <div class="detail-accordion-content">
                <div>Individual anatomical pattern drafted to your exact proportions (Chest, shoulders, buba length, trouser inseam).</div>
                <div style="margin-top: 4px;">Includes 2 personal fittings (muslin mock-up and final fit adjustments) in our Victoria Island atelier or your residence.</div>
              </div>
            </details>

            <details class="detail-accordion">
              <summary class="detail-accordion-summary">
                <span>Garment Care & Longevity</span>
                <span class="disclosure-arrow">▾</span>
              </summary>
              <div class="detail-accordion-content">
                <div>Specialist dry clean only. Steam press gently on reverse side. Delivered with complimentary wide cedar hanger and dust-proof atelier garment bag.</div>
              </div>
            </details>

            <details class="detail-accordion">
              <summary class="detail-accordion-summary">
                <span>Pricing & Deposit Breakdown</span>
                <span class="disclosure-arrow">▾</span>
              </summary>
              <div class="detail-accordion-content">
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                  <span>Total Bespoke Price:</span>
                  <strong>${escapeHtml(design.priceFormatted)}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                  <span>Commitment Deposit:</span>
                  <span style="color: var(--gold-text); font-weight: 600;">₦50,000 (Credited)</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                  <span>Balance on Delivery:</span>
                  <span>Payable upon final fit sign-off</span>
                </div>
                <div style="margin-top: 6px; font-size: 0.75rem;">Lead Time: ${escapeHtml(design.leadTime)}</div>
              </div>
            </details>
          </div>

          <!-- Secondary Actions -->
          <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border);">
            <button class="btn btn-outline" id="detail3dBtn" style="flex: 1; min-height: 44px;">3D Preview (Beta)</button>
            <button class="btn btn-outline" id="detailTryonBtn" style="flex: 1; min-height: 44px;">Try-On (Beta)</button>
            <a href="${escapeHtml(waShareUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline" style="border-color: rgba(37, 211, 102, 0.4); color: #25D366; min-height: 44px; display: inline-flex; align-items: center; justify-content: center;">
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
                  <div style="color: var(--gold-text); font-size: 0.9rem; font-weight: 600;">${escapeHtml(d.priceFormatted)}</div>
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
        <span style="color: var(--gold-text); font-weight: 600;">${escapeHtml(d.priceFormatted)}</span>
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

// IntersectionObserver for Staggered Section Reveals (Progressive Enhancement)
function initScrollReveals() {
  // If user prefers reduced motion, skip animations
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('.reveal-on-scroll').forEach((el) => el.classList.add('revealed'));
    return;
  }

  // Progressive enhancement fallback if IntersectionObserver is not supported
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.reveal-on-scroll').forEach((el) => el.classList.add('revealed'));
    return;
  }

  // Enable animation styles by adding class to html
  document.documentElement.classList.add('js-reveal');

  const isNearViewport = (el) => {
    const rect = el.getBoundingClientRect();
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    return rect.top <= windowHeight + 200 && rect.bottom >= -200;
  };

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
    { threshold: 0.05, rootMargin: '100px' }
  );

  document.querySelectorAll('.reveal-on-scroll').forEach((el) => {
    // Reveal immediately if already in or near viewport on load
    if (isNearViewport(el)) {
      el.classList.add('revealed');
    } else if (!el.classList.contains('revealed')) {
      observer.observe(el);
    }
  });

  // Safety fallback: reveal all elements after timeout (prevents blank sections in headless screenshots)
  setTimeout(() => {
    document.querySelectorAll('.reveal-on-scroll:not(.revealed)').forEach((el) => {
      el.classList.add('revealed');
    });
  }, 1200);
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
