require('dotenv').config();
const express = require('express');
const compression = require('compression');
const tursoAdapter = require('./lib/tursoAdapter');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const https = require('https');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { WebSocketServer } = require('ws');
const { initChakaStream } = require('./ai/ChakaStream');
const ApiKeyManager = require('./ai/ApiKeyManager');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const db = require('./lib/supabaseAdapter');
const { renderContent } = require('./lib/ssr');
const { buildGraph } = require('./lib/schema');
const { scoreLead } = require('./lib/leadTriage');
const { sendLeadReply, notifyOwner, isConfigured: mailerConfigured, missingConfig: missingMailConfig } = require('./lib/mailer');
const { fetchRecent: fetchInbox, isConfigured: inboxConfigured, missingConfig: missingInboxConfig, configure: configureInbox } = require('./lib/inbox');
const { syncDatabaseToVectorDB, upsertDocument, deleteDocument, searchVectorDB } = require('./ai/vectorDB');

// Prevent server crash on database connection issues
process.on('unhandledRejection', (reason, promise) => {
    console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
    // Do not exit, just log it. This keeps the server running if Turso is down.
});

// --- Visitor & Lead Analytics Helpers ---
async function getCountryFromIP(ip) {
  return new Promise((resolve) => {
    // Handle local dev IPs
    if (ip === '::1' || ip === '127.0.0.1' || !ip || ip.includes('192.168.')) {
      return resolve('Localhost');
    }
    
    https.get(`https://ipapi.co/${ip}/json/`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.country_name || 'Unknown');
        } catch (e) {
          resolve('Unknown');
        }
      });
    }).on('error', () => resolve('Unknown'));
  });
}

const app = express();

// Render (like most hosts) terminates TLS at its edge and forwards over plain HTTP,
// so req.protocol reports "http" unless Express is told to trust the proxy and read
// X-Forwarded-Proto. Without this every self-referential URL the site emits —
// canonical, og:url, og:image, hreflang, and every schema @id — claimed http://
// while the site actually serves https://. That is a conflicting canonical signal,
// it makes some link-preview crawlers drop the OG image, and because @id is the
// identity key for the structured-data graph, it identified the entity at a URL
// that does not exist.
app.set('trust proxy', true);

// Belt and braces: if anything still reports http in production, treat it as https.
// The site is https-only, so there is no case where http is the correct answer.
function siteHost(req) {
  const proto = process.env.NODE_ENV === 'production' ? 'https' : req.protocol;
  return `${proto}://${req.get('host')}`;
}
const PORT = process.env.PORT || 3000;

// Gzip compression — reduces transfer size by 60-80%
app.use(compression({
  level: 6,
  threshold: 1024, // Only compress responses > 1KB
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));

// Redirect Render domain to custom domain
app.use((req, res, next) => {
  if (req.hostname === 'jomiez-port.onrender.com') {
    return res.redirect(301, 'https://jomiez.com' + req.url);
  }
  next();
});

app.use((req, res, next) => {
  console.log(`[REQUEST] ${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// 1. Persistent Storage (Images/Media)
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'portfolio_uploads',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp', 'gif', 'svg', 'pdf', 'doc', 'docx', 'mp4', 'webm', 'mov'],
    resource_type: 'auto'
  },
});
const upload = multer({ storage: storage });

// 2. Temporary Local Storage (for AI Audio Processing)
const tempStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = './uploads';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, 'temp_' + Date.now() + path.extname(file.originalname));
  }
});
const tempUpload = multer({ storage: tempStorage });

// Database Setup (Turso)
console.log('Connected to the Postgres database via supabaseAdapter.');
global.apiKeyManager = new ApiKeyManager(db);
global.apiKeyManager.refreshCache(); // Initial load

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Held in a variable so the WebSocket upgrade can reuse the exact same parser and
// decide admin rights from a real session instead of a client-supplied header.
const sessionParser = session({
  // A hardcoded secret means every deployment of this code signs cookies the same
  // way, so anyone with the source can forge an admin session. Set SESSION_SECRET
  // in the environment; the literal is only a fallback for local development.
  secret: process.env.SESSION_SECRET || 'chaka-secret-key-2025',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
});
app.use(sessionParser);

// Auth Middleware
function isAuthenticated(req, res, next) {
    if (req.session.user) return next();
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
    res.redirect('/admin/login');
}

// ── API access control ────────────────────────────────────────────────────────
// Private by default. Previously each route was expected to guard itself and
// several never did: GET /api/leads returned the whole CRM (names, emails, full
// project enquiries) and GET /api/apikeys returned live DeepSeek, Gemini and
// NVIDIA keys in full — both unauthenticated, in production.
//
// Anything the public site genuinely needs is listed here explicitly. Everything
// else now requires an admin session, so forgetting a guard fails closed.
const PUBLIC_API = [
    { m: 'GET',  p: /^\/api\/(works|services|skills|brands|faqs|testimonials|counters|marquee|blog)(\/|$)/ },
    { m: 'GET',  p: /^\/api\/settings$/ },        // public site copy; filtered below
    { m: 'GET',  p: /^\/api\/status$/ },
    { m: 'GET',  p: /^\/api\/check-auth$/ },
    { m: 'GET',  p: /^\/api\/chaka\/(knowledge|site-state|voice-token)$/ },
    { m: 'POST', p: /^\/api\/chaka\/(chat_text|chat_audio|tts|execute_tool)$/ },
    { m: 'POST', p: /^\/api\/contact$/ },
    { m: 'POST', p: /^\/api\/(login|logout)$/ }
];

app.use('/api', (req, res, next) => {
    if (req.session.user) return next();
    const path = req.baseUrl + req.path;      // req.path is relative to the mount
    const ok = PUBLIC_API.some(r => r.m === req.method && r.p.test(path));
    if (ok) return next();
    return res.status(401).json({ error: 'Unauthorized' });
});

// Settings drive public page copy, so the site needs to read them — but the table
// also holds API keys, verification tokens and other operational values. Strip
// anything sensitive for callers without a session.
// imap_* covers the whole mail-server config, not just the password. The public
// site has no use for the host or the mailbox username, and publishing them only
// helps someone trying the door.
const SENSITIVE_SETTING = /(key|token|secret|password|credential|api|^imap_|^smtp_)/i;
function publicSettings(rows) {
    return rows.filter(r => !SENSITIVE_SETTING.test(r.key));
}

// Global Middleware to track visits (Safe usage of db)
app.use(async (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.includes('.') || req.path.startsWith('/uploads') || req.path.startsWith('/admin')) {
    return next();
  }
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];
  const country = await getCountryFromIP(ip);
  db.run(`INSERT INTO site_analytics (path, country, ip_address, user_agent) VALUES (?, ?, ?, ?)`,
    [req.path, country, ip, userAgent], () => {});
  next();
});

// Cache Control
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// --- ADMIN ROUTES ---
app.get('/admin', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'admin', 'admin.html')));
app.get('/admin/', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'admin', 'admin.html')));
app.get('/admin/login', (req, res) => res.sendFile(path.join(__dirname, 'admin', 'login.html')));

// --- AUTH API ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM portfolio_users WHERE username = ?", [username], (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'Invalid credentials' });
        if (bcrypt.compareSync(password, user.password)) {
            req.session.user = { id: user.id, username: user.username };
            res.json({ success: true, user: { username: user.username } });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    });
});

app.get('/api/check-auth', (req, res) => {
    if (req.session.user) res.json({ authenticated: true, user: req.session.user });
    else res.json({ authenticated: false });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// --- PUBLIC API ---
app.post('/api/contact', async (req, res) => {
    const { firstName, lastName, email, message, subject } = req.body;
    const name = `${firstName || ''} ${lastName || ''}`.trim();
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const country = await getCountryFromIP(ip);
    // created_at was never written, so every lead rendered as 1/1/1970 in the admin.
    // The live table has created_at TEXT with no default; the CREATE TABLE in this
    // file declares a different column and never ran, because the table pre-existed.
    db.run(`INSERT INTO client_leads (name, email, project_scope, country, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [name || 'Anonymous', email, message || subject || 'Direct Contact Form', country, ip, new Date().toISOString()],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: 'Message sent successfully!' });
        }
    );
});

// Global API Protection for mutations
// (An older /api gate lived here. It allowed every GET through, which is exactly
// how /api/leads and /api/apikeys ended up world-readable. The gate above replaces
// it and is allowlist-based in both directions.)

// --- SEO: Server-Side Meta Tag Injection ---
// Injects real title, description, OG tags, canonical URL, and keywords into HTML before serving
// This ensures Google sees actual content instead of skeleton loaders
function getSettings() {
  return new Promise((resolve) => {
    db.all('SELECT key, value FROM settings', [], (err, rows) => {
      if (err || !rows) return resolve({});
      const s = {};
      rows.forEach(r => s[r.key] = r.value);
      resolve(s);
    });
  });
}

function getFaqs() {
  return new Promise((resolve) => {
    db.all('SELECT * FROM faqs ORDER BY sort_order ASC, id ASC', [], (err, rows) => {
      if (err || !rows) return resolve([]);
      resolve(rows);
    });
  });
}

function getTestimonials() {
  return new Promise((resolve) => {
    db.all('SELECT * FROM testimonials ORDER BY sort_order ASC, id ASC', [], (err, rows) => {
      resolve(err || !rows ? [] : rows);
    });
  });
}

function getWorks() {
  return new Promise((resolve) => {
    db.all('SELECT * FROM works ORDER BY id ASC', [], (err, rows) => {
      resolve(err || !rows ? [] : rows);
    });
  });
}

function getBrands() {
  return new Promise((resolve) => {
    db.all('SELECT * FROM brands ORDER BY sort_order ASC, id ASC', [], (err, rows) => {
      resolve(err || !rows ? [] : rows);
    });
  });
}

function getSkills() {
  return new Promise((resolve) => {
    db.all('SELECT * FROM skills ORDER BY sort_order ASC, id ASC', [], (err, rows) => {
      resolve(err || !rows ? [] : rows);
    });
  });
}

function getCounters() {
  return new Promise((resolve) => {
    db.all('SELECT * FROM counters ORDER BY sort_order ASC, id ASC', [], (err, rows) => {
      resolve(err || !rows ? [] : rows);
    });
  });
}

function getServices() {
  return new Promise((resolve) => {
    db.all('SELECT * FROM services ORDER BY sort_order ASC, id ASC', [], (err, rows) => {
      resolve(err || !rows ? [] : rows);
    });
  });
}

// Meta content is attribute-quoted; titles and descriptions contain & and " often
// enough that unescaped values silently truncate a tag.
function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function injectSEOMeta(html, meta, settings = {}, faqs = []) {
  const host = meta.host || '';
  const canonical = `<link rel="canonical" href="${host}${meta.path || '/'}" />`;
  const robotsMeta = `<meta name="robots" content="${meta.robots || 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'}" />`;
  const keywords = `<meta name="keywords" content="${meta.keywords || 'software development, web development, app development, Jomiez, Jomiez Innovation, coding, programming, hire developer, build website, AI solutions, custom software, mobile app, SaaS, startup, MVP, digital transformation, IT consulting, UI UX design, full stack developer, React, Node.js, Python, cloud computing, DevOps, API development, e-commerce, business solutions, tech company, freelance developer, Templeton, Emmanuel Ezinna Nweke'}" />`;
  // Name the human behind the work explicitly and identically everywhere. The site
  // previously spelled it three different ways (Ezinna Emmanuel Nweke / Ezinna Nweke
  // Emmanuel / Templeton alone), which splits one person into several weak entities
  // as far as search and AI systems are concerned.
  const founder = settings.founder_name || 'Emmanuel Ezinna Nweke';
  const authorMeta = [
    `<meta name="author" content="${founder}" />`,
    `<meta name="creator" content="${founder}" />`,
    `<meta name="publisher" content="Jomiez Innovation" />`,
    `<meta name="copyright" content="Jomiez Innovation" />`,
    // Explicit crawler directives — the defaults are conservative about snippet length,
    // and long snippets are what AI answers actually quote.
    `<meta name="googlebot" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />`,
    `<meta name="bingbot" content="index, follow, max-snippet:-1, max-image-preview:large" />`,
    `<meta name="rating" content="general" />`
  ].join('\n    ');
  const geoMeta = `<meta name="geo.region" content="NG" />\n    <meta name="geo.placename" content="Nigeria" />`;
  // Only claim a Twitter handle if a real profile URL is configured. The hardcoded
  // "@jomiez" pointed at an account that was never registered.
  const twHandle = (settings.social_twitter || '').match(/(?:twitter|x)\.com\/@?([A-Za-z0-9_]{1,15})\/?$/);
  const twitterHandle = twHandle ? `\n    <meta name="twitter:creator" content="@${twHandle[1]}" />\n    <meta name="twitter:site" content="@${twHandle[1]}" />` : '';
  const langAlts = `<link rel="alternate" hreflang="en" href="${host}${meta.path || '/'}" />\n    <link rel="alternate" hreflang="x-default" href="${host}${meta.path || '/'}" />`;
  const themeColor = `<meta name="theme-color" content="#0a0a0a" />`;
  const preconnect = `<link rel="preconnect" href="https://fonts.googleapis.com" />\n    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />`;


  let result = html;

  result = result.replace(/<title>[^<]*<\/title>/, `<title>${meta.title}</title>`);

  // Strip the exported file's own SEO tags before injecting ours.
  //
  // Previously we patched a few of them in place and appended a fresh set, which left
  // every page with TWO of each: two og:type, two og:site_name, two twitter:card, and
  // — worst — a stale `og:image` pointing at /uploads/og-image.jpg, a file that does
  // not exist, plus a hardcoded `twitter:creator` for an account that was never
  // registered. Crawlers are free to pick either copy, so link previews were rolling
  // the dice on a 404 image. The server is the single source of truth for these.
  const staleMeta = new RegExp(
    '[ \\t]*<meta[^>]+(?:' +
      // NB: the character classes must include "_" — og:site_name and
      // og:image:secure_url were slipping through a [a-z:]+ class and surviving as
      // duplicates.
      'name="(?:description|keywords|author|creator|publisher|copyright|robots|googlebot|bingbot|rating|twitter:[a-z_:]+)"' +
      '|property="(?:og:[a-z_:]+|twitter:[a-z_:]+|article:[a-z_]+)"' +
    ')[^>]*>\\s*\\n?', 'gi');
  result = result.replace(staleMeta, '');
  // Same for canonical/hreflang — ours carry the correct per-route URL.
  result = result.replace(/[ \t]*<link[^>]+rel="(?:canonical|alternate)"[^>]*hreflang?[^>]*>\s*\n?/gi, '');
  result = result.replace(/[ \t]*<link[^>]+rel="canonical"[^>]*>\s*\n?/gi, '');

  // Remove stale Webflow domain reference (cosmetic only — keep data-wf-page and data-wf-site for animations!)
  result = result.replace(/data-wf-domain="[^"]*"/g, '');

  // Inject canonical, robots, keywords, author, theme-color, etc. before </head>
  const resourceHints = `
    <!-- Performance: Resource Hints -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="preconnect" href="https://res.cloudinary.com" />
    <link rel="preconnect" href="https://ajax.googleapis.com" />
    <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
    <link rel="dns-prefetch" href="https://www.google-analytics.com" />`;

  const gscVerification = settings.gsc_verification_id ? `<meta name="google-site-verification" content="${settings.gsc_verification_id}" />` : '';

  // The single canonical <head> block. Everything social/SEO lives here and nowhere
  // else — the exported files' own tags are stripped above before this is injected.
  const ogImage = meta.image || `${host}/og-image.png`;
  const additionalMetaFull = `${resourceHints}
    <meta name="description" content="${esc(meta.description)}" />
    ${canonical}
    ${robotsMeta}
    ${keywords}
    ${authorMeta}
    ${geoMeta}
    ${langAlts}
    ${themeColor}
    ${gscVerification}
    <!-- Open Graph -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Jomiez Innovation" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:url" content="${host}${meta.path || '/'}" />
    <meta property="og:title" content="${esc(meta.title)}" />
    <meta property="og:description" content="${esc(meta.description)}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:image:secure_url" content="${ogImage}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:alt" content="${esc(meta.title)}" />
    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${host}${meta.path || '/'}" />
    <meta name="twitter:title" content="${esc(meta.title)}" />
    <meta name="twitter:description" content="${esc(meta.description)}" />
    <meta name="twitter:image" content="${ogImage}" />
    <meta name="twitter:image:alt" content="${esc(meta.title)}" />${twitterHandle}
    <!-- Attribution: identical wording everywhere so the person and the studio
         resolve to one entity rather than several near-duplicates -->
    <meta property="article:author" content="${founder}" />
    <meta property="article:publisher" content="Jomiez Innovation" />
    <meta name="dcterms.creator" content="${founder}" />
    <meta name="dcterms.publisher" content="Jomiez Innovation" />
    <script src="/js/seo-schema.js" defer></script>`;

  // Body content (hero, FAQs, works, services, testimonials) is rendered by
  // lib/ssr.js in serveSEOPage. It used to happen here by wrapping text in
  // <span class="skeleton" style="color:transparent">, which put the text in the
  // HTML but hid it from actual visitors — the classic hidden-text pattern search
  // engines penalise. injectSEOMeta is now responsible for <head> only.

  // One linked @graph, rendered server-side. Replaces the old standalone
  // ProfessionalService block, which claimed addressCountry "US" with a geo
  // midpoint in Kansas (the studio is Nigeria-based, serving worldwide), pointed
  // logo/image at /uploads/og-image.jpg which does not exist, and listed a
  // twitter.com/jomiez profile that was never real.
  const graph = buildGraph({
    host,
    path: meta.path || '/',
    meta,
    settings,
    // FAQPage may only describe FAQs the visitor can actually see on that page.
    // The accordion only exists on the home page, so emitting it everywhere was a
    // structured-data violation that risks a manual action.
    faqs: html.includes('faq-question-wrapper') ? faqs : [],
    services: meta.schemaServices || [],
    works: meta.schemaWorks || [],
    testimonials: meta.schemaTestimonials || []
  });

  const schemas = `<script type="application/ld+json">${JSON.stringify(graph)}</script>`;

  // js/seo-schema.js no longer injects structured data — the graph above is the
  // single source, and it ships in the HTML so non-JS crawlers actually see it.
  const additionalMetaFullWithSchema = additionalMetaFull.replace(
    '<script src="/js/seo-schema.js" defer></script>',
    schemas
  );

  result = result.replace('</head>', `    ${additionalMetaFullWithSchema}\n</head>`);

  const gaId = settings.google_analytics_id || 'G-WZ013C4HN0';
  const ga4Script = `
  <!-- Google Analytics 4 -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=${gaId}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${gaId}', {
      page_title: document.title,
      page_location: window.location.href,
      send_page_view: true
    });
  </script>`;

  result = result.replace('</body>', `    ${ga4Script}\n</body>`);

  return result;
}

// Parsing a ~140KB Webflow page with jsdom costs real time, and the content only
// changes when someone saves in /admin. Cache the fully rendered body per file and
// let admin writes bust it (see invalidatePageCache).
const pageCache = new Map();
const PAGE_CACHE_TTL_MS = 5 * 60 * 1000;

// One CMS snapshot shared by every consumer in a request.
//
// The database is remote (Neon/Supabase) and each round trip costs ~300ms. Before
// this, a single page view issued up to 13 queries — renderPageBody fetched eight,
// serveSEOPage fetched settings and faqs again, then three more for the schema
// graph — and five of those still ran even when the rendered page was cached,
// because they happened before the cache was consulted. That put ~2s of pure
// database latency on every request. Now it is six queries once per TTL.
let cmsCache = null;
let cmsCacheAt = 0;

async function getCmsData() {
  if (cmsCache && Date.now() - cmsCacheAt < PAGE_CACHE_TTL_MS) return cmsCache;
  const [settings, faqs, testimonials, works, services, brands, skills, counters, blog] = await Promise.all([
    getSettings(), getFaqs(), getTestimonials(), getWorks(), getServices(), getBrands(),
    getSkills(), getCounters(),
    // Blog feeds the site manifest: with zero posts, /blog is listed as absent so
    // Chaka never offers to walk someone into an empty page.
    new Promise((resolve) => db.all('SELECT slug, title FROM blog_posts', [], (e, r) => resolve(e || !r ? [] : r)))
  ]);
  cmsCache = { settings, faqs, testimonials, works, services, brands, skills, counters, blog };
  cmsCacheAt = Date.now();
  return cmsCache;
}

function invalidatePageCache() {
  pageCache.clear();
  cmsCache = null;
  cmsCacheAt = 0;
}

// Any write through the admin API means the rendered pages are stale. Registered
// here, above the /api routes, so it covers all of them without touching each one.
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') invalidatePageCache();
  next();
});

async function renderPageBody(filePath, cms, extra = {}) {
  // Every project shares work-detail-page.html, so the cache key has to include
  // which project is being rendered — otherwise the first one requested would be
  // served for all nine.
  const cacheKey = extra.work ? `${filePath}#${extra.work.slug || extra.work.id}` : filePath;
  const cached = pageCache.get(cacheKey);
  if (cached && Date.now() - cached.at < PAGE_CACHE_TTL_MS) return cached.html;

  const raw = await fs.promises.readFile(filePath, 'utf8');
  let html = raw;
  try {
    const isHome = path.basename(filePath) === 'home.html';
    html = renderContent(raw, { ...cms, ...extra, isHome }).html;
  } catch (err) {
    // Never let a render bug take the site down — fall back to the raw export.
    console.error('[SSR] renderContent failed for', filePath, '-', err.message);
  }
  pageCache.set(cacheKey, { html, at: Date.now() });
  return html;
}

async function serveSEOPage(req, res, filePath, metaOverrides = {}) {
  const cms = await getCmsData();
  const { settings, faqs } = cms;
  const host = siteHost(req);

  const meta = {
    host,
    path: req.path,
    title: metaOverrides.title || 'Jomiez Innovation — Software Development, Web & App Solutions',
    description: metaOverrides.description || 'Jomiez Innovation is a leading software development company. We build custom websites, mobile apps, AI-powered solutions, and enterprise software for businesses worldwide. Hire expert developers today.',
    image: metaOverrides.image || settings.hero_image_url || '',
    keywords: metaOverrides.keywords || '',
    ...metaOverrides
  };

  try {
    // Feed the real catalogue into the structured-data graph so services, projects
    // and any genuine testimonials are machine-readable, not just rendered text.
    Object.assign(meta, {
      schemaServices: cms.services,
      schemaWorks: cms.works,
      schemaTestimonials: cms.testimonials
    });

    const html = await renderPageBody(filePath, cms, metaOverrides.work ? { work: metaOverrides.work } : {});
    res.send(injectSEOMeta(html, meta, settings, faqs));
  } catch (err) {
    console.error('[serveSEOPage]', filePath, err.message);
    res.status(500).send('Error loading page');
  }
}

// --- PUBLIC ROUTES (SEO-Optimized) ---
app.get('/', async (req, res) => {
  serveSEOPage(req, res, path.join(__dirname, 'home.html'), {
    title: 'Jomiez | Software Development & AI Development Company',
    description: 'Jomiez builds custom software, websites, mobile apps, AI systems, and SaaS products for startups and businesses worldwide. Hire our development team.',
    keywords: 'Jomiez, Jomiez Innovation, software development company, web development, mobile app development, AI development, custom software, hire developer, build website, build app, coding services, programming, full stack developer, React developer, Node.js, Python developer, SaaS development, MVP development, startup solutions, digital transformation, IT consulting, UI UX design, e-commerce development, API development, cloud computing, DevOps, business solutions, tech company, web design, app design, freelance developer, software engineer, Templeton, Emmanuel Ezinna Nweke, best software company, top web developer, hire programmer, build my website, build my app, website builder, app builder, custom web application, enterprise software, fintech development, healthcare software, education technology, affordable web development, professional website design, responsive web design, SEO services, digital marketing, online business solutions, technology partner, innovation, software house, coding agency, development agency, offshore development, nearshore development, remote developer'
  });
});

app.get('/about', async (req, res) => {
  serveSEOPage(req, res, path.join(__dirname, 'about.html'), {
    title: 'About Jomiez Innovation — Our Story, Mission & Expert Team | Software Development Leaders',
    description: 'Learn about Jomiez Innovation, a leading software development company founded by Emmanuel Ezinna Nweke (Templeton). We specialize in building custom software, websites, mobile apps, and AI solutions for businesses worldwide. Discover our mission, values, and the expertise behind our innovative solutions.',
    keywords: 'about Jomiez, Jomiez Innovation team, Templeton developer, Emmanuel Ezinna Nweke, software company about, web development team, app development company, our story, company mission, tech company values, experienced developers, professional software engineers, innovation leaders, technology experts'
  });
});

app.get('/services', async (req, res) => {
  serveSEOPage(req, res, path.join(__dirname, 'services.html'), {
    title: 'Our Services — Web Development, Mobile Apps, AI Solutions, Custom Software | Jomiez Innovation',
    description: 'Explore our comprehensive software development services: custom web development, mobile app development, AI & automation solutions, UI/UX design, cloud computing, DevOps, SaaS platforms, API development, and digital transformation. Get a free consultation today.',
    keywords: 'web development services, mobile app development, custom software development, AI development services, machine learning solutions, UI UX design services, cloud computing services, DevOps consulting, SaaS development, API development, e-commerce development, digital transformation services, IT consulting, software architecture, database design, cybersecurity services, progressive web apps, full stack development services, React development, Node.js development, Python development, hire developers, software outsourcing'
  });
});

app.get('/works', async (req, res) => {
  serveSEOPage(req, res, path.join(__dirname, 'works.html'), {
    title: 'Our Portfolio — Projects & Case Studies | Web, App & Software Development by Jomiez Innovation',
    description: 'Browse our portfolio of successfully delivered projects. From custom websites and mobile apps to AI-powered platforms and enterprise software — see how Jomiez Innovation transforms ideas into powerful digital solutions for businesses worldwide.',
    keywords: 'portfolio, case studies, web development projects, mobile app projects, software development portfolio, client projects, project showcase, website design portfolio, app development showcase, custom software projects, Jomiez portfolio, development agency work'
  });
});

// The testimonials page only exists when there are real testimonials to show.
// With an empty table it 301s to /, and getTestimonials() also strips the
// section and nav link from every page. Add one in /admin to bring it back.
app.get('/testimonials', async (req, res) => {
  const rows = await getTestimonials();
  if (!rows.length) return res.redirect(301, '/');
  serveSEOPage(req, res, path.join(__dirname, 'testimonials.html'), {
    title: 'Client Testimonials & Reviews — What Our Clients Say About Jomiez Innovation',
    description: 'Read real testimonials and reviews from our satisfied clients worldwide. Discover why businesses trust Jomiez Innovation for their software development, web design, mobile app, and AI solution needs. 5-star rated technology partner.',
    keywords: 'client testimonials, reviews, customer feedback, software development reviews, web development testimonials, app development reviews, satisfied clients, 5 star reviews, trusted developer, reliable software company, client experiences, business reviews'
  });
});


app.get('/contact-us', async (req, res) => {
  serveSEOPage(req, res, path.join(__dirname, 'contact-us.html'), {
    title: 'Contact Us — Start Your Project Today | Jomiez Innovation',
    description: "Get in touch with the Jomiez Innovation team. We build custom websites, mobile apps, AI solutions, and more. Let's talk.",
    keywords: 'contact Jomiez, hire developer, software development quote, start a project, get in touch, contact software agency'
  });
});

app.get('/contact', (req, res) => res.redirect(301, '/contact-us'));

app.get('/blog', async (req, res) => {
  serveSEOPage(req, res, path.join(__dirname, 'blog.html'), {
    title: 'Blog & Articles — Jomiez Innovation',
    description: 'Read the latest thoughts, tutorials, and case studies on software development, AI, and digital transformation by the Jomiez Innovation team.',
    keywords: 'blog, articles, software development blog, tech blog, Jomiez blog'
  });
});

app.get('/blog/:slug', async (req, res) => {
  const post = await new Promise((resolve) => {
    db.get('SELECT * FROM blog_posts WHERE slug = ?', [req.params.slug], (err, row) => resolve(row || null));
  });

  const title = post ? `${post.title} — Jomiez Innovation Blog` : 'Blog Post | Jomiez Innovation';
  const description = post ? (post.excerpt || post.content || '').substring(0, 160) : 'Read this article on the Jomiez Innovation blog.';

  serveSEOPage(req, res, path.join(__dirname, 'blog-detail.html'), {
    title,
    description,
    image: post ? post.thumbnail_url : '',
    keywords: `${post ? post.title : 'blog post'}, Jomiez Innovation, software development`
  });
});

// Retired Webflow template pages (/style-guide, /change-log, /license, /resume).
// They shipped with the purchased template and contained no Jomiez content.
// 301 to the closest real page so any indexed URLs don't 404.
['/style-guide', '/change-log', '/license'].forEach(p => app.get(p, (req, res) => res.redirect(301, '/')));
app.get('/resume', (req, res) => res.redirect(301, '/about'));

// These must be declared before the express.static below, which is mounted with
// { extensions: ['html'] } and would otherwise resolve /privacy-policy straight to
// privacy-policy.html — serving it raw, with no SEO tags and the template's
// placeholder footer still in place.
app.get('/privacy-policy', (req, res) => serveSEOPage(req, res, path.join(__dirname, 'privacy-policy.html'), {
  title: 'Privacy Policy | Jomiez Innovation',
  description: 'How Jomiez Innovation collects, uses, and protects your personal data.'
}));
['/terms-conditions', '/terms-condition'].forEach(p => app.get(p, (req, res) =>
  serveSEOPage(req, res, path.join(__dirname, 'terms-condition.html'), {
    title: 'Terms & Conditions | Jomiez Innovation',
    description: 'The terms that govern your use of the Jomiez Innovation website and services.'
  })));

app.get('/work/:slug', async (req, res) => {
  // Read from the cached snapshot rather than a fresh query per request.
  const cms = await getCmsData();
  const work = (cms.works || []).find(w => w.slug === req.params.slug) || null;
  if (!work) return res.redirect(302, '/works');

  const title = `${work.title} — Project Case Study | Jomiez Innovation`;
  const description = ((work.description || '').substring(0, 155) + ' — A project by Jomiez Innovation.').trim();

  serveSEOPage(req, res, path.join(__dirname, 'work-detail-page', 'work-detail-page.html'), {
    title,
    description,
    image: work.thumbnail_url || '',
    keywords: `${work.title}, ${work.category || 'project'}, case study, portfolio, Jomiez Innovation`,
    // Passing the record through renders the write-up into the HTML instead of
    // leaving it to client-side hydration.
    work
  });
});

app.get('/services/:slug', async (req, res) => {
  const service = await new Promise((resolve) => {
    db.get('SELECT * FROM services WHERE slug = ?', [req.params.slug], (err, row) => resolve(row || null));
  });

  const title = service ? `${service.title} — Professional ${service.title} Services | Jomiez Innovation` : 'Service Details | Jomiez Innovation';
  const description = service ? (service.description || '').substring(0, 160) + ' — Expert service by Jomiez Innovation.' : 'Professional software development service by Jomiez Innovation. Learn about our approach and get a free consultation.';

  serveSEOPage(req, res, path.join(__dirname, 'unique-offerring-pages', 'service-detail.html'), {
    title,
    description,
    image: service ? service.image_url : '',
    keywords: `${service ? service.title : 'service'}, Jomiez Innovation, professional services, software development services`
  });
});

app.get('/resume.html', (req, res) => res.redirect('/resume'));

// --- SEO & SEARCH ENGINE TOOLS (Must be BEFORE static middleware) ---

// Robots.txt — Optimized for maximum crawlability
app.get('/robots.txt', (req, res) => {
  const host = siteHost(req);
  res.type('text/plain');
  res.send(`# Jomiez Innovation — Robots.txt
# https://jomiez.com

User-agent: *
Allow: /
Disallow: /admin
Disallow: /admin/
Disallow: /api/
Disallow: /uploads/temp_*
Disallow: /node_modules/
Disallow: /scratch/
Disallow: /*.json$
Disallow: /database.sqlite

# Sitemaps
Sitemap: ${host}/sitemap.xml

# Crawl-delay for polite crawling
Crawl-delay: 1

# Google-specific
User-agent: Googlebot
Allow: /
Disallow: /admin
Disallow: /api/

# Bing-specific
User-agent: Bingbot
Allow: /
Disallow: /admin
Disallow: /api/

# AI Crawlers
User-agent: GPTBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: anthropic-ai
Allow: /
`);
});

// Dynamic Sitemap.xml — Full Coverage with lastmod, priority, images
app.get('/sitemap.xml', async (req, res) => {
  const host = siteHost(req);
  const today = new Date().toISOString().split('T')[0];
  
  const formatSitemapDate = (dateStr) => {
    if (!dateStr) return today;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return today;
    return d.toISOString().split('T')[0];
  };

  const staticPages = [
    { path: '', priority: '1.0', changefreq: 'daily', title: 'Home' },
    { path: '/about', priority: '0.9', changefreq: 'weekly', title: 'About' },
    { path: '/services', priority: '0.9', changefreq: 'weekly', title: 'Services' },
    { path: '/works', priority: '0.9', changefreq: 'weekly', title: 'Portfolio' },
    { path: '/contact-us', priority: '0.8', changefreq: 'monthly', title: 'Contact' },
    { path: '/blog', priority: '0.9', changefreq: 'weekly', title: 'Blog' },
    { path: '/privacy-policy', priority: '0.3', changefreq: 'yearly', title: 'Privacy Policy' },
    { path: '/terms-conditions', priority: '0.3', changefreq: 'yearly', title: 'Terms & Conditions' }
  ];

  // /testimonials only belongs in the sitemap when it actually has content —
  // otherwise the route 301s to / and we'd be advertising a redirect to Google.
  if ((await getTestimonials()).length) {
    staticPages.push({ path: '/testimonials', priority: '0.8', changefreq: 'weekly', title: 'Testimonials' });
  }

  const [services, works, blogPosts] = await Promise.all([
    new Promise((resolve) => db.all('SELECT slug, title, image_url FROM services', [], (err, rows) => resolve(rows || []))),
    new Promise((resolve) => db.all('SELECT slug, title, thumbnail_url, date FROM works', [], (err, rows) => resolve(rows || []))),
    new Promise((resolve) => db.all('SELECT slug, title, thumbnail_url, published_at FROM blog_posts', [], (err, rows) => resolve(rows || [])))
  ]);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
`;

  staticPages.forEach(p => {
    xml += `  <url>\n    <loc>${host}${p.path}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>\n`;
  });

  services.forEach(s => {
    xml += `  <url>\n    <loc>${host}/services/${s.slug}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>`;
    if (s.image_url) {
      xml += `\n    <image:image>\n      <image:loc>${s.image_url}</image:loc>\n      <image:title>${(s.title || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</image:title>\n      <image:caption>${(s.title || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')} service by Jomiez Innovation</image:caption>\n    </image:image>`;
    }
    xml += `\n  </url>\n`;
  });

  works.forEach(w => {
    const workDate = formatSitemapDate(w.date);
    xml += `  <url>\n    <loc>${host}/work/${w.slug}</loc>\n    <lastmod>${workDate}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>`;
    if (w.thumbnail_url) {
      xml += `\n    <image:image>\n      <image:loc>${w.thumbnail_url}</image:loc>\n      <image:title>${(w.title || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</image:title>\n      <image:caption>${(w.title || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')} project by Jomiez Innovation</image:caption>\n    </image:image>`;
    }
    xml += `\n  </url>\n`;
  });

  blogPosts.forEach(b => {
    const postDate = formatSitemapDate(b.published_at);
    xml += `  <url>\n    <loc>${host}/blog/${b.slug}</loc>\n    <lastmod>${postDate}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>`;
    if (b.thumbnail_url) {
      xml += `\n    <image:image>\n      <image:loc>${b.thumbnail_url}</image:loc>\n      <image:title>${(b.title || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</image:title>\n      <image:caption>${(b.title || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')} article by Jomiez Innovation</image:caption>\n    </image:image>`;
    }
    xml += `\n  </url>\n`;
  });

  xml += `</urlset>`;
  res.header('Content-Type', 'application/xml');
  res.header('Cache-Control', 'public, max-age=3600');
  res.send(xml);
});

// Static Files

app.use(express.static(path.join(__dirname, ''), { extensions: ['html'], maxAge: '1y' }));

// --- DATABASE TABLES INIT ---
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE, password TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS site_analytics (id SERIAL PRIMARY KEY, path TEXT, country TEXT, ip_address TEXT, user_agent TEXT, timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS client_leads (id SERIAL PRIMARY KEY, name TEXT, email TEXT, project_scope TEXT, budget TEXT, country TEXT, ip_address TEXT, timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS ai_memory (id SERIAL PRIMARY KEY, insight_type TEXT, key TEXT, value TEXT, timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS blog_posts (id SERIAL PRIMARY KEY, slug TEXT UNIQUE, title TEXT, content TEXT, excerpt TEXT, thumbnail_url TEXT, author TEXT, published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS works (id SERIAL PRIMARY KEY, slug TEXT UNIQUE, title TEXT, description TEXT, thumbnail_url TEXT, content TEXT, images TEXT, category TEXT, client TEXT, date TEXT, project_link TEXT DEFAULT '')`);
    db.run(`CREATE TABLE IF NOT EXISTS skills (id SERIAL PRIMARY KEY, name TEXT, description TEXT, icon TEXT DEFAULT 'star', sort_order INTEGER DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS services (id SERIAL PRIMARY KEY, slug TEXT UNIQUE, title TEXT, description TEXT, content TEXT, image_url TEXT, hover_image_url TEXT, sort_order INTEGER DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS brands (id SERIAL PRIMARY KEY, name TEXT, image_url TEXT, sort_order INTEGER DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS faqs (id SERIAL PRIMARY KEY, question TEXT, answer TEXT, sort_order INTEGER DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS marquee_images (id SERIAL PRIMARY KEY, image_url TEXT, sort_order INTEGER DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS testimonials (id SERIAL PRIMARY KEY, message TEXT, author_name TEXT, author_role TEXT, author_image TEXT, rating INTEGER DEFAULT 5, sort_order INTEGER DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS api_keys (id SERIAL PRIMARY KEY, provider TEXT NOT NULL, api_key TEXT UNIQUE NOT NULL, is_active TEXT DEFAULT '1', fail_count INTEGER DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS portfolio_users (id SERIAL PRIMARY KEY, username TEXT UNIQUE, password TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS counters (id SERIAL PRIMARY KEY, label TEXT, value TEXT, suffix TEXT, sort_order INTEGER DEFAULT 0)`);

    // Default User
    const hash = bcrypt.hashSync('chaka2025', 10);
    db.run(`INSERT OR IGNORE INTO portfolio_users (username, password) VALUES (?, ?)`, ['admin', hash]);

    // Default Settings — Jomiez Innovation Branding
    const defaults = [
        ['site_logo_text', 'Jomiez'],
        ['hero_eyebrow', 'Innovative Software Solutions for the Digital Age'],
        ['hero_headline', 'We Build Powerful Software, Websites & AI-Driven Solutions That Transform Businesses.'],
        ['hero_text', 'From custom web applications and mobile apps to AI integration and digital transformation — Jomiez Innovation delivers world-class technology solutions for startups, enterprises, and everything in between.'],
        ['company_name', 'Jomiez Innovation'],
        ['powered_by_name', 'Chaka'],
        ['powered_by_link', '#'],
        ['contact_email', 'hello@jomiez.com'],
        ['contact_phone', '+234 000 000 0000'],
        ['hero_active_text', 'Available for new projects'],
        ['hero_rating_text', 'Trusted by businesses globally'],
        ['hero_rating_score', '4.9'],
        ['hero_media_type', 'image'],
        ['hero_spline_url', ''],
        ['skills_heading', 'Our Professional Skills & Technical Expertise'],
        ['tools_heading', 'Technologies We Work With'],
        ['label_field_name', 'First Name *'],
        ['label_field_last_name', 'Last Name *'],
        ['label_field_email', 'Email Address *'],
        ['label_field_phone', 'Phone Number *'],
        ['label_field_message', 'Message *'],
        ['label_submit_button', 'Let\'s Connect'],
        ['seo_site_title', 'Jomiez Innovation — Software Development, Web & App Solutions'],
        ['seo_site_description', 'Jomiez Innovation is a world-class software development company. We build custom websites, mobile apps, AI-powered solutions, and enterprise software for businesses worldwide.'],
        ['seo_keywords', 'Jomiez, Jomiez Innovation, software development, web development, mobile app development, AI solutions, custom software, hire developer, build website, coding services, Templeton, Emmanuel Ezinna Nweke'],
        ['founder_name', 'Emmanuel Ezinna Nweke'],
        ['founder_alias', 'Templeton'],
        ['about_hero_heading', 'Building the Future of Software — One Innovation at a Time'],
        ['about_hero_subheading', 'We are Jomiez Innovation — a team of passionate software engineers, designers, and strategists committed to crafting exceptional digital experiences.'],
        ['cta_heading', 'Ready to Build Something Extraordinary? Let\'s Talk.'],
        ['footer_copyright', '© 2024 Jomiez Innovation. All Rights Reserved. Built with ❤️ by Jomiez.']
    ];
    defaults.forEach(([k, v]) => db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, [k, v]));
});

// REST OF THE FILE (Existing AI Tools etc.)
// Settings API
app.get('/api/settings', (req, res) => {
  db.all('SELECT key, value FROM settings', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    // The settings table holds operational secrets alongside page copy. Admins get
    // everything; the public site gets only what it renders.
    const visible = req.session.user ? rows : publicSettings(rows);
    const settings = {};
    visible.forEach(row => {
      settings[row.key] = row.value;
    });
    res.json(settings);
  });
});

app.post('/api/settings', (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'Key required' });
  db.run(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?`, [key, value, value], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, key, value });
  });
});

// AI API Keys Base Route
// Admin only (enforced by the /api gate above). Even here the full secret is not
// returned: the panel needs to identify and manage keys, not read them back, and
// a masked value cannot be harvested from a logged-in browser session or a
// screenshot. Editing a key means replacing it.
app.get('/api/apikeys', (req, res) => {
  db.all('SELECT id, provider, api_key, is_active FROM api_keys ORDER BY provider ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json((rows || []).map(r => {
      const k = String(r.api_key || '');
      return {
        id: r.id,
        provider: r.provider,
        is_active: r.is_active,
        key_masked: k.length > 10 ? `${k.slice(0, 6)}…${k.slice(-4)}` : '••••',
        key_length: k.length
      };
    }));
  });
});

// The voice widget talks to Gemini Live straight from the browser, so it needs a
// key client-side. That key is therefore public by definition — no endpoint design
// changes that; only proxying the socket through this server would.
//
// What this does fix is the blast radius. The widget used to pull the entire
// api_keys table, which exposed the DeepSeek and NVIDIA keys too — and those are
// only ever used server-side by the Python swarm, so they were leaking for nothing.
// This hands over exactly one active key for the provider the browser actually
// speaks to, and nothing else.
app.get('/api/chaka/voice-token', (req, res) => {
  const provider = req.query.provider === 'groq' ? 'groq' : 'gemini';
  // is_active is a TEXT column; comparing it to an integer errors on Postgres
  // ("operator does not exist: text = integer").
  db.all(
    "SELECT api_key FROM api_keys WHERE provider = ? AND (is_active IS NULL OR is_active IN ('1','true','t','yes')) ORDER BY id ASC",
    [provider],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'unavailable' });
      res.set('Cache-Control', 'no-store');
      res.json({ provider, keys: (rows || []).map(r => r.api_key).filter(Boolean) });
    }
  );
});

app.post('/api/apikeys', (req, res) => {
  const { provider, api_key } = req.body;
  if (!provider || !api_key) return res.status(400).json({ error: 'Provider and API key required' });
  db.run(`INSERT INTO api_keys (provider, api_key, is_active) VALUES (?, ?, '1')`, [provider, api_key], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    global.apiKeyManager && global.apiKeyManager.refreshCache();
    res.json({ id: this.lastID, success: true });
  });
});

app.delete('/api/apikeys/:id', (req, res) => {
  db.run('DELETE FROM api_keys WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    global.apiKeyManager.refreshCache();
    res.json({ success: true, deleted: this.changes });
  });
});

// -----------------------------------------------------------------
// AUTONOMOUS ENGINEERING AGENT (NEMOTRON)
// -----------------------------------------------------------------
const { exec: execCmd } = require('child_process');

app.post('/api/agent/undo', (req, res) => {
    execCmd('git reset --hard HEAD~1', (err, stdout, stderr) => {
        if (err) {
            console.error('[Agent Undo] Git error:', stderr);
            return res.status(500).json({ success: false, error: stderr });
        }
        res.json({ success: true, message: stdout });
    });
});

app.post('/api/agent/execute', async (req, res) => {
    const command = req.body.command;
    if (!command) return res.status(400).json({ success: false, error: "No command provided" });
    
    // 1. Commit current state for Undo
    execCmd('git add -A && git commit -m "Auto-backup before Nemotron execution"', (err) => {
        // We ignore error if there's nothing to commit
        
        // 2. Call the Python Agent Orchestrator on port 3001
        require('axios').post('http://localhost:3001/agent/execute', { command })
            .then(response => {
                res.json({ success: true, summary: response.data.summary });
            })
            .catch(error => {
                console.error('[Agent Execute] Python error:', error.message);
                res.status(500).json({ success: false, error: error.message });
            });
    });
});

// Blog API
app.get('/api/blog', (req, res) => {
  db.all('SELECT * FROM blog_posts ORDER BY published_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/blog/:slug', (req, res) => {
  db.get('SELECT * FROM blog_posts WHERE slug = ?', [req.params.slug], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Post not found' });
    res.json(row);
  });
});

app.post('/api/blog', (req, res) => {
  const { slug, title, content, excerpt, thumbnail_url, author } = req.body;
  db.run(`INSERT INTO blog_posts (slug, title, content, excerpt, thumbnail_url, author) VALUES (?, ?, ?, ?, ?, ?)`,
    [slug, title, content, excerpt || '', thumbnail_url || '', author || ''],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});

app.put('/api/blog/:id', (req, res) => {
  const { slug, title, content, excerpt, thumbnail_url, author } = req.body;
  db.run(`UPDATE blog_posts SET slug=?, title=?, content=?, excerpt=?, thumbnail_url=?, author=? WHERE id=?`,
    [slug, title, content, excerpt || '', thumbnail_url || '', author || '', req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, changes: this.changes });
    });
});

app.delete('/api/blog/:id', (req, res) => {
  db.run('DELETE FROM blog_posts WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, deleted: this.changes });
  });
});

// Works API
app.get('/api/works', (req, res) => {
  db.all('SELECT * FROM works ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const parsedRows = rows.map(r => ({
      ...r,
      images: r.images ? JSON.parse(r.images) : []
    }));
    res.json(parsedRows);
  });
});

app.get('/api/works/:id_or_slug', (req, res) => {
  const { id_or_slug } = req.params;
  db.get('SELECT * FROM works WHERE id = ? OR slug = ?', [id_or_slug, id_or_slug], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Work not found' });
    row.images = row.images ? JSON.parse(row.images) : [];
    res.json(row);
  });
});

app.post('/api/works', (req, res) => {
  const { slug, title, description, thumbnail_url, content, images, category, client, date, project_link } = req.body;
  const imagesJson = Array.isArray(images) ? JSON.stringify(images) : (images || '[]');
  db.run(`INSERT INTO works (slug, title, description, thumbnail_url, content, images, category, client, date, project_link) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [slug, title, description, thumbnail_url, content, imagesJson, category, client, date, project_link || ''],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});

app.put('/api/works/:id', (req, res) => {
  const { slug, title, description, thumbnail_url, content, images, category, client, date, project_link } = req.body;
  const imagesJson = Array.isArray(images) ? JSON.stringify(images) : (images || '[]');
  db.run(`UPDATE works SET slug = ?, title = ?, description = ?, thumbnail_url = ?, content = ?, images = ?, category = ?, client = ?, date = ?, project_link = ? WHERE id = ?`,
    [slug, title, description, thumbnail_url, content, imagesJson, category, client, date, project_link || '', req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, changes: this.changes });
    });
});

app.delete('/api/works/:id', (req, res) => {
  db.run('DELETE FROM works WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, deleted: this.changes });
  });
});

// Skills API
app.get('/api/skills', (req, res) => {
  db.all('SELECT * FROM skills ORDER BY sort_order ASC, id ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/skills', (req, res) => {
  const { name, description, icon, sort_order } = req.body;
  db.run(`INSERT INTO skills (name, description, icon, sort_order) VALUES (?, ?, ?, ?)`,
    [name, description || '', icon || 'star', sort_order || 0],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});

app.put('/api/skills/:id', (req, res) => {
  const { name, description, icon, sort_order } = req.body;
  db.run(`UPDATE skills SET name = ?, description = ?, icon = ?, sort_order = ? WHERE id = ?`,
    [name, description || '', icon || 'star', sort_order || 0, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, changes: this.changes });
    });
});

app.delete('/api/skills/:id', (req, res) => {
  db.run('DELETE FROM skills WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, deleted: this.changes });
  });
});

// Services API
app.get('/api/services', (req, res) => {
  db.all('SELECT * FROM services ORDER BY sort_order ASC, id ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/services', (req, res) => {
  const { slug, title, description, content, image_url, hover_image_url, sort_order } = req.body;
  db.run(`INSERT INTO services (slug, title, description, content, image_url, hover_image_url, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [slug, title, description || '', content || '', image_url || '', hover_image_url || '', sort_order || 0],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});

app.put('/api/services/:id', (req, res) => {
  const { slug, title, description, content, image_url, hover_image_url, sort_order } = req.body;
  db.run(`UPDATE services SET slug=?, title=?, description=?, content=?, image_url=?, hover_image_url=?, sort_order=? WHERE id=?`,
    [slug, title, description || '', content || '', image_url || '', hover_image_url || '', sort_order || 0, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, changes: this.changes });
    });
});

app.delete('/api/services/:id', (req, res) => {
  db.run('DELETE FROM services WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, deleted: this.changes });
  });
});

// API for Counters
app.get('/api/counters', (req, res) => {
  db.all('SELECT * FROM counters ORDER BY sort_order ASC, id ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/counters', (req, res) => {
  const { label, value, suffix, sort_order } = req.body;
  db.run(`INSERT INTO counters (label, value, suffix, sort_order) VALUES (?, ?, ?, ?)`,
    [label || '', value || '', suffix || '', sort_order || 0],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});

app.put('/api/counters/:id', (req, res) => {
  const { label, value, suffix, sort_order } = req.body;
  db.run(`UPDATE counters SET label=?, value=?, suffix=?, sort_order=? WHERE id=?`,
    [label || '', value || '', suffix || '', sort_order || 0, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, changes: this.changes });
    });
});

app.delete('/api/counters/:id', (req, res) => {
  db.run('DELETE FROM counters WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, deleted: this.changes });
  });
});

// API for Brands
app.get('/api/brands', (req, res) => {
  db.all('SELECT * FROM brands ORDER BY sort_order ASC, id ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/brands', (req, res) => {
  const { name, image_url, sort_order } = req.body;
  db.run(`INSERT INTO brands (name, image_url, sort_order) VALUES (?, ?, ?)`,
    [name || '', image_url || '', sort_order || 0],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});

app.put('/api/brands/:id', (req, res) => {
  const { name, image_url, sort_order } = req.body;
  db.run(`UPDATE brands SET name=?, image_url=?, sort_order=? WHERE id=?`,
    [name || '', image_url || '', sort_order || 0, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, changes: this.changes });
    });
});

app.delete('/api/brands/:id', (req, res) => {
  db.run('DELETE FROM brands WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, deleted: this.changes });
  });
});

// API for FAQs
app.get('/api/faqs', (req, res) => {
  db.all('SELECT * FROM faqs ORDER BY sort_order ASC, id ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/faqs', (req, res) => {
  const { question, answer, sort_order } = req.body;
  db.run(`INSERT INTO faqs (question, answer, sort_order) VALUES (?, ?, ?)`,
    [question || '', answer || '', sort_order || 0],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});

app.put('/api/faqs/:id', (req, res) => {
  const { question, answer, sort_order } = req.body;
  db.run(`UPDATE faqs SET question=?, answer=?, sort_order=? WHERE id=?`,
    [question || '', answer || '', sort_order || 0, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, changes: this.changes });
    });
});

app.delete('/api/faqs/:id', (req, res) => {
  db.run('DELETE FROM faqs WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, deleted: this.changes });
  });
});

// API for Marquee Images
app.get('/api/marquee', (req, res) => {
  db.all('SELECT * FROM marquee_images ORDER BY sort_order ASC, id ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/marquee', (req, res) => {
  const { image_url, sort_order } = req.body;
  db.run(`INSERT INTO marquee_images (image_url, sort_order) VALUES (?, ?)`,
    [image_url || '', sort_order || 0],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});

app.put('/api/marquee/:id', (req, res) => {
  const { image_url, sort_order } = req.body;
  db.run(`UPDATE marquee_images SET image_url=?, sort_order=? WHERE id=?`,
    [image_url || '', sort_order || 0, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, changes: this.changes });
    });
});

app.delete('/api/marquee/:id', (req, res) => {
  db.run('DELETE FROM marquee_images WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, deleted: this.changes });
  });
});

// API for Testimonials
app.get('/api/testimonials', (req, res) => {
  db.all('SELECT * FROM testimonials ORDER BY sort_order ASC, id ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/testimonials', (req, res) => {
  const { message, author_name, author_role, author_image, rating, sort_order } = req.body;
  db.run(`INSERT INTO testimonials (message, author_name, author_role, author_image, rating, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
    [message || '', author_name || '', author_role || '', author_image || '', rating || 5, sort_order || 0],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});

app.put('/api/testimonials/:id', (req, res) => {
  const { message, author_name, author_role, author_image, rating, sort_order } = req.body;
  db.run(`UPDATE testimonials SET message=?, author_name=?, author_role=?, author_image=?, rating=?, sort_order=? WHERE id=?`,
    [message || '', author_name || '', author_role || '', author_image || '', rating || 5, sort_order || 0, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, changes: this.changes });
    });
});

app.delete('/api/testimonials/:id', (req, res) => {
  db.run('DELETE FROM testimonials WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, deleted: this.changes });
  });
});

app.post('/api/upload', (req, res, next) => {
  console.log('[Upload] Starting upload request...');
  upload.single('file')(req, res, (err) => {
    if (err) {
      console.error('[Upload] Multer/Cloudinary Error:', err);
      return res.status(500).json({ error: 'Upload failed: ' + err.message });
    }
    if (!req.file) {
      console.warn('[Upload] No file received');
      return res.status(400).json({ error: 'No file uploaded' });
    }
    console.log('[Upload] Success! URL:', req.file.path);
    res.json({ url: req.file.path });
  });
});

// CLIENT LEADS & AI MEMORY API
// ── Inbox ─────────────────────────────────────────────────────────────────────
// Mail sent to hello@jomiez.com, readable inside the admin panel so there is no
// second webmail to keep open. Pulled over IMAP from the existing Hostinger
// mailbox rather than redirected, so no DNS changes and no risk to delivery.
// Pulls the IMAP credentials the panel saved into the inbox module.
async function loadInboxSettings() {
  const cms = await getCmsData();
  const s = cms.settings || {};
  configureInbox({
    imap_host: s.imap_host,
    imap_port: s.imap_port,
    imap_user: s.imap_user,
    imap_password: s.imap_password
  });
}

async function syncInbox() {
  await loadInboxSettings();
  const r = await fetchInbox(60);
  if (!r.ok) return r;

  let added = 0;
  for (const m of r.messages) {
    const exists = await new Promise((resolve) =>
      db.get('SELECT id FROM inbox_messages WHERE uid = ?', [m.uid], (e, row) => resolve(!!row)));
    if (exists) continue;

    // Same triage as leads: cold pitches sort away from real enquiries.
    const verdict = scoreLead({
      name: m.from_name, email: m.from_email, project_scope: `${m.subject}\n${m.body}`
    }).verdict;

    await new Promise((resolve) => db.run(
      `INSERT INTO inbox_messages (uid, subject, from_name, from_email, body, received_at, is_read, triage_verdict, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [m.uid, m.subject, m.from_name, m.from_email, m.body, m.received_at,
       m.seen ? '1' : '0', verdict, new Date().toISOString()], () => resolve()));
    added++;
  }
  return { ok: true, added, total: r.messages.length };
}

app.get('/api/inbox', async (req, res) => {
  try {
    await loadInboxSettings();
    if (req.query.sync === '1') await syncInbox();
    db.all('SELECT * FROM inbox_messages ORDER BY received_at DESC LIMIT 100', [], (e, rows) => {
      if (e) return res.status(500).json({ error: e.message });
      res.json({ configured: inboxConfigured(), missing: missingInboxConfig(), messages: rows || [] });
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Drives the red dot on the nav. Cheap enough to poll.
app.get('/api/inbox/unread-count', (req, res) => {
  db.get("SELECT COUNT(*)::int AS n FROM inbox_messages WHERE is_read = '0'", [], (e, row) => {
    if (e) return res.json({ unread: 0 });
    res.json({ unread: (row && row.n) || 0 });
  });
});

app.post('/api/inbox/:id/read', (req, res) => {
  db.run("UPDATE inbox_messages SET is_read = '1' WHERE id = ?", [req.params.id], (e) => {
    if (e) return res.status(500).json({ error: e.message });
    res.json({ ok: true });
  });
});

// ── Lead reply drafting ───────────────────────────────────────────────────────
// Three modes, stored in settings as lead_reply_mode:
//   manual — no drafting; you write it yourself in the panel
//   semi   — Chaka drafts, it waits in the queue for you to approve  (default)
//   auto   — Chaka drafts and sends without asking
//
// Default is semi deliberately. In auto, a model is writing to a stranger in your
// name about work you will be held to; there is no undo on a sent email. Auto also
// refuses anything triage does not rate genuine, because replying to a scraped
// address confirms it is live and multiplies the spam.
async function draftLeadReply(lead) {
  const cms = await getCmsData();
  const s = cms.settings || {};
  const triage = scoreLead(lead);

  const keys = await new Promise((resolve) => {
    db.all("SELECT api_key FROM api_keys WHERE provider = 'gemini' AND (is_active IS NULL OR is_active IN ('1','true','t','yes')) ORDER BY id ASC",
      [], (e, r) => resolve(e || !r ? [] : r.map(x => x.api_key)));
  });
  if (!keys.length) throw new Error('No active Gemini key configured.');

  const portfolio = (cms.works || []).slice(0, 9)
    .map(w => `- ${w.title}: ${(w.description || '').slice(0, 120)}`).join('\n');

  const prompt = `You are writing a reply on behalf of ${s.founder_name || 'Emmanuel Ezinna Nweke'} (Templeton), founder of Jomiez Innovation, a software studio.

A prospective client sent this enquiry:
  Name: ${lead.name || 'Unknown'}
  Email: ${lead.email || 'not given'}
  Budget mentioned: ${lead.budget || 'none'}
  Their message: "${lead.project_scope || ''}"

Relevant work you can reference (only these — do not invent projects):
${portfolio}

Write a short reply email. Rules, in order of importance:
1. NEVER quote a price, a rate, a timeline, or a delivery date. You do not know them. Say the team will confirm scope and cost after a short conversation.
2. Never invent a project, a client name, a credential, or a past result. Reference only the work listed above.
3. Reference ONE relevant project by name, in one clause, and only if it genuinely fits what they asked for.
4. Ask at most ONE clarifying question — the single most useful thing you do not know.
5. Invite them to continue on WhatsApp (${s.social_whatsapp || s.contact_whatsapp || 'WhatsApp'}), and say email is fine if they prefer.
6. Plain text. No markdown, no bold, no bullet points. Six sentences maximum.
7. Warm and direct. No "I hope this email finds you well". No hard selling.

Return strictly this JSON and nothing else:
{"subject": "...", "body": "..."}`;

  const { GoogleGenerativeAI } = require('@google/generative-ai');
  // gemini-2.0-flash is retired and 404s; the "-latest" aliases move with Google so
  // a future retirement can't silently break lead replies the way that one did.
  // Flash models also return 503 under load, which is transient — fall through the
  // list and across keys rather than dropping a real enquiry on the floor.
  const MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite'];
  const client = new GoogleGenerativeAI(keys[0]);
  let out = null, lastErr = null;
  for (const name of MODELS) {
    try {
      out = (await client.getGenerativeModel({ model: name }).generateContent(prompt)).response.text();
      break;
    } catch (err) {
      lastErr = err;
      const transient = /50\d|overload|high demand|quota|rate/i.test(err.message || '');
      console.warn(`[leads/draft] ${name} failed (${transient ? 'transient' : 'hard'}): ${err.message.slice(0, 90)}`);
      if (!transient && !/404|not available/i.test(err.message || '')) break;
    }
  }
  if (out === null) throw new Error(`All models failed. Last: ${lastErr && lastErr.message}`);

  let parsed;
  try {
    parsed = JSON.parse(out.replace(/^```(?:json)?|```$/gm, '').trim());
  } catch (e) {
    parsed = { subject: `Re: your enquiry`, body: out.trim() };
  }
  return { ...parsed, triage };
}

app.post('/api/leads/:id/draft', async (req, res) => {
  try {
    const lead = await new Promise((resolve) =>
      db.get('SELECT * FROM client_leads WHERE id = ?', [req.params.id], (e, r) => resolve(r || null)));
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const mode = (await getCmsData()).settings?.lead_reply_mode || 'semi';
    if (mode === 'manual') {
      return res.json({ mode, drafted: false, reason: 'Reply mode is manual — write it yourself below.' });
    }

    const draft = await draftLeadReply(lead);
    await new Promise((resolve, reject) =>
      db.run(`INSERT INTO lead_replies (lead_id, subject, body, status, mode, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [lead.id, draft.subject, draft.body, 'draft', mode, new Date().toISOString()],
        (e) => e ? reject(e) : resolve()));

    res.json({ mode, drafted: true, subject: draft.subject, body: draft.body, triage: draft.triage });
  } catch (e) {
    console.error('[leads/draft]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Sends a reply to a lead. Body may carry an edited subject/body — whatever the
// owner approved in the panel wins over whatever was drafted.
//
// Two rules that hold regardless of mode:
//   - never send to a lead triage does not rate genuine (a scraped address that
//     gets a reply is a confirmed-live address, and the spam multiplies)
//   - never send twice for the same draft
app.post('/api/leads/:id/send', async (req, res) => {
  try {
    const lead = await new Promise((resolve) =>
      db.get('SELECT * FROM client_leads WHERE id = ?', [req.params.id], (e, r) => resolve(r || null)));
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const triage = scoreLead(lead);
    const { subject, body, force, dryRun } = req.body || {};
    if (!subject || !body) return res.status(400).json({ error: 'Subject and body are required.' });

    if (!triage.safeToAutoReply && !force) {
      return res.status(409).json({
        error: 'Blocked by triage',
        triage,
        hint: 'This looks like cold outreach rather than a client. Send anyway with force: true if you disagree.'
      });
    }

    const result = await sendLeadReply({
      to: lead.email,
      subject,
      body,
      replyTo: process.env.LEAD_REPLY_TO,
      dryRun: !!dryRun
    });

    if (result.sent) {
      const mode = (await getCmsData()).settings?.lead_reply_mode || 'semi';
      const now = new Date().toISOString();
      await new Promise((resolve) => db.run(
        `INSERT INTO lead_replies (lead_id, subject, body, status, mode, created_at, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [lead.id, subject, body, 'sent', mode, now, now], () => resolve()));
    }
    res.json({ ...result, triage });
  } catch (e) {
    console.error('[leads/send]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Lets the panel show whether sending is even possible before offering the button.
app.get('/api/leads/mail-status', async (req, res) => {
  const cms = await getCmsData();
  res.json({
    configured: mailerConfigured(),
    missing: missingMailConfig(),
    mode: cms.settings?.lead_reply_mode || 'semi',
    from: process.env.LEAD_FROM_EMAIL || null,
    notifyTo: process.env.ADMIN_NOTIFY_EMAIL || null
  });
});

app.get('/api/leads/:id/replies', (req, res) => {
  db.all('SELECT * FROM lead_replies WHERE lead_id = ? ORDER BY id DESC', [req.params.id], (e, r) => {
    if (e) return res.status(500).json({ error: e.message });
    res.json(r || []);
  });
});

app.get('/api/leads', (req, res) => {
  // Order by id: created_at is TEXT and was null on older rows, so sorting by it
  // put undated leads in an arbitrary place.
  db.all('SELECT * FROM client_leads ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    // Attach triage so the panel can separate real enquiries from cold pitches,
    // and so nothing automated ever answers a scraped address.
    res.json((rows || []).map(r => ({ ...r, triage: scoreLead(r) })));
  });
});

app.delete('/api/leads/:id', (req, res) => {
  db.run('DELETE FROM client_leads WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, deleted: this.changes });
  });
});

app.get('/api/memory', (req, res) => {
  db.all('SELECT * FROM ai_memory ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.delete('/api/memory/:id', (req, res) => {
  db.run('DELETE FROM ai_memory WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, deleted: this.changes });
  });
});

// RESUME / CV API

app.post('/api/resume/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = req.file.path;
  
  // Save both the URL and a timestamp to settings
  db.run(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?`, 
    ['resume_url', url, url], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, url });
  });
});

// API for Admin Status (optional check)
app.get('/api/status', (req, res) => res.json({ status: 'running', database: 'sqlite' }));

// CHAKA BIDI TOOL EXECUTION ENDPOINT
// This endpoint dispatches BOTH visitor tools and admin write tools, so it cannot
// be public or private wholesale — it has to be gated per tool. Anything not named
// here needs an admin session; a new admin tool is therefore locked by default.
const VISITOR_TOOLS = new Set(['matchProjects', 'captureLead', 'saveUserInsight']);

app.post('/api/chaka/execute_tool', async (req, res) => {
  const { name, args } = req.body;

  if (!VISITOR_TOOLS.has(name) && !req.session.user) {
    console.warn(`[execute_tool] Blocked unauthenticated call to admin tool "${name}"`);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (name === 'updateSiteSetting') {
    const { key, value } = args;
    db.run(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?`, [key, value, value], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ executed: true, key, _action: "Site Content Updated Globally!" });
    });
  } else if (name === 'getSiteContext') {
    // Aggregated context for AI to "Read Before Write"
    db.all("SELECT key, value FROM settings", [], (err, settings) => {
      db.all("SELECT * FROM works ORDER BY id DESC", [], (err, works) => {
        db.all("SELECT * FROM services ORDER BY sort_order ASC", [], (err, services) => {
          res.json({ settings, works, services });
        });
      });
    });
  } else if (name === 'manageWorks') {
    const { action, id, data } = args;
    if (action === 'add') {
      const { title, description, client, category, thumbnail_url, date, project_link, content, images } = data || {};
      const slug = (title || 'untitled').toLowerCase().replace(/[^a-z0-9]/g, '-');
      // images should be a JSON array string like '["url1","url2","url3"]'
      const imagesStr = Array.isArray(images) ? JSON.stringify(images) : (images || '[]');
      db.run(`INSERT INTO works (title, description, client, category, thumbnail_url, date, project_link, slug, content, images) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
        [title || 'Untitled Project', description || '', client || '', category || 'Web Design', 
         thumbnail_url || '/uploads/default-work.jpg', 
         date || new Date().toISOString().split('T')[0], 
         project_link || '#', slug, content || '', imagesStr], 
        function(err) {
          if (err) return res.status(500).json({ error: err.message });
          const newId = this.lastID;
          // Sync to vector DB
          upsertDocument(newId, 'work', title || 'Untitled Project', `${description || ''}\n${content || ''}`, db).catch(e => console.warn('[VectorDB] Work upsert failed:', e.message));
          res.json({ executed: true, id: newId, _action: "Project successfully added to portfolio with all details." });
        });
    } else if (action === 'update' && id) {
      const updates = Object.entries(data).map(([k, v]) => `${k} = ?`).join(', ');
      const values = Object.entries(data).map(([k, v]) => {
        if (k === 'images' && Array.isArray(v)) return JSON.stringify(v);
        return v;
      });
      db.run(`UPDATE works SET ${updates} WHERE id = ?`, [...values, id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        // Re-sync updated work to vector DB
        db.get("SELECT title, description, content FROM works WHERE id = ?", [id], (e2, row) => {
          if (row) upsertDocument(id, 'work', row.title, `${row.description || ''}\n${row.content || ''}`, db).catch(e => console.warn('[VectorDB] Work update sync failed:', e.message));
        });
        res.json({ executed: true, _action: "Project details updated." });
      });
    } else if (action === 'delete' && id) {
      db.run(`DELETE FROM works WHERE id = ?`, [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        deleteDocument(id, 'work').catch(e => console.warn('[VectorDB] Work delete failed:', e.message));
        res.json({ executed: true, _action: "Project deleted." });
      });
    } else {
      res.json({ error: "Invalid action. Use 'add', 'update', or 'delete'." });
    }
  } else if (name === 'searchImages') {
    // Image search using SerpAPI
    const { query } = args;
    try {
      const serpKey = await new Promise((resolve) => {
        db.get("SELECT value FROM settings WHERE key = 'serp_api_key'", [], (err, row) => {
          resolve(row ? row.value : null);
        });
      });
      if (!serpKey) return res.json({ images: [], error: "No SERP API key configured. Add one in settings with key 'serp_api_key'." });
      
      const searchUrl = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(query)}&num=5&api_key=${serpKey}`;
      const serpRes = await fetch(searchUrl);
      const serpData = await serpRes.json();
      const imageResults = (serpData.images_results || []).slice(0, 5).map(img => ({
        url: img.original,
        thumbnail: img.thumbnail,
        title: img.title
      }));
      res.json({ images: imageResults });
    } catch(e) {
      res.json({ images: [], error: e.message });
    }
  } else if (name === 'manageServices') {
    const { action, id, data } = args;
    if (action === 'add') {
      const { title, description, content, image_url, hover_image_url } = data || {};
      const slug = (title || 'untitled').toLowerCase().replace(/[^a-z0-9]/g, '-');
      db.get("SELECT COUNT(*) as count FROM services", (err, row) => {
          const sortOrder = row ? row.count : 0;
          db.run(`INSERT INTO services (title, description, content, slug, image_url, hover_image_url, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`, 
            [title || 'Untitled Service', description || '', content || '', slug, image_url || '', hover_image_url || '', sortOrder], 
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                const newId = this.lastID;
                upsertDocument(newId, 'service', title || 'Untitled Service', `${description || ''}\n${content || ''}`, db).catch(e => console.warn('[VectorDB] Service upsert failed:', e.message));
                res.json({ executed: true, id: newId, _action: "Service added." });
            });
      });
    } else if (action === 'update' && id) {
      const updates = Object.entries(data).map(([k, v]) => `${k} = ?`).join(', ');
      const values = Object.entries(data).map(([k, v]) => v);
      db.run(`UPDATE services SET ${updates} WHERE id = ?`, [...values, id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        db.get("SELECT title, description, content FROM services WHERE id = ?", [id], (e2, row) => {
          if (row) upsertDocument(id, 'service', row.title, `${row.description || ''}\n${row.content || ''}`, db).catch(e => console.warn('[VectorDB] Service update sync failed:', e.message));
        });
        res.json({ executed: true, _action: "Service updated." });
      });
    } else if (action === 'delete' && id) {
      db.run(`DELETE FROM services WHERE id = ?`, [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        deleteDocument(id, 'service').catch(e => console.warn('[VectorDB] Service delete failed:', e.message));
        res.json({ executed: true, _action: "Service deleted." });
      });
    }
  } else if (name === 'manageFAQs') {
    const { action, id, data } = args;
    if (action === 'add') {
      db.run(`INSERT INTO faqs (question, answer) VALUES (?, ?)`, [data.question, data.answer], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ executed: true, id: this.lastID, _action: "FAQ added." });
      });
    } else if (action === 'delete' && id) {
      db.run(`DELETE FROM faqs WHERE id = ?`, [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ executed: true, _action: "FAQ removed." });
      });
    }
  } else if (name === 'matchProjects') {
    // Given a visitor's description of what they want built, return the projects
    // that are genuinely closest to it. Semantic search over the indexed portfolio
    // first; keyword overlap as a fallback when the vector index is cold.
    const brief = (args.brief || '').trim();
    if (!brief) return res.json({ executed: false, reason: 'No brief provided.' });

    try {
      const cms = await getCmsData();
      const works = cms.works || [];
      let matched = [];

      try {
        const hits = await searchVectorDB(brief, db, 6);
        // Walk the HITS in order and resolve each to a project. Filtering the works
        // table by the hit set instead returns them in table order, which put the
        // same project first for every brief regardless of relevance.
        const byTitle = new Map(works.map(w => [String(w.title).toLowerCase(), w]));
        for (const h of hits) {
          if (h.item?.metadata?.type !== 'work') continue;
          const w = byTitle.get(String(h.item.metadata.title || '').toLowerCase());
          if (w && !matched.find(m => m.id === w.id)) matched.push(w);
        }
      } catch (e) {
        console.warn('[matchProjects] vector search unavailable:', e.message);
      }

      if (matched.length < 2) {
        // Fallback: score on shared meaningful words between the brief and each
        // project's title/description/category.
        const stop = new Set(['the','and','for','with','that','this','have','need','want','build','make','like','some','from','into','your','our','are','was','app','site']);
        const terms = brief.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 3 && !stop.has(t));
        const scored = works.map(w => {
          const hay = `${w.title} ${w.description} ${w.category || ''}`.toLowerCase();
          return { w, score: terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0) };
        }).filter(s => s.score > 0).sort((a, b) => b.score - a.score);
        for (const s of scored) {
          if (matched.length >= 3) break;
          if (!matched.find(m => m.id === s.w.id)) matched.push(s.w);
        }
      }

      // Never come back empty-handed — a visitor who described a project and got
      // "nothing matches" is a lost lead. Fall back to the strongest work.
      if (!matched.length) matched = works.slice(0, 2);

      res.json({
        executed: true,
        brief,
        projects: matched.slice(0, 3).map(w => ({
          title: w.title,
          slug: w.slug,
          url: w.slug ? `/work/${w.slug}` : '/works',
          summary: (w.description || '').slice(0, 200)
        })),
        instruction: 'Name each project and say in one clause why it is relevant to what they described. Do not describe every project — two is usually enough. Then offer to open one, or to send the brief over on WhatsApp.'
      });
    } catch (e) {
      res.status(500).json({ executed: false, error: e.message });
    }
  } else if (name === 'captureLead') {
    const { name: cName, email, project_scope, budget } = args;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const country = await getCountryFromIP(ip);

    // Budgets were being stored as ",000 - ,000" — the currency symbol lost somewhere
    // upstream, which makes the number meaningless. Keep whatever was said verbatim.
    const cleanBudget = (budget && String(budget).trim()) || 'Unknown';
    db.run(`INSERT INTO client_leads (name, email, project_scope, budget, country, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [cName, email, project_scope, cleanBudget, country, ip, new Date().toISOString()], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ executed: true, _action: "Lead Securely Added to CRM Database!" });
    });
  } else if (name === 'saveUserInsight') {
    const { insight_type, key, value } = args;
    db.run(`INSERT INTO ai_memory (insight_type, key, value) VALUES (?, ?, ?)`, [insight_type || 'fact', key, value], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ executed: true, _action: `Information securely stored: ${key}` });
    });
  } else {
    res.status(400).json({ error: "Unknown Tool" });
  }
});

// CHAKA EDGE TTS — Ultra-realistic voice synthesis
app.post('/api/chaka/tts', async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'No text provided' });

  try {
    const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
    const tts = new MsEdgeTTS();
    await tts.setMetadata('en-US-AvaMultilingualNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const result = tts.toStream(text.trim());
    const chunks = [];

    result.audioStream.on('data', (chunk) => {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      }
    });

    result.audioStream.on('close', () => {
      if (chunks.length === 0) {
        return res.status(500).json({ error: 'No audio generated' });
      }
      const audioBuffer = Buffer.concat(chunks);
      const base64Audio = audioBuffer.toString('base64');
      console.log(`[Chaka TTS] Synthesized ${text.substring(0, 50)}... (${audioBuffer.length} bytes)`);
      res.json({ audio: base64Audio, format: 'mp3' });
    });

    result.audioStream.on('error', (err) => {
      console.error('[Chaka TTS] Stream error:', err);
      res.status(500).json({ error: err.message });
    });
  } catch (e) {
    console.error('[Chaka TTS] Error:', e);
    res.status(500).json({ error: e.message });
  }
});

// CHAKA KNOWLEDGE BASE & CONTEXT (RAG-enhanced)

// SITE MANIFEST — The AI's complete understanding of the site structure
/**
 * Tour stops that actually have something to show. A stop for a section that was
 * removed from the page is how the tour ended up walking visitors into an empty
 * testimonials slot.
 */
function buildTourStops(cms = {}) {
  const { testimonials = [], works = [], services = [], counters = [] } = cms;
  const stops = ['hero', 'about'];
  if (counters.length) stops.push('stats');
  if (services.length) stops.push('services');
  if (works.length) stops.push('works');
  if (testimonials.length) stops.push('testimonials');
  stops.push('contact');
  return stops;
}

/**
 * Describes the site as it is RIGHT NOW, derived from live CMS state.
 *
 * This used to be a hardcoded string. It still advertised /testimonials, /resume
 * and /blog long after those were retired, so Chaka would confidently offer to
 * show a visitor "what our clients say" and walk them into a redirect. Anything
 * added or removed in /admin now flows through here on the next cache cycle
 * without a code change.
 *
 * The absent list matters as much as the present one: an LLM that is not told a
 * thing is gone will happily invent a reason to visit it.
 */
function buildSiteManifest(cms = {}) {
  const { testimonials = [], works = [], services = [], blog = [] } = cms;

  const routes = [
    ['/', 'Home page (hero, featured projects, services, FAQ)'],
    ['/about', 'About the studio and its founder'],
    ['/works', 'Portfolio / projects listing'],
    ['/services', 'All services listing'],
    ['/contact-us', 'Contact page with enquiry form'],
    ['/privacy-policy', 'Privacy policy'],
    ['/terms-conditions', 'Terms and conditions']
  ];
  const absent = [];

  if (testimonials.length) routes.push(['/testimonials', `Client testimonials (${testimonials.length} published)`]);
  else absent.push('/testimonials — there are NO published testimonials. The page does not exist and redirects to the home page. Never offer to show testimonials, client reviews, or "what clients say".');

  if (blog.length) routes.push(['/blog', `Blog listing (${blog.length} posts)`]);
  else absent.push('/blog — no published posts. Do not offer the blog.');

  absent.push('/resume — retired, redirects to /about. Never link to it.');

  if (works.length) routes.push(['/work/:slug', `Project detail. Live slugs: ${works.map(w => w.slug).filter(Boolean).join(', ')}`]);
  if (services.length) routes.push(['/services/:slug', `Service detail. Live slugs: ${services.map(s => s.slug).filter(Boolean).join(', ')}`]);

  return `SITE MAP (live — use ONLY these exact paths for navigation):
${routes.map(([p, d]) => `  ${p} = ${d}`).join('\n')}

NOT AVAILABLE — never mention, link to, or offer to show these:
${absent.map(a => `  ${a}`).join('\n')}

GUIDED TOUR STOPS (in order, and ONLY these):
  ${buildTourStops(cms).join(' -> ')}

WARNING: NEVER use .html extensions in URLs. /work.html does NOT exist. Use /works instead.
WARNING: The works/portfolio page is /works (plural), NOT /work.

DATABASE TABLES (you can read/write these via tools):
  - settings: key-value pairs for all site content (hero text, contact info, SEO, etc.)
  - works: portfolio projects (id, slug, title, description, content, images, category, client, date)
  - services: professional services (id, slug, title, description, content, image_url)
  - faqs: frequently asked questions (id, question, answer)
  - testimonials: client testimonials (id, message, author_name, author_role)
  - skills: technical skills (id, name, description, icon)
  - brands: client/partner logos (id, name, image_url)
  - blog_posts: blog articles (id, slug, title, content, excerpt, thumbnail_url)
  - counters: stat counters (id, label, value, suffix)
  - client_leads: CRM leads (id, name, email, project_scope, budget)

API ENDPOINTS:
  GET /api/settings, /api/works, /api/services, /api/skills, /api/brands, /api/faqs, /api/testimonials, /api/counters, /api/blog
  POST /api/chaka/execute_tool — execute admin tools (manageWorks, manageServices, updateSiteSetting, etc.)`;
}

async function getSiteKnowledge(query) {
  // Built from the shared CMS snapshot, so what Chaka knows and what the page
  // renders come from one source and cannot drift apart.
  const cms = await getCmsData();
  const sets = cms.settings || {};
  const founder = sets.founder_name || 'Emmanuel Ezinna Nweke';

  let baseCtx = 'SITE KNOWLEDGE (live — reflects the site exactly as it is now):\n';
  baseCtx += `- Company: ${sets.company_name || 'Jomiez Innovation'}. Founded and led by ${founder}, known as Templeton.\n`;
  baseCtx += `- Contact: email ${sets.contact_email || 'N/A'}, phone ${sets.contact_phone || 'N/A'}, WhatsApp ${sets.social_whatsapp || sets.contact_whatsapp || 'N/A'}.\n`;
  baseCtx += buildSiteManifest(cms) + '\n';

  if (cms.services?.length) {
    baseCtx += `- Services (${cms.services.length}): ${cms.services.map(s => s.title).join(', ')}.\n`;
  }
  if (cms.works?.length) {
    baseCtx += `- Portfolio (${cms.works.length}): ${cms.works.map(w => w.slug ? `[${w.title}](/work/${w.slug})` : w.title).join(', ')}.\n`;
  }
  if (cms.faqs?.length) {
    baseCtx += `- FAQs answered on the site: ${cms.faqs.map(f => f.question).join(' | ')}\n`;
  }
  baseCtx += `- Testimonials currently published: ${cms.testimonials?.length || 0}.\n`;

  // 2. If we have a query, use RAG to find the most relevant documents
  if (query && query.trim()) {
    try {
      const results = await searchVectorDB(query, db, 3);
      if (results.length > 0) {
        let ragCtx = "\nRELEVANT DETAILS (retrieved by semantic search for this query):\n";
        for (const r of results) {
          const meta = r.item.metadata;
          ragCtx += `--- [${meta.type.toUpperCase()}] ${meta.title} ---\n${meta.content}\n\n`;
        }
        return baseCtx + ragCtx;
      }
    } catch (e) {
      console.warn('[RAG] Vector search failed, falling back to base context:', e.message);
    }
  }

  return baseCtx;
}

app.get('/api/chaka/knowledge', async (req, res) => {
  try {
    const knowledge = await getSiteKnowledge();
    res.send(knowledge);
  } catch (e) {
    res.status(500).send('');
  }
});

// Machine-readable view of the same live state, for the widget itself. The guided
// tour used to walk a hardcoded list of stops that included sections no longer on
// the page; it now takes its route from here, so removing something in /admin
// removes it from the tour on the next cache cycle.
app.get('/api/chaka/site-state', async (req, res) => {
  try {
    const cms = await getCmsData();
    res.json({
      tourStops: buildTourStops(cms),
      counts: {
        works: cms.works?.length || 0,
        services: cms.services?.length || 0,
        testimonials: cms.testimonials?.length || 0,
        faqs: cms.faqs?.length || 0,
        blog: cms.blog?.length || 0
      },
      workSlugs: (cms.works || []).map(w => w.slug).filter(Boolean),
      serviceSlugs: (cms.services || []).map(s => s.slug).filter(Boolean),
      // The stats stop used to narrate hardcoded figures. Sourcing them from the
      // counters table means editing a counter in /admin changes what Chaka says.
      stats: (cms.counters || []).map(c => `${c.value}${c.suffix || ''} ${c.label}`)
    });
  } catch (e) {
    res.status(500).json({ tourStops: ['hero', 'about', 'services', 'works', 'contact'], counts: {} });
  }
});

// CHAKA TEXT CHAT — Gemini 2.5 Flash REST (completely separate from voice)
app.post('/api/chaka/chat_text', async (req, res) => {
  const { text, history, currentUrl } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'No text provided' });
  const isAdmin = !!req.session.user;

  try {
    // Inject site knowledge context for non-admin interactions
    let fullContextText = text.trim();
    if (!isAdmin) {
      const knowledge = await getSiteKnowledge();
      fullContextText = `Current URL: ${currentUrl || '/'}\nSite Knowledge Base:\n${knowledge}\n\nUser Message: ${text.trim()}`;
    }

    const swarmRes = await fetch('http://127.0.0.1:3001/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: fullContextText, is_admin: isAdmin, history: history || "[]" })
    });

    if (!swarmRes.ok) throw new Error("Swarm API Error: " + await swarmRes.text());
    const swarmData = await swarmRes.json();
    
    let responseText = swarmData.response || "";
    let toolCalls = null;
    if (swarmData.tools && swarmData.tools.length > 0) {
      toolCalls = swarmData.tools;
      if (!responseText.trim()) {
        const primaryTool = toolCalls[0].name;
        if (primaryTool === 'navigate_to') responseText = "Navigating you there right now.";
        else if (primaryTool === 'scroll_to') responseText = "Scrolling there now.";
        else responseText = "On it!";
      }
    }

    console.log(`[Chaka Swarm] User: "${text}" | AI: "${responseText.substring(0, 80)}" | Tools: ${toolCalls ? toolCalls.length : 0}`);
    res.json({ text: responseText, toolCalls });

  } catch (e) {
    // The swarm is a separate Python process. If it is down, mid-restart, or
    // throwing, chat used to return a 500 and the widget simply stopped replying —
    // one fragile dependency taking the whole conversation with it. Answer directly
    // from Node instead. Tool-calling is lost in this path, but a visitor getting a
    // useful answer beats a visitor getting silence.
    console.warn('[Chaka Swarm] Unavailable, answering directly:', e.message);
    try {
      const answer = await answerWithoutSwarm(text.trim(), currentUrl, history);
      return res.json({ text: answer, toolCalls: null, degraded: true });
    } catch (fallbackErr) {
      console.error('[Chaka] Direct fallback also failed:', fallbackErr.message);
      return res.status(500).json({ error: 'Chat is temporarily unavailable.' });
    }
  }
});

// Straight Gemini call with the same site knowledge the swarm would have used.
async function answerWithoutSwarm(text, currentUrl, history) {
  const keys = await new Promise((resolve) => {
    db.all("SELECT api_key FROM api_keys WHERE provider = 'gemini' AND (is_active IS NULL OR is_active IN ('1','true','t','yes')) ORDER BY id ASC",
      [], (e, r) => resolve(e || !r ? [] : r.map(x => x.api_key)));
  });
  if (!keys.length) throw new Error('No Gemini key configured.');

  const knowledge = await getSiteKnowledge();
  let priorTurns = '';
  try {
    const parsed = typeof history === 'string' ? JSON.parse(history || '[]') : (history || []);
    priorTurns = parsed.slice(-8)
      .map(m => `${m.role === 'user' ? 'Visitor' : 'You'}: ${String(m.content || '').slice(0, 300)}`)
      .join('\n');
  } catch (e) { /* history is optional */ }

  const prompt = `You are Chaka, the AI assistant for Jomiez Innovation. Answer the visitor using only the facts below — never invent a project, a price, or a timeline.

${knowledge}

Current page: ${currentUrl || '/'}
${priorTurns ? `\nConversation so far:\n${priorTurns}\n` : ''}
Visitor: ${text}

Reply in two or three sentences, warm and direct. Plain text, no markdown. If they want to talk to a human, point them at WhatsApp or email.`;

  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const client = new GoogleGenerativeAI(keys[0]);
  for (const name of ['gemini-3.5-flash-lite', 'gemini-flash-latest', 'gemini-2.5-flash']) {
    try {
      return (await client.getGenerativeModel({ model: name }).generateContent(prompt)).response.text().trim();
    } catch (err) {
      console.warn(`[Chaka fallback] ${name}: ${err.message.slice(0, 80)}`);
    }
  }
  throw new Error('All fallback models failed.');
}

// CHAKA GROQ AUDIO STREAM ENGINE — with rate limiting
const groqRateLimiter = new Map(); // IP -> { count, resetTime }
const GROQ_MAX_RPM = 6; // max 6 requests per minute
const GROQ_WINDOW_MS = 60000;

app.post('/api/chaka/chat_audio', tempUpload.single('audio'), async (req, res) => {
  if (!req.file && !req.body.textOnly) return res.status(400).json({ error: 'No audio or text provided' });

  // Rate limit check
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  let limiter = groqRateLimiter.get(clientIP);
  if (!limiter || now > limiter.resetTime) {
    limiter = { count: 0, resetTime: now + GROQ_WINDOW_MS };
    groqRateLimiter.set(clientIP, limiter);
  }
  limiter.count++;
  if (limiter.count > GROQ_MAX_RPM) {
    console.warn(`[Chaka] Rate limit hit for ${clientIP}: ${limiter.count} requests in window`);
    if (req.file) fs.unlink(req.file.path, () => { });
    return res.status(429).json({ error: 'Too many requests. Please slow down.', skipped: true });
  }

  try {
    // 1. Get Groq API Key
    const keys = await new Promise((resolve, reject) => {
      db.all("SELECT api_key FROM api_keys WHERE provider = 'groq' AND is_active = '1'", [], (err, rows) => {
        if (err) reject(err); else resolve(rows);
      });
    });
    if (keys.length === 0) return res.status(400).json({ error: 'No active Groq API Key found' });
    const groqKey = keys[0].api_key;

    let userText = req.body.textOnly || "";

    // 2. Transcribe Audio (Groq Whisper) if file provided
    if (req.file) {
      const fileData = fs.readFileSync(req.file.path);
      const audioBlob = new Blob([fileData], { type: 'audio/webm' });

      const formData = new FormData();
      formData.append('file', audioBlob, 'voice.webm');
      formData.append('model', 'whisper-large-v3');

      const whisperRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqKey}` },
        body: formData
      });

      if (!whisperRes.ok) throw new Error('Whisper Error: ' + await whisperRes.text());
      const whisperData = await whisperRes.json();
      userText = whisperData.text;

      // GUARD: If Whisper returned empty/noise transcription, bail out early
      if (!userText || userText.trim().length < 2) {
        console.log('[Chaka Groq] Empty/noise transcription, skipping.');
        if (req.file) fs.unlink(req.file.path, () => { });
        return res.json({ skipped: true });
      }
    }

    // 3. Process LLM Reply (Groq Llama 3 with Gemini Fallback)
    let memory = [];
    try { if (req.body.history) memory = JSON.parse(req.body.history); } catch (e) { }
    
    // CRITICAL: Groq has a strict 6000 Tokens Per Minute limit. 
    // We MUST truncate the conversation history to the last 4 turns.
    const recentMemory = memory.slice(-4);

    const siteKnowledge = await getSiteKnowledge(userText || '');

    const systemPrompt = `You are Chaka, the Elite Autonomous Admin of this portfolio system.
YOUR CURRENT MODE: ${req.body.isAdmin ? 'ADMIN GOD MODE' : 'PUBLIC VISITOR GUIDE'}
CURRENT PAGE URL: ${req.body.currentUrl || 'Unknown'}
PERSONALITY: Elite, confident, proactive, and highly intelligent. Keep voice responses VERY concise (1-3 sentences max).

${siteKnowledge}

MANAGEMENT PROTOCOLS:
1. DATA HYDRATION (CRITICAL): All content is database-driven. NEVER try to edit HTML files or generate CSS. Use the provided tools (manageWorks, manageServices, updateSiteSetting) to modify content.
2. CATEGORY PROTOCOL: 
   - SERVICES: Professional capabilities found in the 'services' table. Use manageServices.
   - WORKS: Specific projects/portfolio items found in the 'works' table. Use manageWorks.
   - NEVER add a Service into the Works table or vice versa.
3. QUALITY CONTROL: 
   - When adding a project, always use searchImages to find professional UI/Tech imagery.
   - Project content must be RICH HTML, not just a few words.
   - Ensure descriptions are professional and concise.
4. NAVIGATION: Only call navigate_to if explicitly requested or to show a change you just made.`;

    // 3. Process LLM Reply (Agent Swarm via Python)
    let aiResponseText = "";
    let toolCallPayload = null;

    try {
      const swarmRes = await fetch('http://127.0.0.1:3001/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText })
      });

      if (!swarmRes.ok) throw new Error("Swarm API Error: " + await swarmRes.text());
      const swarmData = await swarmRes.json();
      
      aiResponseText = swarmData.response || "";
      if (swarmData.tools && swarmData.tools.length > 0) {
        toolCallPayload = swarmData.tools;
      }
    } catch (err) {
      console.error('[Chaka Swarm] Error communicating with Python Agent Swarm:', err);
      aiResponseText = "Captain here. I am having trouble connecting to the Agent Swarm. Please ensure the Python backend is running on port 3001.";
    }

    if (toolCallPayload && toolCallPayload.length > 0) {
      if (!aiResponseText.trim()) {
        const primaryTool = toolCallPayload[0].name;
        if (primaryTool === 'navigate_to') aiResponseText = "Navigating you there right now.";
        else if (primaryTool === 'showContactMethod') aiResponseText = "Right away! Launching that contact option directly for you now.";
        else aiResponseText = "Getting that for you now.";
      }
    } else if (aiResponseText.includes('{"url"')) {
      // Bulletproof Fallback: LLama3 hallucinated JSON inline instead of using native function!
      try {
        const match = aiResponseText.match(/\{.*?\}/);
        if (match) {
          const args = JSON.parse(match[0]);
          if (args.url) {
            toolCallPayload = [{ id: 'tc_fallback', name: 'navigate_to', args: args }];
            aiResponseText = aiResponseText.replace(match[0], '').trim() || "Navigating you there right now.";
          }
        }
      } catch (e) { }
    } else if (aiResponseText.includes('{"section_concept"')) {
      try {
        const match = aiResponseText.match(/\{.*?\}/);
        if (match) {
          const args = JSON.parse(match[0]);
          if (args.section_concept) {
            toolCallPayload = [{ id: 'tc_fallback_s', name: 'scroll_to', args: args }];
            aiResponseText = aiResponseText.replace(match[0], '').trim() || "Scrolling down.";
          }
        }
      } catch (e) { }
    }

    console.log(`[Chaka Groq] User: "${userText}" | AI: "${aiResponseText}" | Tools: ${toolCallPayload ? toolCallPayload.length : 0}`);

    // 4. Synthesize Edge TTS
    const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
    const tts = new MsEdgeTTS();
    await tts.setMetadata('en-US-AvaMultilingualNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const result = tts.toStream(aiResponseText.trim());
    const chunks = [];

    result.audioStream.on('data', (chunk) => {
      if (Buffer.isBuffer(chunk)) chunks.push(chunk);
    });

    result.audioStream.on('close', () => {
      const audioBuffer = Buffer.concat(chunks);
      res.json({ audio: audioBuffer.toString('base64'), text: aiResponseText, userText: userText, toolCalls: toolCallPayload });

      // Cleanup audio file
      if (req.file) fs.unlink(req.file.path, () => { });
    });

    result.audioStream.on('error', (err) => {
      throw err;
    });

  } catch (e) {
    console.error('[Chaka Groq] Pipeline Error:', e);
    res.status(500).json({ error: e.message });
    if (req.file) fs.unlink(req.file.path, () => { });
  }
});

// Comprehensive Clean URL Routing
app.use((req, res) => {
  // If it's an API route or already has an extension, let static middleware handle or 404
  if (req.path.startsWith('/api/') || path.extname(req.path)) {
    return res.status(404).sendFile(path.join(__dirname, '404.html'));
  }

  // Strip trailing slash (except root)
  let p = req.path.replace(/\/+$/, '') || '/';

  // ===== EXACT ROUTE MAP =====
  const routeMap = {
    '/': '/home.html',
    '/home': '/home.html',
    '/home-pages/home-one': '/home.html',
    '/home-pages/home-two': '/home.html',
    '/admin': '/admin/admin.html',
    '/about-us': '/about.html',
    '/contact-us': '/contact-us.html',
    '/services': '/service.html',
    '/work': '/work.html',
    '/testimonial': '/testimonial.html',
    '/testimonials': '/testimonial.html',
    '/404': '/404.html',



    // Utility / Footer Pages
    // /license, /style-guide and /change-log were retired Webflow template pages;
    // they 301 to / from a route registered above this fallback.
    '/utility/privacy-policy': '/privacy-policy.html',
    '/utility/terms-conditions': '/terms-condition.html',
    '/privacy-policy': '/privacy-policy.html',
    '/terms-condition': '/terms-condition.html',
    '/terms-conditions': '/terms-condition.html',
  };

  // Check exact match first. Go through serveSEOPage rather than sendFile so these
  // pages get the same <head> tags and rendered footer as everything else —
  // previously they shipped raw, still carrying the template's placeholder footer.
  if (routeMap[p]) {
    const legalTitles = {
      '/privacy-policy': ['Privacy Policy | Jomiez Innovation', 'How Jomiez Innovation collects, uses, and protects your personal data.'],
      '/terms-condition': ['Terms & Conditions | Jomiez Innovation', 'The terms that govern your use of the Jomiez Innovation website and services.'],
      '/terms-conditions': ['Terms & Conditions | Jomiez Innovation', 'The terms that govern your use of the Jomiez Innovation website and services.']
    };
    const [title, description] = legalTitles[p] || [];
    return serveSEOPage(req, res, path.join(__dirname, routeMap[p]), title ? { title, description } : {});
  }

  // Work detail pages: /work/<slug>
  if (p.startsWith('/work/')) {
    return res.sendFile(path.join(__dirname, 'work-detail-page', 'work-detail-page.html'));
  }

  // Service detail pages: /services/<slug>
  if (p.startsWith('/services/')) {
    const slug = p.replace(/\/+$/, '').split('/').pop();
    const specificPath = path.join(__dirname, 'unique-offerring-pages', `${slug}.html`);
    if (fs.existsSync(specificPath)) {
      return res.sendFile(specificPath);
    }
    // Fallback for dynamically added services in DB
    return res.sendFile(path.join(__dirname, 'unique-offerring-pages', 'service-detail.html'));
  }

  // Fallback: try matching a .html file directly
  const htmlPath = path.join(__dirname, p.endsWith('.html') ? p : p + '.html');
  if (fs.existsSync(htmlPath)) {
    res.sendFile(htmlPath);
  } else {
    res.status(404).sendFile(path.join(__dirname, '404.html'));
  }
});

// --- Analytics API ---
app.get('/api/analytics', (req, res) => {
  db.all(`SELECT country, COUNT(*) as count FROM site_analytics GROUP BY country ORDER BY count DESC LIMIT 10`, [], (err, countries) => {
    if (err) return res.status(500).json({ error: err.message });
    
    db.all(`SELECT path, COUNT(*) as count FROM site_analytics GROUP BY path ORDER BY count DESC LIMIT 10`, [], (err, paths) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.all(`SELECT * FROM site_analytics ORDER BY created_at DESC LIMIT 20`, [], (err, hits) => {
            if (err) return res.status(500).json({ error: err.message });
            
            res.json({
                topCountries: countries,
                topPages: paths,
                recentHits: hits
            });
        });
    });
  });
});

// --- SEO ROUTES MOVED BEFORE STATIC MIDDLEWARE (see above) ---

const axios = require('axios');

// --- ⚡️ ROBUST KEEP-ALIVE SYSTEM ---

// 1. Health Check & Ping Endpoint
app.get('/ping', (req, res) => {
    console.log(`[KEEP-ALIVE] Ping received at ${new Date().toISOString()}`);
    res.status(200).send('PONG');
});

// 2. Local Database Keep-Alive
setInterval(async () => {
    try {
        db.run('SELECT 1', [], () => {});
    } catch (e) {
        console.warn('[KEEP-ALIVE] SQLite ping failed:', e.message);
    }
}, 45 * 1000); // Every 45 seconds

// 3. Self-Ping Loop (Prevents Render from sleeping)
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

setInterval(async () => {
    try {
        await axios.get(`${RENDER_URL}/ping`, { timeout: 10000 });
        console.log(`[KEEP-ALIVE] Self-ping successful: ${RENDER_URL}`);
    } catch (err) {
        console.warn(`[KEEP-ALIVE] Self-ping failed (${RENDER_URL}):`, err.message);
    }
}, 10 * 60 * 1000); // Every 10 minutes

// Final Start
const server = app.listen(PORT, () => {
    console.log(`\n🚀 Server is running on port ${PORT}`);
    console.log(`🔗 External URL: ${RENDER_URL}\n`);
    // Sync vector DB on startup (non-blocking)
    syncDatabaseToVectorDB(db).then(() => console.log('[VectorDB] Initial sync complete.')).catch(e => console.warn('[VectorDB] Initial sync failed:', e.message));
});

const wss = new WebSocketServer({ server, path: '/api/chaka/stream' });
initChakaStream(wss, sessionParser);
