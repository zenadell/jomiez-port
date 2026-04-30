# Jomiez Innovation Portfolio — Complete SEO Fix Guide
**For AI IDE execution — every fix includes exact file targets and production-ready code**

---

## How to use this document

Each fix is structured as:
- **File(s) to edit**
- **What to find** (exact string or pattern)
- **What to replace it with** (drop-in code)
- **Why it matters**

Work through them in order — Critical fixes first, then High Priority, then Growth.

---

---

# PART 1 — CRITICAL FIXES (Do these immediately)

---

## FIX 1 — Replace `<title>Loading...</title>` with real fallback titles in every HTML file

**Why:** If Google's crawler fetches your page before JS executes, it sees "Loading..." as the page title and indexes that. It also happens with cached responses. Your `server.js` already injects the correct title server-side, but the HTML fallback must also be meaningful.

**Files to edit:** `home.html`, `about.html`, `works.html`, `testimonials.html`, `contact-us.html`, `work-detail-page/work-detail-page.html`, `privacy-policy.html`, `change-log.html`, `style-guide.html`

### home.html

**Find:**
```html
<title>Loading...</title>
```

**Replace with:**
```html
<title>Jomiez Innovation — Software Development, Web & AI Solutions | Build Websites, Apps & More</title>
```

---

### about.html

**Find:**
```html
<title>Loading...</title>
```

**Replace with:**
```html
<title>About Jomiez Innovation — Our Story, Mission & Expert Development Team</title>
```

---

### works.html

**Find:**
```html
<title>Loading...</title>
```

**Replace with:**
```html
<title>Portfolio — Projects & Case Studies | Jomiez Innovation</title>
```

---

### testimonials.html

**Find:**
```html
<title>Loading...</title>
```

**Replace with:**
```html
<title>Client Testimonials & Reviews — Jomiez Innovation</title>
```

---

### contact-us.html

**Find:**
```html
<title>Loading...</title>
```

**Replace with:**
```html
<title>Contact Jomiez Innovation — Start Your Project Today</title>
```

---

### work-detail-page/work-detail-page.html

**Find:**
```html
<title>Loading...</title>
```

**Replace with:**
```html
<title>Project Case Study — Portfolio | Jomiez Innovation</title>
```

---

### privacy-policy.html

**Find:**
```html
<title>Loading...</title>
```

**Replace with:**
```html
<title>Privacy Policy — Jomiez Innovation</title>
```

---

---

## FIX 2 — Remove all Webflow template fingerprints from every HTML file

**Why:** Every `<html>` tag carries `data-wf-domain="resumx.webflow.io"` which exposes you as using a Webflow template to Google, bots, and anyone who inspects your code. The `<meta name="generator" content="Webflow">` tag does the same. For a company presenting itself as a world-class software development firm, this directly undercuts credibility. 

**Important:** Keep `data-wf-page` and `data-wf-site` — the Webflow.js animation library reads those to activate scroll animations. Only remove `data-wf-domain`.

**Files to edit:** ALL HTML files — `home.html`, `about.html`, `works.html`, `testimonials.html`, `contact-us.html`, `work-detail-page/work-detail-page.html`, `privacy-policy.html`, `change-log.html`, `style-guide.html`, `404.html`, `license.html`

### Step A — Fix the `<html>` opening tag in each file

**Find (exact pattern in every file):**
```html
<html data-wf-domain="resumx.webflow.io" data-wf-page="ANYTHING" data-wf-site="ANYTHING"
    lang="en">
```

**Replace with (keep page and site IDs, remove domain, ensure lang is present):**
```html
<html lang="en" data-wf-page="KEEP_EXISTING_VALUE" data-wf-site="KEEP_EXISTING_VALUE">
```

> Note: The exact `data-wf-page` and `data-wf-site` values are different per page — preserve whatever value was already there, just remove the `data-wf-domain` attribute entirely.

---

### Step B — Remove the Webflow generator meta tag from every HTML file

**Find in every `<head>` section:**
```html
<meta content="Webflow" name="generator">
```

**Replace with (your own generator tag):**
```html
<meta name="generator" content="Jomiez Innovation — Custom Built">
```

---

### Step C — Remove the Webflow comment from the top of every HTML file

**Find at the very top of every file:**
```html
<!-- This site was created in Webflow. https://webflow.com --><!-- Last Published: Wed Jul 02 2025 02:15:54 GMT+0000 (Coordinated Universal Time) -->
```

**Replace with:**
```html
<!-- Jomiez Innovation Portfolio — Built by Jomiez Dev Team -->
```

---

---

## FIX 3 — Replace stale OG and Twitter meta tags in every HTML file

**Why:** When someone shares your link on LinkedIn, Twitter/X, WhatsApp, or Slack, the platform reads the static HTML's OG tags — not the server-injected ones. Right now every social preview shows "ResumX - Webflow HTML Website Template" and a Webflow thumbnail image. This is a major branding failure.

**Files to edit:** All HTML files.

### home.html

**Find:**
```html
<meta content="ResumX - Webflow HTML Website Template" property="og:title">
<meta content="" property="og:description">
<meta content="https://cdn.prod.website-files.com/6839c3fb17e9af53ee2ff1b6/683f07dbb60349840c98fb18_Thumbnail.avif"
    property="og:image">
<meta content="ResumX - Webflow HTML Website Template" property="twitter:title">
<meta content="" property="twitter:description">
<meta content="https://cdn.prod.website-files.com/6839c3fb17e9af53ee2ff1b6/683f07dbb60349840c98fb18_Thumbnail.avif"
    property="twitter:image">
<meta property="og:type" content="website">
<meta content="summary_large_image" name="twitter:card">
```

**Replace with:**
```html
<!-- Open Graph — Social Sharing -->
<meta property="og:type" content="website">
<meta property="og:site_name" content="Jomiez Innovation">
<meta property="og:locale" content="en_US">
<meta property="og:title" content="Jomiez Innovation — Software Development, Web & AI Solutions">
<meta property="og:description" content="We build powerful custom websites, mobile apps, AI systems, and enterprise software for businesses worldwide. Led by Templeton (Ezinna Emmanuel Nweke).">
<meta property="og:image" content="/uploads/og-image.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Jomiez Innovation — Software Development Company">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@jomiez">
<meta name="twitter:creator" content="@jomiez">
<meta name="twitter:title" content="Jomiez Innovation — Software Development, Web & AI Solutions">
<meta name="twitter:description" content="We build powerful custom websites, mobile apps, AI systems, and enterprise software for businesses worldwide.">
<meta name="twitter:image" content="/uploads/og-image.jpg">
<meta name="twitter:image:alt" content="Jomiez Innovation — Software Development Company">
```

---

### about.html

**Find:**
```html
<meta content="About Us | ResumX - Webflow HTML Website Template" property="og:title">
```

**Replace with:**
```html
<meta property="og:title" content="About Jomiez Innovation — Our Story, Mission & Expert Team">
<meta property="og:description" content="Learn how Jomiez Innovation was built from the ground up by Ezinna Emmanuel Nweke (Templeton) to deliver world-class software solutions globally.">
<meta property="og:image" content="/uploads/og-image.jpg">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Jomiez Innovation">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="About Jomiez Innovation — Our Story, Mission & Expert Team">
<meta name="twitter:description" content="Learn how Jomiez Innovation was built from the ground up by Ezinna Emmanuel Nweke (Templeton) to deliver world-class software solutions globally.">
<meta name="twitter:image" content="/uploads/og-image.jpg">
```

---

### works.html

**Find:**
```html
<meta content="Work | ResumX - Webflow HTML Website Template" property="og:title">
```

**Replace with:**
```html
<meta property="og:title" content="Portfolio & Case Studies — Jomiez Innovation">
<meta property="og:description" content="Browse our portfolio of successfully delivered web apps, mobile apps, AI platforms, and enterprise software projects for clients worldwide.">
<meta property="og:image" content="/uploads/og-image.jpg">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Jomiez Innovation">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Portfolio & Case Studies — Jomiez Innovation">
<meta name="twitter:description" content="Browse our portfolio of successfully delivered web apps, mobile apps, AI platforms, and enterprise software projects for clients worldwide.">
<meta name="twitter:image" content="/uploads/og-image.jpg">
```

---

### contact-us.html

**Find:**
```html
<meta content="Contact Us | ResumX - Webflow HTML Website Template" property="og:title">
```

**Replace with:**
```html
<meta property="og:title" content="Contact Jomiez Innovation — Start Your Project Today">
<meta property="og:description" content="Have a project in mind? Get in touch with the Jomiez Innovation team. We build custom websites, mobile apps, AI solutions, and more. Let's talk.">
<meta property="og:image" content="/uploads/og-image.jpg">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Jomiez Innovation">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Contact Jomiez Innovation — Start Your Project Today">
<meta name="twitter:description" content="Have a project in mind? Get in touch with the Jomiez Innovation team. We build custom websites, mobile apps, AI solutions, and more.">
<meta name="twitter:image" content="/uploads/og-image.jpg">
```

---

---

## FIX 4 — Self-host the favicon and add full favicon coverage

**Why:** The favicon is currently loaded from `cdn.prod.website-files.com` (Webflow's CDN). If that CDN removes your access (you're not a paying Webflow subscriber), the favicon breaks. Also, you're missing Apple Touch Icon, PWA manifest icons, and the favicon.ico fallback.

### Step A — Download and save favicon locally

The file is currently at:
`https://cdn.prod.website-files.com/6839c3fb17e9af53ee2ff1b6/683f08054a78dd2af85dc79d_Favicon.jpg`

Save it as: `/favicon.ico` (also save a copy as `/favicon.png` and `/apple-touch-icon.png` at 180×180px)

### Step B — Replace favicon tags in every HTML file

**Find in every HTML file:**
```html
<link href="https://cdn.prod.website-files.com/6839c3fb17e9af53ee2ff1b6/683f08054a78dd2af85dc79d_Favicon.jpg"
    rel="shortcut icon" type="image/x-icon">
```

**Replace with:**
```html
<!-- Favicon — Self Hosted -->
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
```

### Step C — Create `/site.webmanifest`

Create a new file at the root: `site.webmanifest`

```json
{
  "name": "Jomiez Innovation",
  "short_name": "Jomiez",
  "description": "Software Development, Web & AI Solutions",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#0a0a0a",
  "icons": [
    {
      "src": "/favicon-32.png",
      "sizes": "32x32",
      "type": "image/png"
    },
    {
      "src": "/apple-touch-icon.png",
      "sizes": "180x180",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

### Step D — Serve the webmanifest from server.js

Add this route in `server.js` before the static middleware section:

```javascript
// PWA Manifest
app.get('/site.webmanifest', (req, res) => {
  res.type('application/manifest+json');
  res.sendFile(path.join(__dirname, 'site.webmanifest'));
});
```

---

---

## FIX 5 — Self-host the Webflow CSS

**Why:** Your entire site styling depends on `https://cdn.prod.website-files.com/6839c3fb17e9af53ee2ff1b6/css/resumx.webflow.shared.a61bea62a.min.css`. This is Webflow's CDN. If Webflow removes it, every page is unstyled.

### Step A — Download the CSS file

Run this in terminal:
```bash
curl -o css/main.css "https://cdn.prod.website-files.com/6839c3fb17e9af53ee2ff1b6/css/resumx.webflow.shared.a61bea62a.min.css"
```

### Step B — Replace the CSS link in every HTML file

**Find in every HTML file:**
```html
<link href="https://cdn.prod.website-files.com/6839c3fb17e9af53ee2ff1b6/css/resumx.webflow.shared.a61bea62a.min.css"
    rel="stylesheet" type="text/css">
```

**Replace with:**
```html
<link href="/css/main.css" rel="stylesheet" type="text/css">
```

---

---

## FIX 6 — Add missing `<meta name="description">` to every HTML file

**Why:** Most HTML files have `<meta content="" name="description">` — an empty description. Google uses the meta description as the search result snippet. Empty = Google writes its own (often bad).

### home.html

**Find:**
```html
<meta content="" name="description">
```

**Replace with:**
```html
<meta name="description" content="Jomiez Innovation is a world-class software development company. We build custom websites, mobile apps, AI-powered solutions, SaaS platforms, and enterprise software for businesses worldwide. Led by Templeton (Ezinna Emmanuel Nweke). Get a free consultation.">
```

### about.html

**Find:**
```html
<meta content="" name="description">
```
*(if present — add after `<meta charset="utf-8">` if missing)*

**Add:**
```html
<meta name="description" content="Learn about Jomiez Innovation — a leading software development company founded by Ezinna Emmanuel Nweke (Templeton). We specialize in custom web apps, mobile development, AI integration, and digital transformation for global businesses.">
```

### works.html

```html
<meta name="description" content="Explore Jomiez Innovation's portfolio of delivered projects — custom websites, mobile apps, AI-powered platforms, SaaS products, and enterprise software solutions built for clients worldwide.">
```

### contact-us.html

```html
<meta name="description" content="Contact Jomiez Innovation to start your software project. We build custom websites, mobile apps, AI solutions, and enterprise software. Talk to our team today — free consultation available.">
```

### testimonials.html

```html
<meta name="description" content="Read real reviews and testimonials from Jomiez Innovation clients. See why businesses worldwide trust us for software development, web design, mobile apps, and AI solutions. Rated 4.9 stars.">
```

---

---

# PART 2 — HIGH PRIORITY FIXES

---

## FIX 7 — Fix heading hierarchy (H1 abuse across all pages)

**Why:** Google uses heading hierarchy (H1 → H2 → H3) to understand page structure and main topic. Having 17 H1 tags on `about.html` for counter numbers, or two H1 tags on `home.html`, destroys this signal completely.

### about.html — Fix counter H1s

**Find all instances of this pattern** (there are 17+ of them):
```html
<h1 class="counter-title">
```

**Replace all with:**
```html
<p class="counter-title">
```

And close tag — **Find:**
```html
</h1><!-- each counter closing tag -->
```

**Replace the matching closes with:**
```html
</p>
```

> Important: Do this ONLY for the `.counter-title` class. Do not touch the real H1 which is the hero heading at the top of the page.

---

### home.html — Fix duplicate H1 (CTA section)

**Find** the CTA heading (near the bottom of home.html):
```html
<h1 class="cta-heading">
```

**Replace with:**
```html
<h2 class="cta-heading">
```

And its closing tag — **Find:**
```html
</h1><!-- only the one with class="cta-heading" -->
```

**Replace with:**
```html
</h2>
```

---

## FIX 8 — Add Google Search Console + Google Analytics to server.js

**Why:** Without GSC, you can't tell Google your site exists, can't monitor crawl errors, and can't see keyword rankings. Without GA4, you have no traffic data feeding into Google's signals about your site's quality.

### Step A — Get your verification codes

1. Go to [search.google.com/search-console](https://search.google.com/search-console)
2. Add your domain as a property
3. Choose "HTML tag" verification method — it gives you a code like `abc123xyz`
4. Go to [analytics.google.com](https://analytics.google.com), create a GA4 property, get your `G-XXXXXXXXXX` ID

### Step B — Add to server.js `injectSEOMeta()` function

**Find** the line in `injectSEOMeta()` that does:
```javascript
result = result.replace('</head>', `    ${additionalMeta}\n</head>`);
```

**Replace with:**
```javascript
// Google Search Console verification + GA4
const gscVerification = `<meta name="google-site-verification" content="YOUR_GSC_VERIFICATION_CODE_HERE" />`;

const ga4Script = `
  <!-- Google Analytics 4 -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-XXXXXXXXXX', {
      page_title: document.title,
      page_location: window.location.href,
      send_page_view: true
    });
  </script>`;

const additionalMetaFull = `${canonical}
    ${robotsMeta}
    ${keywords}
    ${authorMeta}
    ${geoMeta}
    ${langAlts}
    ${themeColor}
    ${gscVerification}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:creator" content="@jomiez" />
    <meta property="og:site_name" content="Jomiez Innovation" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:url" content="${host}${meta.path || '/'}" />
    <meta property="og:type" content="website" />
    <script src="/js/seo-schema.js" defer></script>`;

result = result.replace('</head>', `    ${additionalMetaFull}\n</head>`);
result = result.replace('</body>', `    ${ga4Script}\n</body>`);
```

> Replace `YOUR_GSC_VERIFICATION_CODE_HERE` with your actual GSC code.
> Replace both `G-XXXXXXXXXX` with your actual GA4 measurement ID.

---

## FIX 9 — Add `preconnect` and `preload` hints for faster page loads

**Why:** Core Web Vitals (LCP, FID, CLS) are a direct Google ranking factor. Adding resource hints tells the browser to start connecting to external domains early, cutting 200-400ms off load time.

### Add to `injectSEOMeta()` in server.js

Find the `preconnect` variable definition (it already exists but isn't being used in the injection). Update the `additionalMetaFull` block to include it:

**Find in your `additionalMetaFull` string:**
```javascript
const additionalMetaFull = `${canonical}
```

**Replace the start of that block with:**
```javascript
const resourceHints = `
    <!-- Performance: Resource Hints -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="preconnect" href="https://res.cloudinary.com" />
    <link rel="preconnect" href="https://ajax.googleapis.com" />
    <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
    <link rel="dns-prefetch" href="https://www.google-analytics.com" />`;

const additionalMetaFull = `${resourceHints}
    ${canonical}
```

---

## FIX 10 — Fix image alt text in `dynamic.js`

**Why:** Empty alt attributes mean Google Images cannot index your portfolio images. Work thumbnails are a major visual search opportunity — especially for design/development agencies.

### In `js/dynamic.js` — Fix works thumbnail injection

**Find** (around line 800):
```javascript
imgEl.innerHTML = `<img src="${work.thumbnail_url}" loading="lazy" alt="${work.title}" style="width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 12px;" />`;
```

**Replace with:**
```javascript
imgEl.innerHTML = `<img src="${work.thumbnail_url}" loading="lazy" alt="${work.title} — Jomiez Innovation portfolio project" width="800" height="600" style="width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 12px;" />`;
```

---

**Find** the work detail hero image injection (around line 833):
```javascript
heroImg.innerHTML = `<img src="${work.thumbnail_url}" loading="lazy" alt="${work.title}" style="width: 100%; height: 100%; object-fit: cover; display: block;" />`;
```

**Replace with:**
```javascript
heroImg.innerHTML = `<img src="${work.thumbnail_url}" loading="eager" alt="${work.title} — case study hero image | Jomiez Innovation" width="1200" height="630" style="width: 100%; height: 100%; object-fit: cover; display: block;" />`;
```

> Note: Hero images should use `loading="eager"` not `"lazy"` — they're above the fold and lazy-loading them delays LCP.

---

**Find** the hero image injection (around line 229):
```javascript
el.innerHTML = `<img src="${settings.hero_image}" loading="lazy" alt="Hero" style="width: 100%; height: auto; min-height: 480px; object-fit: cover; display: block; border-radius: 12px;"/>`;
```

**Replace with:**
```javascript
el.innerHTML = `<img src="${settings.hero_image}" loading="eager" fetchpriority="high" alt="${settings.founder_name || 'Jomiez Innovation founder'} — Software Developer & CEO" width="600" height="480" style="width: 100%; height: auto; min-height: 480px; object-fit: cover; display: block; border-radius: 12px;"/>`;
```

---

**Find** the about hero image injection (around line 331):
```javascript
el.innerHTML = `<img src="${settings.about_hero_image}" loading="lazy" alt="Hero" style="width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 12px;"/>`;
```

**Replace with:**
```javascript
el.innerHTML = `<img src="${settings.about_hero_image}" loading="eager" fetchpriority="high" alt="Jomiez Innovation team — Software developers and engineers" width="800" height="600" style="width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 12px;"/>`;
```

---

**Find** the about page profile image (around line 426):
```javascript
el.outerHTML = `<img src="${settings.about_me_page_image}" loading="lazy" alt="About" class="about-image" id="db-about-image" style="width: 100%; height: auto; min-height: 450px; object-fit: cover; display: block; border-radius: 12px;"/>`;
```

**Replace with:**
```javascript
el.outerHTML = `<img src="${settings.about_me_page_image}" loading="lazy" alt="${settings.founder_name || 'Ezinna Emmanuel Nweke'} — Founder & CEO of Jomiez Innovation" class="about-image" id="db-about-image" width="600" height="450" style="width: 100%; height: auto; min-height: 450px; object-fit: cover; display: block; border-radius: 12px;"/>`;
```

---

**Find** the logo footer injection (around line 677):
```javascript
footerLogo.outerHTML = `<img src="${settings.footer_watermark_image}" loading="lazy" alt="Logo" class="footer-watemark" />`;
```

**Replace with:**
```javascript
footerLogo.outerHTML = `<img src="${settings.footer_watermark_image}" loading="lazy" alt="Jomiez Innovation Logo" class="footer-watemark" width="120" height="40" />`;
```

---

**Find** the testimonial author image (around line 554):
```javascript
avatarHTML = `<img src="${profileImg}" alt="${fullName}" style="width: 68px; height: 68px; border-radius: 50%; object-fit: cover; border: 2px solid #E8602C;" />`;
```

**Replace with:**
```javascript
avatarHTML = `<img src="${profileImg}" alt="${fullName} — Jomiez Innovation client" width="68" height="68" style="width: 68px; height: 68px; border-radius: 50%; object-fit: cover; border: 2px solid #E8602C;" />`;
```

---

## FIX 11 — Create the branded OG image

**Why:** Every social share currently uses a Webflow template thumbnail. You need a proper 1200×630px branded image.

### What the image should contain:
- Dark background (`#0a0a0a`)
- Jomiez Innovation logo or wordmark
- Tagline: "Software Development, Web & AI Solutions"
- Website URL: `jomiez.com` or whatever your domain is
- Optional: a subtle tech/code visual

### How to reference it:

Once the image is created and saved as `/uploads/og-image.jpg`, update the default image in `server.js`:

**Find in the `injectSEOMeta` function:**
```javascript
<meta property="og:image" content="${meta.image || host + '/uploads/og-image.png'}" />
```

**Replace with:**
```javascript
<meta property="og:image" content="${meta.image || host + '/uploads/og-image.jpg'}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:type" content="image/jpeg" />
<meta property="og:image:alt" content="${meta.title}" />
```

And the Twitter image line:
```javascript
<meta name="twitter:image" content="${meta.image || host + '/uploads/og-image.png'}" />
```

**Replace with:**
```javascript
<meta name="twitter:image" content="${meta.image || host + '/uploads/og-image.jpg'}" />
<meta name="twitter:image:alt" content="${meta.title}" />
```

---

## FIX 12 — Optimize video delivery

**Why:** You have 7 MP4 files at ~5.2MB each. Loading these raw from your server kills Core Web Vitals. You already have Cloudinary in your `package.json` dependencies.

### Step A — Set up Cloudinary environment variables

Add to your `.env` file:
```
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### Step B — Upload existing videos to Cloudinary via script

Create a file `/scratch/upload-videos-to-cloudinary.js`:

```javascript
require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const path = require('path');
const fs = require('fs');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadsDir = path.join(__dirname, '..', 'uploads');
const videoFiles = fs.readdirSync(uploadsDir).filter(f => f.endsWith('.mp4'));

async function uploadAll() {
  for (const file of videoFiles) {
    const filePath = path.join(uploadsDir, file);
    console.log(`Uploading ${file}...`);
    try {
      const result = await cloudinary.uploader.upload(filePath, {
        resource_type: 'video',
        folder: 'jomiez-portfolio',
        public_id: path.basename(file, '.mp4'),
        eager: [
          { quality: 'auto', fetch_format: 'mp4' },
          { quality: 'auto', fetch_format: 'webm' }
        ],
        eager_async: true
      });
      console.log(`  ✓ Uploaded: ${result.secure_url}`);
    } catch (err) {
      console.error(`  ✗ Failed: ${err.message}`);
    }
  }
}

uploadAll();
```

Run it: `node scratch/upload-videos-to-cloudinary.js`

### Step C — Use Cloudinary URLs with auto-compression in dynamic.js

When rendering video elements, use Cloudinary's auto-quality transformation:

```javascript
// Helper function — add this near the top of dynamic.js
function cloudinaryVideoUrl(rawUrl) {
  if (!rawUrl) return rawUrl;
  // If it's already a Cloudinary URL, add quality:auto transformation
  if (rawUrl.includes('res.cloudinary.com')) {
    return rawUrl.replace('/upload/', '/upload/q_auto,f_auto/');
  }
  return rawUrl;
}

// Then anywhere you use a video src, wrap it:
// src="${cloudinaryVideoUrl(item.video_url)}"
```

---

---

# PART 3 — GROWTH OPTIMIZATIONS (For reaching thousands of visitors)

---

## FIX 13 — Add a Blog/Articles section to the CMS and server

**Why:** This is the single biggest thing you can do for organic traffic. Every developer agency ranking for keywords like "hire full-stack developer", "how to build a SaaS", "custom AI software company" gets the majority of that traffic from blog content — not their homepage. Content compounds over time.

### Step A — Add the blog database table in server.js

**Find** the `db.serialize(() => {` block and add this table:

```javascript
db.run(`CREATE TABLE IF NOT EXISTS blog_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT,
  content TEXT,
  cover_image TEXT,
  author TEXT DEFAULT 'Jomiez Innovation',
  category TEXT DEFAULT 'Tech',
  tags TEXT DEFAULT '[]',
  status TEXT DEFAULT 'draft',
  published_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  read_time INTEGER DEFAULT 5,
  meta_title TEXT,
  meta_description TEXT,
  views INTEGER DEFAULT 0
)`);
```

### Step B — Add blog API routes to server.js

**Add these routes** after the existing `/api/testimonials` route:

```javascript
// Blog Posts API
app.get('/api/blog', (req, res) => {
  const { status = 'published', category, limit = 10, offset = 0 } = req.query;
  let query = `SELECT id, slug, title, excerpt, cover_image, author, category, tags,
                      published_at, read_time, meta_title, meta_description, views
               FROM blog_posts WHERE status = ?`;
  const params = [status];

  if (category) {
    query += ` AND category = ?`;
    params.push(category);
  }

  query += ` ORDER BY published_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), parseInt(offset));

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const posts = rows.map(r => ({
      ...r,
      tags: (() => { try { return JSON.parse(r.tags); } catch { return []; } })()
    }));
    res.json(posts);
  });
});

app.get('/api/blog/:slug', (req, res) => {
  db.get(`SELECT * FROM blog_posts WHERE slug = ? AND status = 'published'`,
    [req.params.slug], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Not found' });

      // Increment view count
      db.run(`UPDATE blog_posts SET views = views + 1 WHERE slug = ?`, [req.params.slug]);

      res.json({
        ...row,
        tags: (() => { try { return JSON.parse(row.tags); } catch { return []; } })()
      });
    });
});

// Blog page routes
app.get('/blog', async (req, res) => {
  serveSEOPage(req, res, path.join(__dirname, 'blog.html'), {
    title: 'Blog — Software Development Insights, Tech Guides & AI Tutorials | Jomiez Innovation',
    description: 'Read expert articles on web development, mobile apps, AI integration, SaaS building, and software engineering best practices from the Jomiez Innovation team.',
    keywords: 'software development blog, web development articles, AI tutorials, SaaS guide, coding tips, tech blog, React tutorials, Node.js guides, app development tips, startup tech, developer blog'
  });
});

app.get('/blog/:slug', async (req, res) => {
  const post = await new Promise((resolve) => {
    db.get(`SELECT * FROM blog_posts WHERE slug = ? AND status = 'published'`,
      [req.params.slug], (err, row) => resolve(row || null));
  });

  const title = post
    ? `${post.meta_title || post.title} | Jomiez Innovation Blog`
    : 'Article Not Found | Jomiez Innovation Blog';
  const description = post
    ? (post.meta_description || post.excerpt || '').substring(0, 160)
    : 'Article not found on Jomiez Innovation Blog.';

  serveSEOPage(req, res, path.join(__dirname, 'blog-post.html'), {
    title,
    description,
    image: post ? post.cover_image : '',
    keywords: post
      ? `${post.title}, ${post.category}, ${(() => { try { return JSON.parse(post.tags).join(', '); } catch { return ''; } })()}, Jomiez Innovation`
      : 'blog, Jomiez Innovation'
  });
});
```

### Step C — Add blog posts to the sitemap in server.js

**Find** inside `app.get('/sitemap.xml', ...)`:

```javascript
const [services, works] = await Promise.all([
```

**Replace with:**

```javascript
const [services, works, blogPosts] = await Promise.all([
  new Promise((resolve) => db.all('SELECT slug, title, image_url FROM services', [], (err, rows) => resolve(rows || []))),
  new Promise((resolve) => db.all('SELECT slug, title, thumbnail_url, date FROM works', [], (err, rows) => resolve(rows || []))),
  new Promise((resolve) => db.all("SELECT slug, title, cover_image, published_at FROM blog_posts WHERE status = 'published'", [], (err, rows) => resolve(rows || [])))
]);
```

Then **find** the line that closes the sitemap (after the works loop):

```javascript
xml += `</urlset>`;
```

**Replace with:**

```javascript
blogPosts.forEach(p => {
  xml += `  <url>\n    <loc>${host}/blog/${p.slug}</loc>\n    <lastmod>${p.published_at ? p.published_at.split('T')[0] : today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>`;
  if (p.cover_image) {
    xml += `\n    <image:image>\n      <image:loc>${p.cover_image}</image:loc>\n      <image:title>${(p.title || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</image:title>\n    </image:image>`;
  }
  xml += `\n  </url>\n`;
});

xml += `</urlset>`;
```

### Step D — Add blog schema to seo-schema.js

**Append this function** to `js/seo-schema.js` before the closing `})();`:

```javascript
// ========== BLOG POST SCHEMA ==========
function injectBlogPostSchema(post) {
  if (!post) return;
  const schema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": post.title,
    "description": post.excerpt || post.meta_description || '',
    "image": post.cover_image || SITE_URL + '/uploads/og-image.jpg',
    "author": {
      "@type": "Organization",
      "name": "Jomiez Innovation",
      "url": SITE_URL
    },
    "publisher": {
      "@type": "Organization",
      "name": "Jomiez Innovation",
      "logo": {
        "@type": "ImageObject",
        "url": SITE_URL + '/uploads/logo.png'
      }
    },
    "datePublished": post.published_at || new Date().toISOString(),
    "dateModified": post.updated_at || post.published_at || new Date().toISOString(),
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": SITE_URL + '/blog/' + post.slug
    },
    "keywords": (() => { try { return JSON.parse(post.tags).join(', '); } catch { return ''; } })(),
    "articleBody": post.content || '',
    "wordCount": post.content ? post.content.split(' ').length : 0,
    "timeRequired": `PT${post.read_time || 5}M`
  };
  injectSchema(schema);
}
```

---

## FIX 14 — Add `package.json` metadata

**Why:** GitHub and npm both index package.json. When developers or clients search GitHub for your repo, empty fields look unprofessional.

**File:** `package.json`

**Find:**
```json
{
  "name": "port-3",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1",
    "start": "node server.js"
  },
  "keywords": [],
  "author": "",
```

**Replace with:**
```json
{
  "name": "jomiez-innovation-portfolio",
  "version": "3.0.0",
  "description": "Official portfolio website for Jomiez Innovation — Software Development, Web, Mobile & AI Solutions company",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js",
    "test": "echo \"No tests configured\" && exit 0"
  },
  "keywords": [
    "jomiez",
    "jomiez-innovation",
    "portfolio",
    "software-development",
    "web-development",
    "nodejs",
    "express",
    "sqlite"
  ],
  "author": "Ezinna Emmanuel Nweke <hello@jomiez.com> (https://jomiez.com)",
  "license": "UNLICENSED",
  "homepage": "https://jomiez.com",
  "repository": {
    "type": "git",
    "url": "https://github.com/jomiez/portfolio"
  },
```

---

## FIX 15 — Add `contact-us` route to server.js (it's missing!)

**Why:** Checking the routes in server.js, there is no explicit `/contact-us` route — the page is only served by the static file fallback. This means it doesn't get server-side SEO injection. It needs its own route.

**Find in server.js** after the testimonials route:

```javascript
app.get('/testimonials', async (req, res) => {
  serveSEOPage(req, res, path.join(__dirname, 'testimonials.html'), {
```

**Add this route directly after the testimonials block:**

```javascript
app.get('/contact-us', async (req, res) => {
  serveSEOPage(req, res, path.join(__dirname, 'contact-us.html'), {
    title: 'Contact Jomiez Innovation — Start Your Project | Get a Free Consultation',
    description: 'Ready to build something great? Contact Jomiez Innovation today. We build custom websites, mobile apps, AI-powered platforms, SaaS products, and enterprise software. Free consultation available for new projects.',
    keywords: 'contact Jomiez Innovation, hire developer, start a project, software development quote, web development quote, app development consultation, get a quote, free consultation, hire programmer, build my website, build my app, software company contact'
  });
});

app.get('/contact', (req, res) => res.redirect(301, '/contact-us'));
```

---

## FIX 16 — Add 301 redirects for clean URL consistency

**Why:** Having both `/works.html` and `/works` accessible means Google could index both, creating duplicate content. Add 301 redirects to canonicalize all `.html` URLs.

**Find in server.js** (near the existing redirect):
```javascript
app.get('/resume.html', (req, res) => res.redirect('/resume'));
```

**Replace with:**
```javascript
// 301 Redirects — Canonicalize .html URLs to clean paths
const htmlRedirects = {
  '/home.html': '/',
  '/about.html': '/about',
  '/works.html': '/works',
  '/testimonials.html': '/testimonials',
  '/contact-us.html': '/contact-us',
  '/privacy-policy.html': '/privacy-policy',
  '/change-log.html': '/change-log',
  '/style-guide.html': '/style-guide',
  '/license.html': '/license',
  '/404.html': '/404',
  '/resume.html': '/resume',
};

Object.entries(htmlRedirects).forEach(([from, to]) => {
  app.get(from, (req, res) => res.redirect(301, to));
});
```

---

## FIX 17 — Add structured data for the contact page (LocalBusiness schema)

**Why:** For service businesses, the LocalBusiness schema helps Google understand your contact info, opening hours, and service area — which feeds into Google's Knowledge Panel and local search results.

**Add to `js/seo-schema.js`** inside the main `init()` or equivalent call block:

```javascript
// ========== LOCAL BUSINESS / PROFESSIONAL SERVICE SCHEMA ==========
function injectLocalBusinessSchema(settings) {
  const schema = {
    "@context": "https://schema.org",
    "@type": ["ProfessionalService", "SoftwareApplication"],
    "name": "Jomiez Innovation",
    "url": SITE_URL,
    "telephone": settings.contact_phone || "",
    "email": settings.contact_email || "hello@jomiez.com",
    "description": "Jomiez Innovation is a full-service software development company specializing in web applications, mobile apps, AI integration, and custom enterprise software for global clients.",
    "priceRange": "$$",
    "currenciesAccepted": "USD, GBP, EUR, NGN",
    "paymentAccepted": "Credit Card, Bank Transfer, Crypto",
    "areaServed": "Worldwide",
    "serviceArea": {
      "@type": "AdministrativeArea",
      "name": "Worldwide"
    },
    "openingHoursSpecification": {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday"],
      "opens": "09:00",
      "closes": "18:00"
    },
    "contactPoint": {
      "@type": "ContactPoint",
      "contactType": "customer support",
      "email": settings.contact_email || "hello@jomiez.com",
      "availableLanguage": ["English"],
      "contactOption": "TollFree"
    }
  };

  // Only inject on contact page
  if (PAGE_PATH === '/contact-us' || PAGE_PATH === '/contact') {
    injectSchema(schema);
  }
}
```

---

---

# PART 4 — QUICK WINS (Under 5 minutes each)

---

## QUICK WIN 1 — Noindex utility pages

**Why:** `style-guide.html`, `change-log.html`, and `license.html` should not appear in search results — they're internal pages that waste Google's crawl budget.

**Add these routes to server.js** before the static middleware:

```javascript
// Noindex utility pages — serve but tell Google not to index
app.get('/style-guide', (req, res) => {
  let html = fs.readFileSync(path.join(__dirname, 'style-guide.html'), 'utf8');
  html = html.replace('</head>', `    <meta name="robots" content="noindex, nofollow" />\n</head>`);
  res.send(html);
});

app.get('/change-log', (req, res) => {
  let html = fs.readFileSync(path.join(__dirname, 'change-log.html'), 'utf8');
  html = html.replace('</head>', `    <meta name="robots" content="noindex, nofollow" />\n</head>`);
  res.send(html);
});

app.get('/license', (req, res) => {
  let html = fs.readFileSync(path.join(__dirname, 'license.html'), 'utf8');
  html = html.replace('</head>', `    <meta name="robots" content="noindex, nofollow" />\n</head>`);
  res.send(html);
});
```

---

## QUICK WIN 2 — Add `Cache-Control` headers for performance

**Find in server.js** the static files line:
```javascript
app.use(express.static(path.join(__dirname, ''), { extensions: ['html'] }));
```

**Replace with:**
```javascript
app.use(express.static(path.join(__dirname, ''), {
  extensions: ['html'],
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css') || filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year for assets
    } else if (filePath.match(/\.(jpg|jpeg|png|gif|webp|avif|svg|ico)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=2592000'); // 30 days for images
    } else if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour for HTML
    }
  }
}));
```

---

## QUICK WIN 3 — Compress responses with gzip

**Find** in server.js near the top where other middleware is set up (around the `express.json()` line):

```javascript
const express = require('express');
```

**Add compression** right after the requires:
```javascript
const compression = require('compression');
```

Then install it:
```bash
npm install compression
```

And **find** the first `app.use(...)` line and **add before it**:
```javascript
// Gzip compression — reduces transfer size by 60-80%
app.use(compression({
  level: 6,
  threshold: 1024, // Only compress responses > 1KB
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));
```

---

---

# PART 5 — CONTENT STRATEGY (For thousands of organic visitors)

---

## Target keywords by priority

Below are the exact keywords your blog and pages should target, ranked by difficulty vs. opportunity:

### Tier 1 — Low competition, high intent (write these articles first)
```
"how to build a SaaS MVP"
"custom web app development cost"
"hire full stack developer Nigeria"
"AI integration for small business"
"React vs Next.js for startups"
"how much does a mobile app cost"
"best Node.js backend framework 2025"
"Webflow vs custom development"
```

### Tier 2 — Medium competition, brand building
```
"software development company Nigeria"
"AI chatbot development service"
"custom software development pricing"
"how to choose a software development company"
"MVP development agency"
```

### Tier 3 — High competition, long-term plays
```
"software development company"
"hire developer"
"web development agency"
"custom mobile app development"
```

---

## First 5 blog posts to write (in this order)

1. **"How Much Does It Cost to Build a Custom Web App in 2025?"**
   - Target: `custom web app cost`, `web development pricing`
   - Word count: 2,000+
   - Include: pricing table, breakdown by feature type, Jomiez CTA

2. **"How to Build an AI-Powered SaaS in 6 Months (Our Proven Process)"**
   - Target: `AI SaaS development`, `build AI product`
   - Word count: 2,500+
   - Include: step-by-step process, tech stack recommendations

3. **"React vs Next.js vs Astro: Which Should You Use for Your Business Website?"**
   - Target: `React vs Next.js`, `best framework for business website`
   - Word count: 1,800+
   - Include: comparison table, use case examples

4. **"The Ultimate Guide to Hiring a Software Developer in 2025"**
   - Target: `hire software developer`, `hire developer guide`
   - Word count: 2,000+
   - Include: red flags, interview questions, cost breakdown

5. **"How We Built Chaka AI: From Concept to Production"**
   - Target: `AI chatbot development`, `build AI assistant`
   - Word count: 1,500+
   - Include: architecture diagram, tech stack, lessons learned

---

## Final checklist — verify before going live

Run through this after all fixes are applied:

```
[ ] All HTML <title> tags have real text (not "Loading...")
[ ] All OG/Twitter tags say Jomiez (not ResumX)
[ ] data-wf-domain attribute removed from all <html> tags
[ ] <meta name="generator" content="Webflow"> removed from all pages
[ ] Favicon is self-hosted (not from Webflow CDN)
[ ] CSS is self-hosted (not from Webflow CDN)
[ ] All images have meaningful alt text
[ ] about.html counter elements changed from h1 to p
[ ] home.html CTA heading changed from h1 to h2
[ ] Google Search Console verification meta tag added
[ ] GA4 tracking script added
[ ] /contact-us has its own serveSEOPage() route
[ ] OG image (1200x630px) created and saved to /uploads/og-image.jpg
[ ] Branded og:image referenced in server.js
[ ] 301 redirects added for all .html URLs
[ ] site.webmanifest created and served
[ ] Compression middleware installed
[ ] Cache-Control headers added to static files
[ ] Sitemap submitted to Google Search Console
[ ] robots.txt verified at yourdomain.com/robots.txt
[ ] Sitemap verified at yourdomain.com/sitemap.xml
[ ] Test social sharing on Twitter Card Validator: cards-dev.twitter.com/validator
[ ] Test OG tags on Facebook Debugger: developers.facebook.com/tools/debug
[ ] Test structured data on: search.google.com/test/rich-results
[ ] Test Core Web Vitals on: pagespeed.web.dev
```
