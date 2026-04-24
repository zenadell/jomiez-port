require('dotenv').config();
const express = require('express');
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

const db = tursoAdapter;

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
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp', 'gif', 'svg', 'pdf', 'doc', 'docx'],
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
console.log('Connected to the Turso database.');
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
    if (req.method === 'GET' || ['/login', '/check-auth', '/logout', '/contact'].includes(req.path)) return next();
    if (req.session.user) return next();
    res.status(401).json({ error: 'Unauthorized' });
});

// --- PUBLIC ROUTES ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'home.html')));
app.get('/resume', (req, res) => res.sendFile(path.join(__dirname, 'unique-offerring-pages', 'resume.html')));
app.get('/works', (req, res) => res.sendFile(path.join(__dirname, 'works.html')));
app.get('/services', (req, res) => res.sendFile(path.join(__dirname, 'services.html')));
app.get('/work/:slug', (req, res) => res.sendFile(path.join(__dirname, 'work-detail-page', 'work-detail-page.html')));
app.get('/services/:slug', (req, res) => res.sendFile(path.join(__dirname, 'unique-offerring-pages', 'service-detail.html')));
app.get('/resume.html', (req, res) => res.redirect('/resume'));

// Static Files

app.use(express.static(path.join(__dirname, ''), { extensions: ['html'] }));

// --- DATABASE TABLES INIT ---
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS site_analytics (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT, country TEXT, ip_address TEXT, user_agent TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS client_leads (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT, project_scope TEXT, budget TEXT, country TEXT, ip_address TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS ai_memory (id INTEGER PRIMARY KEY AUTOINCREMENT, insight_type TEXT, key TEXT, value TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS works (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT, description TEXT, thumbnail_url TEXT, content TEXT, images TEXT, category TEXT, client TEXT, date TEXT, project_link TEXT DEFAULT '')`);
    db.run(`CREATE TABLE IF NOT EXISTS skills (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, description TEXT, icon TEXT DEFAULT 'star', sort_order INTEGER DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS services (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT, description TEXT, content TEXT, image_url TEXT, hover_image_url TEXT, sort_order INTEGER DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS brands (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, image_url TEXT, sort_order INTEGER DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS faqs (id INTEGER PRIMARY KEY AUTOINCREMENT, question TEXT, answer TEXT, sort_order INTEGER DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS marquee_images (id INTEGER PRIMARY KEY AUTOINCREMENT, image_url TEXT, sort_order INTEGER DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS testimonials (id INTEGER PRIMARY KEY AUTOINCREMENT, message TEXT, author_name TEXT, author_role TEXT, author_image TEXT, rating INTEGER DEFAULT 5, sort_order INTEGER DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS api_keys (id INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT NOT NULL, api_key TEXT UNIQUE NOT NULL, is_active INTEGER DEFAULT 1, fail_count INTEGER DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS portfolio_users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT)`);

    // Default User
    const hash = bcrypt.hashSync('chaka2025', 10);
    db.run(`INSERT OR IGNORE INTO portfolio_users (username, password) VALUES (?, ?)`, ['admin', hash]);

    // Default Settings
    const defaults = [
        ['site_logo_text', 'ResumX'],
        ['hero_eyebrow', 'Architecting the Future of Digital Intelligence'],
        ['hero_headline', 'Creative Solutions That Drive Real Results With AI Integration.'],
        ['hero_text', 'Seamlessly blending advanced System Integration with robust Software and Website Development.'],
        ['company_name', 'ResumX'],
        ['powered_by_name', 'Chaka'],
        ['powered_by_link', '#'],
        ['contact_email', 'hello@example.com'],
        ['contact_phone', '+1 (234) 567-890'],
        ['hero_active_text', 'Available for new projects'],
        ['hero_rating_text', 'Loved by founders globally'],
        ['hero_rating_score', '4.9'],
        ['skills_heading', 'Your Guide to Professional Skills and Experience'],
        ['tools_heading', 'Key Work Tools'],
        ['label_field_name', 'First Name *'],
        ['label_field_last_name', 'Last Name *'],
        ['label_field_email', 'Email Address *'],
        ['label_field_phone', 'Phone Number *'],
        ['label_field_message', 'Message *'],
        ['label_submit_button', 'Let’s Connect']
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
  db.run(`INSERT INTO api_keys (provider, api_key) VALUES (?, ?)`, [provider, api_key], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    global.apiKeyManager.refreshCache();
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

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  res.json({ url: req.file.path });
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
          res.json({ executed: true, id: this.lastID, _action: "Project successfully added to portfolio with all details." });
        });
    } else if (action === 'update' && id) {
      const updates = Object.entries(data).map(([k, v]) => `${k} = ?`).join(', ');
      const values = Object.entries(data).map(([k, v]) => {
        if (k === 'images' && Array.isArray(v)) return JSON.stringify(v);
        return v;
      });
      db.run(`UPDATE works SET ${updates} WHERE id = ?`, [...values, id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ executed: true, _action: "Project details updated." });
      });
    } else if (action === 'delete' && id) {
      db.run(`DELETE FROM works WHERE id = ?`, [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
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
                res.json({ executed: true, id: this.lastID, _action: "Service added." });
            });
      });
    } else if (action === 'update' && id) {
      const updates = Object.entries(data).map(([k, v]) => `${k} = ?`).join(', ');
      const values = Object.entries(data).map(([k, v]) => v);
      db.run(`UPDATE services SET ${updates} WHERE id = ?`, [...values, id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ executed: true, _action: "Service updated." });
      });
    } else if (action === 'delete' && id) {
      db.run(`DELETE FROM services WHERE id = ?`, [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
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

// CHAKA KNOWLEDGE BASE & CONTEXT
async function getSiteKnowledge() {
  return new Promise((resolve) => {
    db.all("SELECT key, value FROM settings", [], (err, settingsRows) => {
      db.all("SELECT title, description FROM services", [], (err2, servicesRows) => {
        db.all("SELECT title, description FROM works", [], (err3, worksRows) => {
          let ctx = "SITE KNOWLEDGE (Use this to answer questions about the company):\n";
          if (settingsRows) {
            const sets = settingsRows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
            ctx += `- Company Info: We are represented by "${sets.hero_headline || ''}". About us: "${sets.about_hero_heading || ''}". Contact email: ${sets.contact_email || 'N/A'}.\n`;
          }
          if (servicesRows && servicesRows.length) {
            ctx += `- Services offered: ${servicesRows.map(s => s.title + ' (' + s.description + ')').join(' | ')}.\n`;
          }
          if (worksRows && worksRows.length) {
            ctx += `- Portfolio works: ${worksRows.map(w => w.title + (w.description ? ' - ' + w.description.substring(0, 100) + '...' : '')).join(' | ')}.\n`;
          }
          resolve(ctx);
        });
      });
    });
  });
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
  const { text, history, isAdmin } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'No text provided' });

  try {
    const keys = await new Promise((resolve, reject) => {
      db.all("SELECT api_key FROM api_keys WHERE provider = 'gemini' AND is_active = 1", [], (err, rows) => {
        if (err) reject(err); else resolve(rows);
      });
    });
    if (keys.length === 0) return res.status(400).json({ error: 'No active Gemini API Key found' });

    const { GoogleGenerativeAI } = require('@google/generative-ai');

    const mode = isAdmin ? 'ADMIN GOD MODE' : 'PUBLIC VISITOR GUIDE';

    const toolDeclarations = [
      {
        name: "getSiteContext",
        description: "Returns all current site settings, projects, and services. Call this FIRST if you need to see current content before improving it.",
        parameters: { type: "OBJECT", properties: {} }
      },
      {
        name: "navigate_to",
        description: "Navigate the user's browser to a page on the portfolio. Supported paths: /, /about.html, /work.html, /service.html, /contact-us.html",
        parameters: { type: "OBJECT", properties: { url: { type: "STRING" } }, required: ["url"] }
      },
      {
        name: "scroll_to",
        description: "Scroll the user's viewport to a section on the current page.",
        parameters: { type: "OBJECT", properties: { section_concept: { type: "STRING", description: "e.g. 'footer', 'hero', 'testimonials', 'contact'" } }, required: ["section_concept"] }
      },
      {
        name: "updateSiteSetting",
        description: "Updates a global site setting. VALID KEYS: hero_headline (Main H1), hero_eyebrow (small text above H1), hero_text (intro description), hero_image, about_hero_heading, about_me_page_text, contact_email, contact_phone, site_logo_text, footer_cta, company_name.",
        parameters: { type: "OBJECT", properties: { key: { type: "STRING" }, value: { type: "STRING" } }, required: ["key", "value"] }
      },
      {
        name: "manageWorks",
        description: "Add, update or delete portfolio PROJECTS (Case Studies). DO NOT use this for Services. DATA HYDRATION: All content is database-driven. NEVER try to edit HTML files or generate CSS. Use the provided tools (manageWorks, manageServices, updateSiteSetting) to modify content. CATEGORY PROTOCOL: SERVICES = Professional capabilities; WORKS = Specific portfolio items. NEVER add a Service into the Works table or vice versa. QUALITY CONTROL: When adding a project, use searchImages for professional UI/Tech imagery. Project content must be RICH HTML (h2, h3, p, ul/li tags covering Overview, Challenge, Solution, Key Features).",
        parameters: { 
          type: "OBJECT", 
          properties: { 
            action: { type: "STRING", enum: ["add", "update", "delete"] }, 
            id: { type: "NUMBER", description: "Required for update and delete" },
            data: { 
              type: "OBJECT", 
              properties: { 
                title: { type: "STRING", description: "Project title" }, 
                description: { type: "STRING", description: "Short summary shown on cards (1-2 sentences)" }, 
                client: { type: "STRING", description: "Client or company name" }, 
                category: { type: "STRING", description: "e.g. Web Design, Branding, AI, Development" }, 
                thumbnail_url: { type: "STRING", description: "URL for the hero/thumbnail image. MUST be a high-resolution LANDSCAPE image." }, 
                date: { type: "STRING", description: "Project date YYYY-MM-DD" }, 
                project_link: { type: "STRING", description: "Live project URL" },
                images: { type: "ARRAY", items: { type: "STRING" }, description: "Exactly 3 gallery image URLs for the case study detail page" },
                content: { type: "STRING", description: "Rich HTML case study. Must include <h2>Title</h2>, <h3>Challenge</h3>, <h3>Solution</h3>, <h3>Key Features</h3> sections with <p> and <ul><li> tags" }
              } 
            } 
          }, 
          required: ["action"] 
        }
      },
      {
        name: "searchImages",
        description: "Search the web for relevant images using SerpAPI. Returns up to 5 image URLs. Use this to find thumbnail and gallery images when adding a new project.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: { type: "STRING", description: "Search query for images, e.g. 'modern AI dashboard UI design landscape 4k'" }
          },
          required: ["query"]
        }
      },
      {
        name: "manageServices",
        description: "Add, update or delete site SERVICES (capabilities). DO NOT use this for Projects. When adding a service, find relevant image URLs via searchImages.",
        parameters: {
          type: "OBJECT",
          properties: {
            action: { type: "STRING", enum: ["add", "update", "delete"] },
            id: { type: "NUMBER" },
            data: {
              type: "OBJECT",
              properties: {
                title: { type: "STRING" },
                description: { type: "STRING" },
                image_url: { type: "STRING", description: "Main card image" },
                hover_image_url: { type: "STRING", description: "Secondary/Detail image" },
                content: { type: "STRING", description: "HTML content for the detail page" }
              }
            }
          },
          required: ["action"]
        }
      },
      {
        name: "captureLead",
        description: "Save a potential client inquiry to the CRM database.",
        parameters: { type: "OBJECT", properties: { name: { type: "STRING" }, email: { type: "STRING" }, project_scope: { type: "STRING" }, budget: { type: "STRING" } }, required: ["name", "email", "project_scope"] }
      },
      {
        name: "showContactMethod",
        description: "Shows a beautiful UI contact card inside the chat for WhatsApp, Email, or Phone Call. Use this when the user asks for a phone number, email address, or whatsapp contact.",
        parameters: { type: "OBJECT", properties: { method: { type: "STRING", enum: ["whatsapp", "email", "phone"] } }, required: ["method"] }
      }
    ];

    const siteKnowledge = await getSiteKnowledge();

    const systemPrompt = `You are Chaka, the Elite Autonomous Admin of this portfolio system.
YOUR CURRENT MODE: ${mode}
CURRENT PAGE URL: ${req.body.currentUrl || 'Unknown'}
PERSONALITY: Elite, confident, proactive, and highly intelligent.

${siteKnowledge}

MANAGEMENT PROTOCOLS:
1. In ADMIN GOD MODE, you are authorized to change ANY site content. 
2. READ-BEFORE-WRITE: If the user asks to "improve" or "change" something, ALWAYS call getSiteContext first to see the current text.
3. SCHEMA ENFORCEMENT: 
   - Main Home Headline key = "hero_headline" (NOT "hero_title")
   - About Page Text key = "about_me_page_text"
4. PROJECT CREATION WORKFLOW (CRITICAL):
   When user asks to add a project, you MUST create a COMPLETE project:
   a) First, call searchImages with a relevant query to find 4 professional images
   b) Use the first image as thumbnail_url, and the next 3 as the images array
   c) Generate a compelling description (1-2 sentences)
   d) Generate rich HTML content for the case study with these exact sections:
      <h2>Project Title</h2><p>Overview paragraph</p>
      <h3>Challenge</h3><p>What problem was solved</p>
      <h3>Solution</h3><p>How it was solved</p>
      <h3>Key Features</h3><ul><li>Feature 1</li><li>Feature 2</li><li>Feature 3</li><li>Feature 4</li></ul>
   e) Fill ALL fields: title, description, client, category, date, project_link, thumbnail_url, images, content
   NEVER create a project with empty description, content, or default images.
5. NAVIGATION: Only call navigate_to if explicitly requested or to show a change you just made.
6. CONTACT CARDS: Use showContactMethod for phone/email/whatsapp requests.`;

    // Parse conversation history for Gemini format
    let parsedHistory = [];
    try { if (history) parsedHistory = JSON.parse(history); } catch (e) { }

    const validHistory = parsedHistory.filter(m => m.role === 'user' || m.role === 'assistant');
    const collapsedHistory = [];
    for (const msg of validHistory) {
      const mappedRole = msg.role === 'assistant' ? 'model' : 'user';
      const lastItem = collapsedHistory[collapsedHistory.length - 1];
      if (lastItem && lastItem.role === mappedRole) {
        lastItem.parts[0].text += '\n\n' + msg.content;
      } else {
        collapsedHistory.push({
          role: mappedRole,
          parts: [{ text: msg.content }]
        });
      }
    }

    // KEY ROTATION: Try every key × model combination before giving up
    const modelsToTry = ['gemini-2.0-flash-exp', 'gemini-1.5-flash', 'gemini-1.5-pro'];
    let response = null;
    let lastError = null;

    for (const modelName of modelsToTry) {
      for (const keyRow of keys) {
        try {
          const genAI = new GoogleGenerativeAI(keyRow.api_key);
          const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: systemPrompt,
            tools: [{ functionDeclarations: toolDeclarations }]
          });
          const chat = model.startChat({ history: collapsedHistory });
          const result = await chat.sendMessage(text.trim());
          response = result.response;
          console.log(`[Chaka Text] Success with ${modelName} (key ...${keyRow.api_key.slice(-6)})`);
          break; // success — stop trying
        } catch (err) {
          const errMsg = err.message || '';
          console.log(`[Chaka Text] ${modelName} (key ...${keyRow.api_key.slice(-6)}) failed: ${errMsg.substring(0, 100)}`);
          lastError = err;
          // Continue to next key/model
        }
      }
      if (response) break; // success — stop trying models
    }

    // FINAL FALLBACK: If all Gemini keys exhausted, try Groq LLM
    if (!response) {
      const groqKeys = await new Promise((resolve, reject) => {
        db.all("SELECT api_key FROM api_keys WHERE provider = 'groq' AND is_active = 1", [], (err, rows) => {
          if (err) reject(err); else resolve(rows);
        });
      });

      if (groqKeys.length > 0) {
        console.log('[Chaka Text] All Gemini keys exhausted. Falling back to Groq...');
        const groqKey = groqKeys[0].api_key;

        const groqTools = [
          { type: "function", function: { name: "getSiteContext", description: "Returns all current site settings, projects, and services. Call this FIRST before improving content.", parameters: { type: "object", properties: {} } } },
          { type: "function", function: { name: "updateSiteSetting", description: "Updates a global site setting. VALID KEYS: hero_headline, hero_eyebrow, hero_text, about_hero_heading, about_me_page_text, contact_email, contact_phone, site_logo_text, footer_cta, company_name.", parameters: { type: "object", properties: { key: { type: "string" }, value: { type: "string" } }, required: ["key", "value"] } } },
          { type: "function", function: { name: "manageWorks", description: "Add, update or delete portfolio PROJECTS (Case Studies). DO NOT use for Services. All content is database-driven. NEVER try to edit HTML. When adding, MUST include: title, description, client, category, thumbnail_url (MUST be high-res LANDSCAPE), images (array of 3 URLs), content (HTML case study).", parameters: { type: "object", properties: { action: { type: "string", enum: ["add", "update", "delete"] }, id: { type: "number" }, data: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, client: { type: "string" }, category: { type: "string" }, thumbnail_url: { type: "string" }, date: { type: "string" }, project_link: { type: "string" }, images: { type: "array", items: { type: "string" } }, content: { type: "string" } } } }, required: ["action"] } } },
          { type: "function", function: { name: "searchImages", description: "Search the web for relevant images. Returns up to 5 image URLs. Prefer high-resolution LANDSCAPE images for thumbnails.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
          { type: "function", function: { name: "manageServices", description: "Add, update or delete site SERVICES (capabilities). DO NOT use this for Projects. When adding, find image URLs via searchImages.", parameters: { type: "object", properties: { action: { type: "string", enum: ["add", "update", "delete"] }, id: { type: "number" }, data: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, image_url: { type: "string" }, hover_image_url: { type: "string" }, content: { type: "string" } } } }, required: ["action"] } } },
          { type: "function", function: { name: "navigate_to", description: "Navigate the user's browser to a page. Paths: /, /about.html, /work.html, /service.html, /contact-us.html", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } } },
          { type: "function", function: { name: "scroll_to", description: "Scroll to a section on the current page.", parameters: { type: "object", properties: { section_concept: { type: "string" } }, required: ["section_concept"] } } },
          { type: "function", function: { name: "showContactMethod", description: "Shows a contact card for WhatsApp, Email, or Phone.", parameters: { type: "object", properties: { method: { type: "string", enum: ["whatsapp", "email", "phone"] } }, required: ["method"] } } },
          { type: "function", function: { name: "captureLead", description: "Save a client inquiry to CRM.", parameters: { type: "object", properties: { name: { type: "string" }, email: { type: "string" }, project_scope: { type: "string" }, budget: { type: "string" } }, required: ["name", "email", "project_scope"] } } }
        ];

        const groqMessages = [
          { role: 'system', content: systemPrompt },
          ...validHistory.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
          { role: 'user', content: text.trim() }
        ];

        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages: groqMessages, tools: groqTools, temperature: 0.7, max_tokens: 200 })
        });

        if (groqRes.ok) {
          const groqData = await groqRes.json();
          const groqMsg = groqData.choices[0].message;
          let responseText = groqMsg.content || '';
          let toolCalls = null;

          if (groqMsg.tool_calls && groqMsg.tool_calls.length > 0) {
            toolCalls = groqMsg.tool_calls.map(t => ({
              id: t.id || 'tc_' + Math.random().toString(36).substr(2, 9),
              name: t.function.name,
              args: JSON.parse(t.function.arguments)
            }));
            if (!responseText.trim()) {
              const primaryTool = toolCalls[0].name;
              if (primaryTool === 'navigate_to') responseText = "Navigating you there right now.";
              else if (primaryTool === 'showContactMethod') responseText = "Sure, here's my contact info!";
              else responseText = "Getting that for you now.";
            }
          }

          // Bulletproof: Llama often hallucates tool JSON inline instead of using native calling
          if (!toolCalls) {
            try {
              const jsonMatch = responseText.match(/\{[^}]*"method"\s*:\s*"(whatsapp|email|phone)"[^}]*\}/);
              if (jsonMatch) {
                const args = JSON.parse(jsonMatch[0]);
                toolCalls = [{ id: 'tc_inline_contact', name: 'showContactMethod', args }];
                responseText = responseText.replace(jsonMatch[0], '').trim() || "Sure, here's my contact info!";
              }
            } catch(e) {}
            try {
              const urlMatch = responseText.match(/\{[^}]*"url"\s*:\s*"[^"]*"[^}]*\}/);
              if (urlMatch && !toolCalls) {
                const args = JSON.parse(urlMatch[0]);
                if (args.url) {
                  toolCalls = [{ id: 'tc_inline_nav', name: 'navigate_to', args }];
                  responseText = responseText.replace(urlMatch[0], '').trim() || "Navigating you there right now.";
                }
              }
            } catch(e) {}
            try {
              const scrollMatch = responseText.match(/\{[^}]*"section_concept"\s*:\s*"[^"]*"[^}]*\}/);
              if (scrollMatch && !toolCalls) {
                const args = JSON.parse(scrollMatch[0]);
                toolCalls = [{ id: 'tc_inline_scroll', name: 'scroll_to', args }];
                responseText = responseText.replace(scrollMatch[0], '').trim() || "Scrolling there now.";
              }
            } catch(e) {}
          }

          if (!responseText && toolCalls) responseText = "On it!";
          console.log(`[Chaka Text → Groq] User: "${text}" | AI: "${responseText.substring(0, 80)}" | Tools: ${toolCalls ? toolCalls.length : 0}`);
          return res.json({ text: responseText, toolCalls });
        }
      }

      throw lastError || new Error('All API keys and models exhausted');
    }

    let responseText = '';
    let toolCalls = null;

    if (response.candidates && response.candidates[0]) {
      const parts = response.candidates[0].content.parts;
      for (const part of parts) {
        if (part.text) responseText += part.text;
        if (part.functionCall) {
          if (!toolCalls) toolCalls = [];
          toolCalls.push({
            id: 'tc_' + Math.random().toString(36).substr(2, 9),
            name: part.functionCall.name,
            args: part.functionCall.args
          });
        }
      }
    }

    if (!responseText && toolCalls) responseText = "On it!";

    console.log(`[Chaka Text] User: "${text}" | AI: "${responseText.substring(0, 80)}" | Tools: ${toolCalls ? toolCalls.length : 0}`);
    res.json({ text: responseText, toolCalls });

  } catch (e) {
    console.error('[Chaka Text] Error:', e);
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
      db.all("SELECT api_key FROM api_keys WHERE provider = 'groq' AND is_active = 1", [], (err, rows) => {
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

    const siteKnowledge = await getSiteKnowledge();

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

    const messages = [
      { role: 'system', content: systemPrompt },
      ...recentMemory,
      { role: 'user', content: userText }
    ];

    const groqTools = [
      { type: "function", function: { name: "getSiteContext", description: "Get current site state", parameters: { type: "object", properties: {} } } },
      { type: "function", function: { name: "navigate_to", description: "Navigate user browser to URL", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } } },
      { type: "function", function: { name: "scroll_to", description: "Scroll to page section", parameters: { type: "object", properties: { section_concept: { type: "string" } }, required: ["section_concept"] } } },
      { type: "function", function: { name: "updateSiteSetting", description: "Admin: update setting", parameters: { type: "object", properties: { key: { type: "string" }, value: { type: "string" } }, required: ["key", "value"] } } },
      { type: "function", function: { name: "manageWorks", description: "Add/Update/Delete portfolio projects. DO NOT use for services.", parameters: { type: "object", properties: { action: { type: "string", enum: ["add", "update", "delete"] }, id: { type: "number" }, data: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, thumbnail_url: { type: "string" }, images: { type: "array", items: { type: "string" } }, content: { type: "string" } } } }, required: ["action"] } } },
      { type: "function", function: { name: "manageServices", description: "Add/Update/Delete services. DO NOT use for projects.", parameters: { type: "object", properties: { action: { type: "string", enum: ["add", "update", "delete"] }, id: { type: "number" }, data: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, image_url: { type: "string" }, content: { type: "string" } } } }, required: ["action"] } } },
      { type: "function", function: { name: "searchImages", description: "Search for professional images", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
      { type: "function", function: { name: "captureLead", description: "Save CRM lead", parameters: { type: "object", properties: { name: { type: "string" }, email: { type: "string" }, project_scope: { type: "string" } }, required: ["name", "email", "project_scope"] } } },
      { type: "function", function: { name: "showContactMethod", description: "Show contact card", parameters: { type: "object", properties: { method: { type: "string", enum: ["whatsapp", "email", "phone"] } }, required: ["method"] } } }
    ];

    let aiResponseText = "";
    let toolCallPayload = null;
    let groqSuccess = false;

    try {
      const llmRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages: messages, tools: groqTools, temperature: 0.7, max_tokens: 150 })
      });

      if (!llmRes.ok) throw new Error(await llmRes.text());
      const llmData = await llmRes.json();
      const llmMsg = llmData.choices[0].message;
      aiResponseText = llmMsg.content || "";

      if (llmMsg.tool_calls && llmMsg.tool_calls.length > 0) {
        toolCallPayload = llmMsg.tool_calls.map(t => ({
          id: t.id || 'tc_' + Math.random().toString(36).substr(2, 9),
          name: t.function.name,
          args: JSON.parse(t.function.arguments)
        }));
      }
      groqSuccess = true;
    } catch (err) {
      console.warn('[Chaka Audio] Groq LLM failed/rate-limited. Falling back to Gemini...', err.message.substring(0, 100));
    }

    // FALLBACK TO GEMINI IF GROQ RATE LIMITED (TPM limit hit)
    if (!groqSuccess) {
      const gKeys = await new Promise((resolve) => {
        db.all("SELECT api_key FROM api_keys WHERE provider = 'gemini' AND is_active = 1", [], (err, rows) => resolve(rows || []));
      });
      if (gKeys.length > 0) {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(gKeys[0].api_key);
        
        // Convert history for Gemini
        const validHistory = recentMemory.filter(m => m.role === 'user' || m.role === 'assistant');
        const collapsedHistory = [];
        for (const msg of validHistory) {
          const mappedRole = msg.role === 'assistant' ? 'model' : 'user';
          const lastItem = collapsedHistory[collapsedHistory.length - 1];
          if (lastItem && lastItem.role === mappedRole) lastItem.parts[0].text += '\n\n' + msg.content;
          else collapsedHistory.push({ role: mappedRole, parts: [{ text: msg.content }] });
        }

        const fallbackModel = genAI.getGenerativeModel({
          model: 'gemini-1.5-flash',
          systemInstruction: systemPrompt,
          tools: [{ functionDeclarations: [
            { name: "navigate_to", description: "Navigate user browser to URL", parameters: { type: "OBJECT", properties: { url: { type: "STRING" } }, required: ["url"] } },
            { name: "scroll_to", description: "Scroll to page section", parameters: { type: "OBJECT", properties: { section_concept: { type: "STRING" } }, required: ["section_concept"] } },
            { name: "updateSiteSetting", description: "Admin: update setting", parameters: { type: "OBJECT", properties: { key: { type: "STRING" }, value: { type: "STRING" } }, required: ["key", "value"] } },
            { name: "manageWorks", description: "Add/Update/Delete portfolio projects", parameters: { type: "OBJECT", properties: { action: { type: "STRING" }, id: { type: "NUMBER" }, data: { type: "OBJECT" } }, required: ["action"] } },
            { name: "manageServices", description: "Add/Update/Delete site services", parameters: { type: "OBJECT", properties: { action: { type: "STRING" }, id: { type: "NUMBER" }, data: { type: "OBJECT" } }, required: ["action"] } },
            { name: "showContactMethod", description: "Show contact card", parameters: { type: "OBJECT", properties: { method: { type: "STRING", enum: ["whatsapp", "email", "phone"] } }, required: ["method"] } }
          ]}]
        });

        const fallbackChat = fallbackModel.startChat({ history: collapsedHistory });
        const fallbackResult = await fallbackChat.sendMessage(userText.trim());
        const response = fallbackResult.response;

        if (response.candidates && response.candidates[0]) {
          const parts = response.candidates[0].content.parts;
          for (const part of parts) {
            if (part.text) aiResponseText += part.text;
            if (part.functionCall) {
              if (!toolCallPayload) toolCallPayload = [];
              toolCallPayload.push({
                id: 'tc_fb_' + Math.random().toString(36).substr(2, 9),
                name: part.functionCall.name,
                args: part.functionCall.args
              });
            }
          }
        }
      } else {
        throw new Error("Groq failed and no Gemini keys available for fallback.");
      }
    }

    if (toolCallPayload && toolCallPayload.length > 0) {
      if (!aiResponseText.trim()) {
        const primaryTool = toolCallPayload[0].name;
        if (primaryTool === 'navigate_to') aiResponseText = "Navigating you there right now.";
        else if (primaryTool === 'showContactMethod') aiResponseText = "Sure, here is my contact info!";
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

// --- SEO & SEARCH ENGINE TOOLS ---

// Robots.txt
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(`User-agent: *\nAllow: /\nSitemap: ${req.protocol}://${req.get('host')}/sitemap.xml`);
});

// Dynamic Sitemap.xml
app.get('/sitemap.xml', async (req, res) => {
  const host = `${req.protocol}://${req.get('host')}`;
  const staticPages = ['', '/about', '/services', '/work', '/resume', '/contact-us'];
  
  db.all('SELECT slug FROM services', [], (err, services) => {
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    
    // Add Static Pages
    staticPages.forEach(p => {
      xml += `  <url><loc>${host}${p}</loc><changefreq>weekly</changefreq><priority>${p === '' ? '1.0' : '0.8'}</priority></url>\n`;
    });
    
    // Add Dynamic Services
    if (!err && services) {
      services.forEach(s => {
        xml += `  <url><loc>${host}/services/${s.slug}</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>\n`;
      });
    }
    
    xml += `</urlset>`;
    res.header('Content-Type', 'application/xml');
    res.send(xml);
  });
});

const axios = require('axios');

// --- ⚡️ ROBUST KEEP-ALIVE SYSTEM ---

// 1. Health Check & Ping Endpoint
app.get('/ping', (req, res) => {
    console.log(`[KEEP-ALIVE] Ping received at ${new Date().toISOString()}`);
    res.status(200).send('PONG');
});

// 2. Turso Database Keep-Alive (Prevents connection timeout)
setInterval(async () => {
    try {
        await db.execute('SELECT 1');
        console.log('[KEEP-ALIVE] Turso connection is hot 🔥');
    } catch (e) {
        console.warn('[KEEP-ALIVE] Turso ping failed:', e.message);
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
});

const wss = new WebSocketServer({ server, path: '/api/chaka/stream' });
initChakaStream(wss);
