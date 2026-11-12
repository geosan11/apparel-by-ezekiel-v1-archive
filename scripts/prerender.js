import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve('dist');
const designsPath = path.resolve('data/designs.json');

if (!fs.existsSync(designsPath)) {
  console.error('designs.json not found');
  process.exit(1);
}

const designs = JSON.parse(fs.readFileSync(designsPath, 'utf8'));

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const designsOutDir = path.join(distDir, 'designs');
fs.mkdirSync(designsOutDir, { recursive: true });

// Read built CSS if dist exists to inline or link
let cssLinks = '';
const assetsDir = path.join(distDir, 'assets');
if (fs.existsSync(assetsDir)) {
  const files = fs.readdirSync(assetsDir);
  const cssFiles = files.filter((f) => f.endsWith('.css'));
  cssLinks = cssFiles.map((css) => `<link rel="stylesheet" href="/assets/${css}">`).join('\n  ');
}

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) {
    return '234' + digits.slice(1);
  }
  return digits;
}
const envPhone = (process.env.VITE_WHATSAPP_PHONE || '').replace(/\D/g, '');
const bookingPhone = (envPhone && envPhone !== ('2348' + '000000000')) ? normalizePhone(envPhone) : '2347065086445';

for (const d of designs) {
  const designDir = path.join(designsOutDir, d.slug);
  fs.mkdirSync(designDir, { recursive: true });

  const waShareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(
    `Look at ${d.title} (${d.priceFormatted}) by Apparel by Ezekiel: https://apparelbyezekiel.com/designs/${d.slug}/`
  )}`;

  const bookingWaUrl = `https://wa.me/${bookingPhone}?text=${encodeURIComponent(
    `Hello Ezekiel, I would like to book a private fitting for ${d.title} (${d.priceFormatted}).`
  )}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${d.title} (${d.priceFormatted}) — Apparel by Ezekiel</title>
  <meta name="description" content="${d.tagline} Handcrafted bespoke Nigerian menswear in Lagos." />
  
  <!-- Open Graph / WhatsApp Preview Meta Tags -->
  <meta property="og:type" content="product" />
  <meta property="og:site_name" content="Apparel by Ezekiel" />
  <meta property="og:title" content="${d.title} — ${d.priceFormatted}" />
  <meta property="og:description" content="${d.tagline} Made from ${d.fabric}. Book bespoke fitting in Lagos." />
  <meta property="og:image" content="https://apparelbyezekiel.com${d.image}" />
  <meta property="og:image:width" content="800" />
  <meta property="og:image:height" content="1000" />
  <meta property="og:url" content="https://apparelbyezekiel.com/designs/${d.slug}/" />
  <meta property="product:price:amount" content="${d.price}" />
  <meta property="product:price:currency" content="NGN" />

  <!-- Twitter Meta -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${d.title} — ${d.priceFormatted}" />
  <meta name="twitter:description" content="${d.tagline}" />
  <meta name="twitter:image" content="https://apparelbyezekiel.com${d.image}" />

  <!-- Fonts & Styles -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  ${cssLinks}

  <style>
    :root {
      --color-bg: #ffffff;
      --color-bg-card: #ffffff;
      --color-bg-elevated: #f4f4f5;
      --color-text-primary: #0a0a0a;
      --color-text-secondary: #52525b;
      --color-gold: #b89b6a;
      --color-gold-text: #8a6d3b;
      --color-gold-light: #d4bc91;
      --color-border: rgba(9, 9, 11, 0.10);
      --color-border-subtle: rgba(9, 9, 11, 0.08);
    }
    body {
      background-color: var(--color-bg);
      color: var(--color-text-primary);
      font-family: 'Inter', -apple-system, sans-serif;
      margin: 0;
      padding: 0;
      line-height: 1.6;
    }
    .header {
      padding: 20px 24px;
      border-bottom: 1px solid var(--color-border-subtle);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(255, 255, 255, 0.95);
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .brand {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 1.35rem;
      font-weight: 600;
      letter-spacing: 0.18em;
      color: var(--color-text-primary);
      text-decoration: none;
    }
    .brand span { color: var(--color-gold-text); }
    .container {
      max-width: 1100px;
      margin: 40px auto;
      padding: 0 24px;
    }
    .detail-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 40px;
    }
    @media (min-width: 768px) {
      .detail-grid { grid-template-columns: 1fr 1fr; }
    }
    .img-wrap {
      border: 1px solid var(--color-border);
      border-radius: 2px;
      overflow: hidden;
      background: var(--color-bg-elevated);
    }
    .img-wrap img { width: 100%; height: auto; display: block; }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      border: 1px solid var(--color-border);
      background: rgba(184, 155, 106, 0.12);
      color: var(--color-gold-text);
      border-radius: 2px;
    }
    .price {
      font-size: 1.8rem;
      color: var(--color-gold-text);
      font-weight: 700;
      margin: 12px 0;
    }
    .title {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 2.4rem;
      margin: 10px 0;
      font-weight: 600;
      color: #0a0a0a;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 12px 24px;
      border-radius: 2px;
      text-decoration: none;
      font-size: 0.85rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      transition: all 0.2s ease;
    }
    .btn-primary { background: #0a0a0a; color: #ffffff; border: 1px solid #0a0a0a; }
    .btn-outline { background: transparent; color: var(--color-text-primary); border: 1px solid var(--color-border); }
    .btn-wa { background: #25D366; color: #FFFFFF; border: 1px solid #25D366; }
    details {
      border: 1px solid var(--color-border);
      background: var(--color-bg-elevated);
      border-radius: 4px;
      margin-bottom: 10px;
      overflow: hidden;
    }
    summary {
      cursor: pointer;
      padding: 12px 16px;
      font-weight: 600;
      font-size: 0.88rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      user-select: none;
      min-height: 44px;
    }
    summary::marker, summary::-webkit-details-marker { display: none; }
    .disclosure-body {
      padding: 12px 16px;
      border-top: 1px solid var(--color-border-subtle);
      font-size: 0.85rem;
      color: var(--color-text-secondary);
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <header class="header">
    <a href="/" class="brand">APPAREL BY <span>EZEKIEL</span></a>
    <a href="/#gallery" class="btn btn-outline" style="padding: 6px 14px; font-size: 0.75rem;">All Designs</a>
  </header>

  <main class="container">
    <div style="margin-bottom: 24px; font-size: 0.85rem; color: var(--color-text-secondary);">
      <a href="/" style="color: inherit; text-decoration: none;">Home</a> / 
      <a href="/#gallery" style="color: inherit; text-decoration: none;">Collection</a> / 
      <span style="color: var(--color-gold);">${d.title}</span>
    </div>

    <div class="detail-grid">
      <div class="img-wrap">
        <img src="${d.image}" alt="${d.title}" width="800" height="1000" />
      </div>

      <div>
        <span class="badge">${d.category}</span>
        <h1 class="title">${d.title}</h1>
        <div class="price">${d.priceFormatted}</div>
        <p style="color: var(--color-text-secondary); font-size: 1.05rem; margin-bottom: 20px;">
          ${d.description}
        </p>

        <!-- Primary Action First -->
        <div style="margin-bottom: 20px;">
          <a href="/?design=${d.slug}#booking" class="btn btn-primary" style="width: 100%; box-sizing: border-box;">Book Atelier Fitting</a>
        </div>

        <!-- Progressive Disclosure Accordions -->
        <div style="margin-bottom: 24px;">
          <details>
            <summary>
              <span>Fabric & Textile Specification</span>
              <span>▾</span>
            </summary>
            <div class="disclosure-body">
              <div><strong>Textile:</strong> ${d.fabric}</div>
              <div style="margin-top: 4px;">Precision hand-cut damask/wool with artisanal lining.</div>
            </div>
          </details>

          <details>
            <summary>
              <span>Bespoke Sizing & Muslin Fitting</span>
              <span>▾</span>
            </summary>
            <div class="disclosure-body">
              <div>Individually patterned to your 12 anatomical measurements. Includes initial muslin consultation fitting and final tailoring adjustments.</div>
            </div>
          </details>

          <details>
            <summary>
              <span>Garment Care & Longevity</span>
              <span>▾</span>
            </summary>
            <div class="disclosure-body">
              <div>Specialist dry clean only. Steam press on reverse side. Stored in bespoke breathable garment bag provided.</div>
            </div>
          </details>

          <details>
            <summary>
              <span>Pricing & Deposit Terms</span>
              <span>▾</span>
            </summary>
            <div class="disclosure-body">
              <div>Total: ${d.priceFormatted} (includes 2 private fittings). Initial commitment deposit: ₦50,000 to reserve atelier time. Balance due upon final fit sign-off. Bespoke lead time: ${d.leadTime}.</div>
            </div>
          </details>
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px;">
          <a href="${bookingWaUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-wa">
            Confirm Fitting on WhatsApp
          </a>
          <a href="${waShareUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-outline">
            Share Piece on WhatsApp
          </a>
          <a href="/?design=${d.slug}" class="btn btn-outline">
            Launch 3D & Virtual Try-On
          </a>
        </div>
      </div>
    </div>
  </main>
</body>
</html>`;

  fs.writeFileSync(path.join(designDir, 'index.html'), html);
  // Also write slug.html for direct clean route matching
  fs.writeFileSync(path.join(designsOutDir, `${d.slug}.html`), html);
}

console.log(`Prerendered static detail HTML pages with OG tags for ${designs.length} designs.`);
