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
console.log('Connected to the local SQLite database.');
global.apiKeyManager = new ApiKeyManager(db);
global.apiKeyManager.refreshCache(); // Initial load

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'chaka-secret-key-2025',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Auth Middleware
function isAuthenticated(req, res, next) {
    if (req.session.user) return next();
    // Whitelist public Chaka AI endpoints
    const publicPaths = ['/api/chaka/chat_text', '/api/chaka/execute_tool', '/api/chaka/knowledge', '/api/chaka/stream'];
    if (publicPaths.some(p => req.path.startsWith(p))) return next();
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
    res.redirect('/admin/login');
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
    db.run(`INSERT INTO client_leads (name, email, project_scope, country, ip_address) VALUES (?, ?, ?, ?, ?)`,
        [name || 'Anonymous', email, message || subject || 'Direct Contact Form', country, ip],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: 'Message sent successfully!' });
        }
    );
});

// Global API Protection for mutations
app.use('/api', (req, res, next) => {
    if (req.method === 'GET' || ['/login', '/check-auth', '/logout', '/contact', '/chaka/chat_text'].includes(req.path)) return next();
    if (req.session.user) return next();
    res.status(401).json({ error: 'Unauthorized' });
});

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

function injectSEOMeta(html, meta, settings = {}, faqs = []) {
  const host = meta.host || '';
  const canonical = `<link rel="canonical" href="${host}${meta.path || '/'}" />`;
  const robotsMeta = `<meta name="robots" content="${meta.robots || 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'}" />`;
  const keywords = `<meta name="keywords" content="${meta.keywords || 'software development, web development, app development, Jomiez, Jomiez Innovation, coding, programming, hire developer, build website, AI solutions, custom software, mobile app, SaaS, startup, MVP, digital transformation, IT consulting, UI UX design, full stack developer, React, Node.js, Python, cloud computing, DevOps, API development, e-commerce, business solutions, tech company, freelance developer, Templeton, Ezinna Emmanuel Nweke'}" />`;
  const authorMeta = `<meta name="author" content="Jomiez Innovation" />`;
  const geoMeta = `<meta name="geo.region" content="NG" />\n    <meta name="geo.placename" content="Nigeria" />`;
  const langAlts = `<link rel="alternate" hreflang="en" href="${host}${meta.path || '/'}" />\n    <link rel="alternate" hreflang="x-default" href="${host}${meta.path || '/'}" />`;
  const themeColor = `<meta name="theme-color" content="#0a0a0a" />`;
  const preconnect = `<link rel="preconnect" href="https://fonts.googleapis.com" />\n    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />`;

  // Build full SEO head injection
  const seoBlock = `
    <!-- SEO Meta Tags — Jomiez Innovation -->
    <title>${meta.title}</title>
    <meta name="description" content="${meta.description}" />
    ${keywords}
    ${authorMeta}
    ${robotsMeta}
    ${canonical}
    ${geoMeta}
    ${langAlts}
    ${themeColor}
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${host}${meta.path || '/'}" />
    <meta property="og:title" content="${meta.title}" />
    <meta property="og:description" content="${meta.description}" />
    <meta property="og:image" content="${meta.image || host + '/uploads/og-image.jpg'}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:alt" content="${meta.title}" />
    <meta property="og:site_name" content="Jomiez Innovation" />
    <meta property="og:locale" content="en_US" />
    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${host}${meta.path || '/'}" />
    <meta name="twitter:title" content="${meta.title}" />
    <meta name="twitter:description" content="${meta.description}" />
    <meta name="twitter:image" content="${meta.image || host + '/uploads/og-image.jpg'}" />
    <meta name="twitter:image:alt" content="${meta.title}" />
    <meta name="twitter:creator" content="@jomiez" />`;

  // Replace the existing head content
  let result = html;

  // Replace title
  result = result.replace(/<title>[^<]*<\/title>/, `<title>${meta.title}</title>`);

  // Replace or add meta description
  if (result.includes('name="description"')) {
    result = result.replace(/<meta[^>]*name="description"[^>]*>/, `<meta name="description" content="${meta.description}" />`);
  }

  // Replace OG tags
  result = result.replace(/<meta[^>]*property="og:title"[^>]*>/, `<meta property="og:title" content="${meta.title}" />`);
  result = result.replace(/<meta[^>]*property="og:description"[^>]*>/, `<meta property="og:description" content="${meta.description}" />`);
  result = result.replace(/<meta[^>]*property="twitter:title"[^>]*>/, `<meta property="twitter:title" content="${meta.title}" />`);
  result = result.replace(/<meta[^>]*property="twitter:description"[^>]*>/, `<meta property="twitter:description" content="${meta.description}" />`);

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

  const additionalMetaFull = `${resourceHints}
    ${canonical}
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

  // --- AEO/GEO Server-Side Rendering (SSR) ---
  if (settings.hero_text) {
    result = result.replace(
      /(<p[^>]*class="[^"]*home-hero-text[^"]*"[^>]*>)[\s\S]*?(<\/p>)/,
      `$1<span class="skeleton" style="color:transparent;">${settings.hero_text}</span>$2`
    );
  }
  
  if (settings.about_hero_subheading) {
    result = result.replace(
      /(<div[^>]*class="[^"]*about-hero-subheading[^"]*"[^>]*>)[\s\S]*?(<\/div>)/,
      `$1<span class="skeleton" style="color:transparent;">${settings.about_hero_subheading}</span>$2`
    );
  }

  if (faqs && faqs.length > 0) {
    let qIndex = 0;
    result = result.replace(/<h5 class="faq-question-text">([\s\S]*?)<\/h5>/g, (match, inner) => {
      if (qIndex < faqs.length) {
        const text = faqs[qIndex].question;
        qIndex++;
        return `<h5 class="faq-question-text"><span class="skeleton" style="color:transparent;">${text}</span></h5>`;
      }
      return match;
    });

    let aIndex = 0;
    result = result.replace(/<p class="faq-answer-text">([\s\S]*?)<\/p>/g, (match, inner) => {
      if (aIndex < faqs.length) {
        const text = faqs[aIndex].answer;
        aIndex++;
        return `<p class="faq-answer-text"><span class="skeleton" style="color:transparent;">${text}</span></p>`;
      }
      return match;
    });
  }

  const orgSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Jomiez Innovation",
    "url": host,
    "logo": host + "/uploads/og-image.jpg",
    "description": settings.seo_site_description || meta.description,
    "contactPoint": {
      "@type": "ContactPoint",
      "contactType": "customer service",
      "email": settings.contact_email || "hi@jomiez.com",
      "availableLanguage": "en"
    }
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(f => ({
      "@type": "Question",
      "name": f.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": f.answer
      }
    }))
  };

  const schemas = `<script type="application/ld+json">${JSON.stringify(orgSchema)}</script>` + 
                  (faqs.length > 0 ? `\n    <script type="application/ld+json">${JSON.stringify(faqSchema)}</script>` : '');

  const additionalMetaFullWithSchema = additionalMetaFull.replace(
    '<script src="/js/seo-schema.js" defer></script>',
    `${schemas}\n    <script src="/js/seo-schema.js" defer></script>`
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

async function serveSEOPage(req, res, filePath, metaOverrides = {}) {
  const settings = await getSettings();
  const faqs = await getFaqs();
  const host = `${req.protocol}://${req.get('host')}`;

  const meta = {
    host,
    path: req.path,
    title: metaOverrides.title || 'Jomiez Innovation — Software Development, Web & App Solutions',
    description: metaOverrides.description || 'Jomiez Innovation is a leading software development company. We build custom websites, mobile apps, AI-powered solutions, and enterprise software for businesses worldwide. Hire expert developers today.',
    image: metaOverrides.image || settings.hero_image_url || '',
    keywords: metaOverrides.keywords || '',
    ...metaOverrides
  };

  fs.readFile(filePath, 'utf8', (err, html) => {
    if (err) return res.status(500).send('Error loading page');
    const injected = injectSEOMeta(html, meta, settings, faqs);
    res.send(injected);
  });
}

// --- PUBLIC ROUTES (SEO-Optimized) ---
app.get('/', async (req, res) => {
  serveSEOPage(req, res, path.join(__dirname, 'home.html'), {
    title: 'Jomiez Innovation — Top Software Development & Web Solutions Company | Build Websites, Apps & AI Systems',
    description: 'Jomiez Innovation is a world-class software development company specializing in custom websites, mobile apps, AI integration, SaaS platforms, and digital transformation. Hire expert full-stack developers for your next project. Led by Templeton (Ezinna Emmanuel Nweke).',
    keywords: 'Jomiez, Jomiez Innovation, software development company, web development, mobile app development, AI development, custom software, hire developer, build website, build app, coding services, programming, full stack developer, React developer, Node.js, Python developer, SaaS development, MVP development, startup solutions, digital transformation, IT consulting, UI UX design, e-commerce development, API development, cloud computing, DevOps, business solutions, tech company, web design, app design, freelance developer, software engineer, Templeton, Ezinna Emmanuel Nweke, best software company, top web developer, hire programmer, build my website, build my app, website builder, app builder, custom web application, enterprise software, fintech development, healthcare software, education technology, affordable web development, professional website design, responsive web design, SEO services, digital marketing, online business solutions, technology partner, innovation, software house, coding agency, development agency, offshore development, nearshore development, remote developer'
  });
});

app.get('/about', async (req, res) => {
  serveSEOPage(req, res, path.join(__dirname, 'about.html'), {
    title: 'About Jomiez Innovation — Our Story, Mission & Expert Team | Software Development Leaders',
    description: 'Learn about Jomiez Innovation, a leading software development company founded by Ezinna Emmanuel Nweke (Templeton). We specialize in building custom software, websites, mobile apps, and AI solutions for businesses worldwide. Discover our mission, values, and the expertise behind our innovative solutions.',
    keywords: 'about Jomiez, Jomiez Innovation team, Templeton developer, Ezinna Emmanuel Nweke, software company about, web development team, app development company, our story, company mission, tech company values, experienced developers, professional software engineers, innovation leaders, technology experts'
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

app.get('/testimonials', async (req, res) => {
  serveSEOPage(req, res, path.join(__dirname, 'testimonials.html'), {
    title: 'Client Testimonials & Reviews — What Our Clients Say About Jomiez Innovation',
    description: 'Read real testimonials and reviews from our satisfied clients worldwide. Discover why businesses trust Jomiez Innovation for their software development, web design, mobile app, and AI solution needs. 5-star rated technology partner.',
    keywords: 'client testimonials, reviews, customer feedback, software development reviews, web development testimonials, app development reviews, satisfied clients, 5 star reviews, trusted developer, reliable software company, client experiences, business reviews'
  });
});

app.get('/resume', (req, res) => res.sendFile(path.join(__dirname, 'unique-offerring-pages', 'resume.html')));

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

app.get('/style-guide', async (req, res) => {
  serveSEOPage(req, res, path.join(__dirname, 'style-guide.html'), { title: 'Style Guide — Jomiez Innovation', description: 'Internal style guide.', robots: 'noindex, nofollow' });
});
app.get('/change-log', async (req, res) => {
  serveSEOPage(req, res, path.join(__dirname, 'change-log.html'), { title: 'Change Log — Jomiez Innovation', description: 'Website change log.', robots: 'noindex, nofollow' });
});
app.get('/license', async (req, res) => {
  serveSEOPage(req, res, path.join(__dirname, 'license.html'), { title: 'License — Jomiez Innovation', description: 'Licensing information.', robots: 'noindex, nofollow' });
});

app.get('/work/:slug', async (req, res) => {
  // Try to get the actual work details for dynamic meta
  const work = await new Promise((resolve) => {
    db.get('SELECT * FROM works WHERE slug = ?', [req.params.slug], (err, row) => resolve(row || null));
  });

  const title = work ? `${work.title} — Project Case Study | Jomiez Innovation` : 'Project Details — Portfolio | Jomiez Innovation';
  const description = work ? (work.description || '').substring(0, 160) + ' — A project by Jomiez Innovation.' : 'Detailed case study of a project by Jomiez Innovation. See our approach, technologies used, and results delivered.';

  serveSEOPage(req, res, path.join(__dirname, 'work-detail-page', 'work-detail-page.html'), {
    title,
    description,
    image: work ? work.thumbnail_url : '',
    keywords: `${work ? work.title : 'project'}, case study, portfolio, Jomiez Innovation, software development, web development`
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
  const host = `${req.protocol}://${req.get('host')}`;
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
  const host = `${req.protocol}://${req.get('host')}`;
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
    { path: '/testimonials', priority: '0.8', changefreq: 'weekly', title: 'Testimonials' },
    { path: '/resume', priority: '0.7', changefreq: 'monthly', title: 'Resume' },
    { path: '/contact-us', priority: '0.8', changefreq: 'monthly', title: 'Contact' },
    { path: '/blog', priority: '0.9', changefreq: 'weekly', title: 'Blog' },
    { path: '/privacy-policy', priority: '0.3', changefreq: 'yearly', title: 'Privacy Policy' },
    { path: '/license', priority: '0.2', changefreq: 'yearly', title: 'License' },
    { path: '/change-log', priority: '0.3', changefreq: 'monthly', title: 'Change Log' }
  ];

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
        ['seo_keywords', 'Jomiez, Jomiez Innovation, software development, web development, mobile app development, AI solutions, custom software, hire developer, build website, coding services, Templeton, Ezinna Emmanuel Nweke'],
        ['founder_name', 'Ezinna Emmanuel Nweke'],
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
    const settings = {};
    rows.forEach(row => {
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
app.get('/api/apikeys', (req, res) => {
  db.all('SELECT id, provider, api_key, is_active FROM api_keys ORDER BY provider ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
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
app.get('/api/leads', (req, res) => {
  db.all('SELECT * FROM client_leads ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
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
app.post('/api/chaka/execute_tool', async (req, res) => {
  const { name, args } = req.body;

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
  } else if (name === 'captureLead') {
    const { name: cName, email, project_scope, budget } = args;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const country = await getCountryFromIP(ip);

    db.run(`INSERT INTO client_leads (name, email, project_scope, budget, country, ip_address) VALUES (?, ?, ?, ?, ?, ?)`, [cName, email, project_scope, budget || 'Unknown', country, ip], function (err) {
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
function getSiteManifest() {
  return `SITE MAP (CRITICAL — use ONLY these exact paths for navigation):
  / = Home page (hero, featured works, services overview)
  /about = About Me / About Us page
  /works = Portfolio / Projects listing page
  /services = All services listing page
  /contact-us = Contact page with form
  /resume = Resume / CV page
  /testimonials = Client testimonials
  /blog = Blog listing
  /work/:slug = Individual project detail (e.g. /work/e-commerce-website-design)
  /services/:slug = Individual service detail (e.g. /services/branding)

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
  // 1. Always include base site settings (small, constant cost)
  const baseCtx = await new Promise((resolve) => {
    db.all("SELECT key, value FROM settings", [], (err, settingsRows) => {
      let ctx = "SITE KNOWLEDGE:\n";
      if (settingsRows) {
        const sets = settingsRows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
        ctx += `- Company: "${sets.company_name || sets.hero_headline || ''}". About: "${sets.about_hero_heading || ''}". Email: ${sets.contact_email || 'N/A'}. Phone: ${sets.contact_phone || 'N/A'}. WhatsApp: ${sets.social_whatsapp || sets.contact_whatsapp || 'N/A'}.\n`;
      }
      ctx += getSiteManifest() + '\n';
      // Always include service & work titles (lightweight summary)
      db.all("SELECT title FROM services", [], (err2, svcRows) => {
        if (svcRows && svcRows.length) ctx += `- Services: ${svcRows.map(s => s.title).join(', ')}.\n`;
        db.all("SELECT title, slug FROM works", [], (err3, wrkRows) => {
          if (wrkRows && wrkRows.length) {
             const links = wrkRows.map(w => w.slug ? `[${w.title}](/work/${w.slug})` : w.title);
             ctx += `- Portfolio: ${links.join(', ')}.\n`;
          }
          resolve(ctx);
        });
      });
    });
  });

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
    console.error('[Chaka Swarm] Error communicating with Python Agent Swarm:', e);
    res.status(500).json({ error: e.message });
  }
});

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
    '/utility/license': '/licence.html',
    '/utility/style-guide': '/style-guide.html',
    '/utility/change-log': '/change-log.html',
    '/utility/privacy-policy': '/privacy-policy.html',
    '/utility/terms-conditions': '/terms-condition.html',
    '/license': '/licence.html',
    '/licence': '/licence.html',
    '/style-guide': '/style-guide.html',
    '/privacy-policy': '/privacy-policy.html',
    '/terms-condition': '/terms-condition.html',
    '/terms-conditions': '/terms-condition.html',
  };

  // Check exact match first
  if (routeMap[p]) {
    return res.sendFile(path.join(__dirname, routeMap[p]));
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
initChakaStream(wss);
