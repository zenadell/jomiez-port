// Global Fetch Interceptor for Auth
const originalFetch = window.fetch;
window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    if (response.status === 401 && !args[0].includes('/api/login') && !args[0].includes('/api/check-auth')) {
        window.location.href = '/admin/login';
    }
    return response;
};

let settingsCache = {};
let worksCache = [];
let skillsCache = [];
let servicesCache = [];
let brandsCache = [];
let faqsCache = [];
let marqueeCache = [];
let testimonialsCache = [];

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadApiKeys();
  loadWorks();
  loadSkills();
  loadServices();
  loadBrands();
  loadFaqs();
  loadMarquee();
  loadTestimonials();
  loadLeads();
  loadMemory();
  loadInbox();
  loadProspects();
  // Keeps the red dot honest while the panel sits open on another tab.
  setInterval(refreshInboxBadge, 60000);
});

let leadsCache = [];
let memoryCache = [];
let analyticsCache = null;
let currentLeadTab = 'leads';
// Which lead folder is showing. Junk is a view, not a deletion — the scoring is
// conservative on purpose, so anything it misjudges stays reachable.
let leadsShowJunk = false;

// Setup navigation
function showSection(id) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  
  const target = document.getElementById('panel-' + id);
  if(target) target.classList.add('active');
  
  const navItems = Array.from(document.querySelectorAll('.nav-item'));
  const activeNav = navItems.find(n => n.getAttribute('onclick').includes(`'${id}'`));
  if(activeNav) activeNav.classList.add('active');

  // Update Topbar
  const titleMap = {
    'hero': { t: 'Home Hero', s: 'Manage your homepage hero section content' },
    'about': { t: 'About Page', s: 'Manage bio, images and video presentation' },
    'projects': { t: 'Projects / Works', s: 'Manage your portfolio inventory' },
    'skills': { t: 'Skills', s: 'Manage your skills grid on the About page' },
    'services': { t: 'Services', s: 'Manage your services offered on Services and Home pages' },
    'brands': { t: 'Brands / Clients', s: 'Manage the infinite logo marquee' },
    'faqs': { t: 'FAQs', s: 'Manage frequently asked questions' },
    'footer': { t: 'Global Footer', s: 'Manage contact CTA and footer text' },
    'marquee': { t: 'Marquee / Gallery', s: 'Manage the scrolling image mockups gallery' },
    'testimonials': { t: 'Testimonials', s: 'Manage the client reviews' },
    'settings': { t: 'Site Settings', s: 'System configuration and global metadata' },
    'apikeys': { t: 'AI API Keys', s: 'Manage Gemini and Groq integrations globally' },
    'leads': { t: 'AI Insights & Leads', s: 'View inquiries and facts harvested by Chaka' },
    'resume': { t: 'My Resume / CV', s: 'Manage your professional resume file' }
  };

  if(titleMap[id]) {
    document.getElementById('topbar-title').textContent = titleMap[id].t;
    document.getElementById('topbar-sub').textContent = titleMap[id].s;
  }
}

// Toast Notification
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ===== API CALLS =====

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    settingsCache = await res.json();
    populateForm();
  } catch(e) { console.error('Load settings failed', e); }
}

let apiKeysCache = [];

async function loadApiKeys() {
  try {
    const res = await fetch('/api/apikeys');
    apiKeysCache = await res.json();
    renderApiKeys();
  } catch(e) { console.error('Load API keys failed', e); }
}

function renderApiKeys() {
  const container = document.getElementById('api_keys_list');
  if(!container) return;
  container.innerHTML = '';
  
  if (apiKeysCache.length === 0) {
    container.innerHTML = '<p class="logo-sub">No integration keys loaded. Add one to activate Chaka.</p>';
    return;
  }

  apiKeysCache.forEach(k => {
    const div = document.createElement('div');
    div.style = 'display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #111; border: 1px solid #333; border-radius: 6px;';
    // The API no longer returns key material — it was being masked here anyway,
    // which meant the full secret was travelling to the browser only to be hidden
    // in the DOM. The server now sends a pre-masked value. To change a key,
    // delete it and add the new one.
    const hiddenStr = k.key_masked || '••••';
    div.innerHTML = `
      <div>
        <strong style="color: #00e0ff;">${k.provider.toUpperCase()}</strong>
        <p style="color: #888; font-family: monospace; font-size: 13px;">${hiddenStr}</p>
      </div>
      <button class="btn btn-outline" style="color: #ff4a4a; border-color: #ff4a4a;" onclick="deleteApiKey(${k.id})"><i data-lucide="trash-2"></i></button>
    `;
    container.appendChild(div);
  });
  if(window.lucide) window.lucide.createIcons();
}

async function addApiKey() {
  const provider = document.getElementById('new_api_key_provider').value;
  const val = document.getElementById('new_api_key_value').value.trim();
  if(!val) return showToast('Error: API Key value is empty.');
  
  await fetch('/api/apikeys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, api_key: val })
  });
  
  document.getElementById('new_api_key_value').value = '';
  showToast('API Key integrated successfully.');
  loadApiKeys();
}

async function deleteApiKey(id) {
  if(!confirm('Are you sure you want to deactivate this Node?')) return;
  await fetch(`/api/apikeys/${id}`, { method: 'DELETE' });
  showToast('Integration key severed.');
  loadApiKeys();
}

async function loadWorks() {
  try {
    const res = await fetch('/api/works');
    worksCache = await res.json();
    renderWorks();
  } catch(e) { console.error('Load works failed', e); }
}

async function saveSettings() {
  const updates = [
    { key: 'hero_eyebrow', value: document.getElementById('set-hero-eyebrow')?.value }
  ];

  for (let u of updates) {
    if(u.value !== undefined) {
      await fetch('/api/settings', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(u)
      });
    }
  }
  showToast('Settings saved!');
}

async function saveSetting(key, value) {
  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value })
  });
}

async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/upload', {
    method: 'POST',
    body: formData
  });
  const data = await res.json();
  return data.url;
}

// ===== CORE LOGIC =====

function populateForm() {
  // Dynamically map all inputs including checkboxes
  const inputs = document.querySelectorAll('.panel input[type="text"], .panel textarea, .panel select, .panel input[type="range"], .panel input[type="checkbox"]');
  inputs.forEach(input => {
    if (input.id && settingsCache[input.id] !== undefined) {
      if (input.type === 'checkbox') {
        input.checked = settingsCache[input.id] === '1';
      } else {
        input.value = settingsCache[input.id];
        // Update linked value display if exists (for ranges)
        const valDisplay = document.getElementById(input.id + '_val');
        if (valDisplay) valDisplay.textContent = input.value;
      }
    } else if (input.id && input.tagName !== 'SELECT' && input.type !== 'range' && input.type !== 'checkbox') {
        input.value = ''; // clear if not in DB
    }
  });

  // Dynamically map all image previews
  Object.keys(settingsCache).forEach(key => {
    const previewEl = document.getElementById(key + '_preview');
    if (previewEl && settingsCache[key]) {
      previewEl.src = settingsCache[key];
      previewEl.style.opacity = '1';
    }
  });

  // Update Resume Status
  const resumeStatus = document.getElementById('active-resume-status');
  if (resumeStatus && settingsCache['resume_url']) {
    resumeStatus.textContent = 'Active File: ' + settingsCache['resume_url'].split('/').pop();
  }

  // Sync hero media toggle visibility
  if (typeof toggleHeroMedia === 'function') toggleHeroMedia();
}

async function saveActivePanel() {
  const activePanel = document.querySelector('.panel.active');
  const btn = document.querySelector('.topbar .btn-primary');
  const originalText = btn.textContent;
  btn.textContent = 'Saving...';
  btn.disabled = true;

  try {
    // Identify fields in active panel (text, textarea, select, range, checkbox, number)
    const inputs = activePanel.querySelectorAll('input[type="text"], input[type="number"], textarea, select, input[type="range"], input[type="checkbox"]');
    for(let input of inputs) {
      if(input.id) {
        const val = input.type === 'checkbox' ? (input.checked ? '1' : '0') : input.value;
        await saveSetting(input.id, val);
      }
    }

    // Identify files in active panel
    const fileInputs = activePanel.querySelectorAll('input[type="file"]');
    for(let input of fileInputs) {
      if(input.files[0]) {
        try {
          const url = await uploadFile(input.files[0]);
          const key = input.id.replace('_file', '');
          await saveSetting(key, url);
          // Update preview if exists
          const preview = document.getElementById(key + '_preview');
          if(preview) preview.src = url;
        } catch(e) {
          console.error('File upload failed', e);
          showToast('✗ Error uploading ' + input.id);
        }
      }
    }
    showToast('✓ Section saved successfully');
  } catch(e) {
    console.error('Save failed', e);
    showToast('✗ Save failed: ' + e.message);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
    loadSettings();
  }
}

function toggleHeroMedia() {
  const sel = document.getElementById('hero_media_type');
  const imgGroup = document.getElementById('hero_media_image_group');
  const videoGroup = document.getElementById('hero_media_video_group');
  const splineGroup = document.getElementById('hero_media_spline_group');
  if (!sel) return;
  // Hide all groups first
  if (imgGroup) imgGroup.style.display = 'none';
  if (videoGroup) videoGroup.style.display = 'none';
  if (splineGroup) splineGroup.style.display = 'none';
  // Show the selected group
  if (sel.value === 'spline' && splineGroup) {
    splineGroup.style.display = 'block';
  } else if (sel.value === 'video' && videoGroup) {
    videoGroup.style.display = 'block';
  } else if (imgGroup) {
    imgGroup.style.display = '';
  }
}

function handleImagePreview(event, previewId) {
  const file = event.target.files[0];
  if(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const el = document.getElementById(previewId);
      if(el) { el.src = e.target.result; el.style.opacity = '1'; }
    };
    reader.readAsDataURL(file);
  }
}

function handleVideoPreview(event, previewId) {
  const file = event.target.files[0];
  if(file) {
    const url = URL.createObjectURL(file);
    const el = document.getElementById(previewId);
    if(el) {
      el.src = url;
      el.style.opacity = '1';
      el.play();
    }
  }
}

async function handleVideoUpload(event) {
  const file = event.target.files[0];
  if(file) {
    showToast('Uploading video...');
    const url = await uploadFile(file);
    const input = document.getElementById('about_video_url');
    if(input) input.value = url;
    showToast('✓ Video uploaded');
  }
}

// ===== WORKS LOGIC =====

function renderWorks() {
  const list = document.getElementById('works-list');
  if(!list) return;
  if(worksCache.length === 0) {
    list.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:40px;">No projects yet. Click <b>+ Add New</b> to create one.</div>';
    return;
  }
  list.innerHTML = worksCache.map(w => `
    <div class="work-item">
      <div class="work-thumb">
        <img src="${w.thumbnail_url || 'https://via.placeholder.com/80x60/161616/888?text=No+Image'}" alt="">
      </div>
      <div class="work-info">
        <div class="work-title">${w.title}</div>
        <div class="work-slug">/work/${w.slug}</div>
        ${w.category ? `<span class="work-cat">${w.category}</span>` : ''}
      </div>
      <div class="work-actions">
        <a href="/work/${w.slug}" target="_blank" class="btn btn-outline btn-sm" style="text-decoration:none" title="Preview">
          <i data-lucide="external-link" style="width:14px;height:14px"></i>
        </a>
        <button class="btn btn-outline btn-sm" onclick="editWork(${w.id})">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteWork(${w.id})">Delete</button>
      </div>
    </div>
  `).join('');
  lucide.createIcons();
}

function openWorkModal() {
  // Clear all fields
  document.getElementById('work-id').value = '';
  document.getElementById('work-title').value = '';
  document.getElementById('work-slug').value = '';
  document.getElementById('work-category').value = '';
  document.getElementById('work-client').value = '';
  document.getElementById('work-date').value = '';
  document.getElementById('work-link').value = '';
  document.getElementById('work-desc').value = '';
  document.getElementById('work-content').value = '';
  
  // Clear image previews
  document.getElementById('work-thumb-preview').src = '';
  document.getElementById('work-thumb-url').value = '';
  document.getElementById('work-gallery1-preview').src = '';
  document.getElementById('work-gallery1-url').value = '';
  document.getElementById('work-gallery2-preview').src = '';
  document.getElementById('work-gallery2-url').value = '';
  document.getElementById('work-gallery3-preview').src = '';
  document.getElementById('work-gallery3-url').value = '';
  
  // Clear file inputs
  const fileInputs = document.querySelectorAll('#modal-work input[type="file"]');
  fileInputs.forEach(f => f.value = '');
  
  document.getElementById('modal-work').classList.add('active');
}

function closeWorkModal() {
  document.getElementById('modal-work').classList.remove('active');
}

function editWork(id) {
  const w = worksCache.find(x => x.id === id);
  if(!w) return;
  
  document.getElementById('work-id').value = w.id;
  document.getElementById('work-title').value = w.title || '';
  document.getElementById('work-slug').value = w.slug || '';
  document.getElementById('work-category').value = w.category || '';
  document.getElementById('work-client').value = w.client || '';
  document.getElementById('work-date').value = w.date || '';
  document.getElementById('work-link').value = w.project_link || '';
  document.getElementById('work-desc').value = w.description || '';
  document.getElementById('work-content').value = w.content || '';
  
  // Thumbnail
  document.getElementById('work-thumb-preview').src = w.thumbnail_url || '';
  document.getElementById('work-thumb-url').value = w.thumbnail_url || '';
  
  // Gallery images (stored as JSON array: [img1, img2, img3])
  const imgs = Array.isArray(w.images) ? w.images : [];
  document.getElementById('work-gallery1-preview').src = imgs[0] || '';
  document.getElementById('work-gallery1-url').value = imgs[0] || '';
  document.getElementById('work-gallery2-preview').src = imgs[1] || '';
  document.getElementById('work-gallery2-url').value = imgs[1] || '';
  document.getElementById('work-gallery3-preview').src = imgs[2] || '';
  document.getElementById('work-gallery3-url').value = imgs[2] || '';
  
  // Clear file inputs
  const fileInputs = document.querySelectorAll('#modal-work input[type="file"]');
  fileInputs.forEach(f => f.value = '');
  
  document.getElementById('modal-work').classList.add('active');
}

async function resolveImageUrl(fileInputId, urlInputId, currentUrl) {
  // Priority: file upload > typed URL > existing URL
  const fileInput = document.getElementById(fileInputId);
  const urlInput = document.getElementById(urlInputId);
  
  if(fileInput && fileInput.files[0]) {
    return await uploadFile(fileInput.files[0]);
  }
  if(urlInput && urlInput.value.trim()) {
    return urlInput.value.trim();
  }
  return currentUrl || '';
}

async function saveWork() {
  const saveBtn = document.querySelector('.modal-actions .btn-primary');
  const originalText = saveBtn.textContent;
  saveBtn.textContent = 'Saving...';
  saveBtn.disabled = true;
  
  try {
    const id = document.getElementById('work-id').value;
    
    // Resolve all image URLs (file upload takes priority over URL field)
    const existingWork = id ? worksCache.find(w => w.id == id) : null;
    const existingImages = existingWork && Array.isArray(existingWork.images) ? existingWork.images : [];
    
    const thumbUrl = await resolveImageUrl('work-thumb-file', 'work-thumb-url', existingWork?.thumbnail_url);
    const gallery1 = await resolveImageUrl('work-gallery1-file', 'work-gallery1-url', existingImages[0]);
    const gallery2 = await resolveImageUrl('work-gallery2-file', 'work-gallery2-url', existingImages[1]);
    const gallery3 = await resolveImageUrl('work-gallery3-file', 'work-gallery3-url', existingImages[2]);
    
    const title = document.getElementById('work-title').value;
    const payload = {
      title: title,
      slug: document.getElementById('work-slug').value || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      category: document.getElementById('work-category').value,
      client: document.getElementById('work-client').value,
      date: document.getElementById('work-date').value,
      project_link: document.getElementById('work-link').value,
      description: document.getElementById('work-desc').value,
      content: document.getElementById('work-content').value,
      thumbnail_url: thumbUrl,
      images: [gallery1, gallery2, gallery3]
    };



    const url = id ? `/api/works/${id}` : '/api/works';
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
    
    if(!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Save failed');
    }

    closeWorkModal();
    await loadWorks();
    showToast(id ? '✓ Project updated successfully' : '✓ New project created');
  } catch(err) {
    showToast('✗ Error: ' + err.message);
    console.error('Save work error:', err);
  } finally {
    saveBtn.textContent = originalText;
    saveBtn.disabled = false;
  }
}

async function deleteWork(id) {
  if(!confirm('Are you sure you want to delete this project? This action cannot be undone.')) return;
  try {
    await fetch(`/api/works/${id}`, { method: 'DELETE' });
    await loadWorks();
    showToast('Project deleted');
  } catch(err) {
    showToast('✗ Delete failed');
  }
}

// ===== SKILLS LOGIC =====

async function loadSkills() {
  try {
    const res = await fetch('/api/skills');
    skillsCache = await res.json();
    renderSkills();
  } catch(e) { console.error('Load skills failed', e); }
}

const SKILL_ICONS = {
  star: '★', sparkle: '✦', hexagon: '⬡', circles: '◎', target: '◉',
  diamond: '◆', code: '⟨/⟩', palette: '🎨', layers: '▣', zap: '⚡'
};

function renderSkills() {
  const list = document.getElementById('skills-list');
  if(!list) return;
  if(skillsCache.length === 0) {
    list.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:40px;">No skills added yet. Click <b>+ Add Skill</b> to create one.</div>';
    return;
  }
  list.innerHTML = skillsCache.map(s => `
    <div class="work-item">
      <div class="skill-icon-display">${SKILL_ICONS[s.icon] || '★'}</div>
      <div class="work-info">
        <div class="work-title">${s.name}</div>
        <div class="work-slug">${s.description || 'No description'}</div>
      </div>
      <div class="work-actions">
        <button class="btn btn-outline btn-sm" onclick="editSkill(${s.id})">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteSkill(${s.id})">Delete</button>
      </div>
    </div>
  `).join('');
}

function openSkillModal() {
  document.getElementById('skill-id').value = '';
  document.getElementById('skill-name').value = '';
  document.getElementById('skill-desc').value = '';
  document.getElementById('skill-icon').value = 'star';
  document.getElementById('skill-order').value = skillsCache.length;
  document.getElementById('modal-skill').classList.add('active');
}

function closeSkillModal() {
  document.getElementById('modal-skill').classList.remove('active');
}

function editSkill(id) {
  const s = skillsCache.find(x => x.id === id);
  if(!s) return;
  document.getElementById('skill-id').value = s.id;
  document.getElementById('skill-name').value = s.name || '';
  document.getElementById('skill-desc').value = s.description || '';
  document.getElementById('skill-icon').value = s.icon || 'star';
  document.getElementById('skill-order').value = s.sort_order || 0;
  document.getElementById('modal-skill').classList.add('active');
}

async function saveSkill() {
  const id = document.getElementById('skill-id').value;
  const payload = {
    name: document.getElementById('skill-name').value,
    description: document.getElementById('skill-desc').value,
    icon: document.getElementById('skill-icon').value,
    sort_order: parseInt(document.getElementById('skill-order').value) || 0
  };

  const url = id ? `/api/skills/${id}` : '/api/skills';
  const method = id ? 'PUT' : 'POST';

  await fetch(url, {
    method,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload)
  });

  closeSkillModal();
  await loadSkills();
  showToast(id ? '✓ Skill updated' : '✓ Skill added');
}

async function deleteSkill(id) {
  if(!confirm('Delete this skill?')) return;
  await fetch(`/api/skills/${id}`, { method: 'DELETE' });
  await loadSkills();
  showToast('Skill deleted');
}

// ===================
// SERVICES CRUD
// ===================
async function loadServices() {
  const res = await fetch('/api/services');
  servicesCache = await res.json();
  renderServices();
}

function renderServices() {
  const container = document.getElementById('services-list');
  if (!container) return;
  if (servicesCache.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);padding:20px 0">No services yet. Click "+ Add Service" to get started.</p>';
    return;
  }
  container.innerHTML = servicesCache.map(s => `
    <div class="skill-row">
      <div style="flex:1;min-width:0">
        <strong>${s.title}</strong>
        <span style="color:var(--text-muted);font-size:12px;margin-left:8px">/services/${s.slug}</span>
        <div style="color:var(--text-muted);font-size:13px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.description || ''}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn btn-outline btn-sm" onclick="openServiceModal(${s.id})">Edit</button>
        <button class="btn btn-sm" style="background:#dc3545;color:#fff;border:none" onclick="deleteService(${s.id})">Delete</button>
      </div>
    </div>
  `).join('');
}

function openServiceModal(id) {
  document.getElementById('service-id').value = '';
  document.getElementById('service-title').value = '';
  document.getElementById('service-slug').value = '';
  document.getElementById('service-desc').value = '';
  document.getElementById('service-content').value = '';
  document.getElementById('service-image').value = '';
  document.getElementById('service-hover-image').value = '';
  document.getElementById('service-order').value = '0';

  if (id) {
    const s = servicesCache.find(x => x.id === id);
    if (s) {
      document.getElementById('service-id').value = s.id;
      document.getElementById('service-title').value = s.title || '';
      document.getElementById('service-slug').value = s.slug || '';
      document.getElementById('service-desc').value = s.description || '';
      document.getElementById('service-content').value = s.content || '';
      document.getElementById('service-image').value = s.image_url || '';
      document.getElementById('service-hover-image').value = s.hover_image_url || '';
      document.getElementById('service-order').value = s.sort_order || 0;
    }
  }
  document.getElementById('modal-service').classList.add('active');
}

function closeServiceModal() {
  document.getElementById('modal-service').classList.remove('active');
}

// Auto-generate slug from title
document.addEventListener('DOMContentLoaded', () => {
  const titleInput = document.getElementById('service-title');
  const slugInput = document.getElementById('service-slug');
  if (titleInput && slugInput) {
    titleInput.addEventListener('input', () => {
      if (!document.getElementById('service-id').value) {
        slugInput.value = titleInput.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      }
    });
  }
});

async function saveService() {
  const id = document.getElementById('service-id').value;
  const payload = {
    title: document.getElementById('service-title').value,
    slug: document.getElementById('service-slug').value,
    description: document.getElementById('service-desc').value,
    content: document.getElementById('service-content').value,
    image_url: document.getElementById('service-image').value,
    hover_image_url: document.getElementById('service-hover-image').value,
    sort_order: parseInt(document.getElementById('service-order').value) || 0
  };

  const url = id ? `/api/services/${id}` : '/api/services';
  const method = id ? 'PUT' : 'POST';

  await fetch(url, {
    method,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload)
  });

  closeServiceModal();
  await loadServices();
  showToast(id ? '✓ Service updated' : '✓ Service added');
}

async function deleteService(id) {
  if(!confirm('Delete this service?')) return;
  await fetch(`/api/services/${id}`, { method: 'DELETE' });
  await loadServices();
  showToast('Service deleted');
}

// ===== BRANDS CRUD =====

async function loadBrands() {
  try {
    const res = await fetch('/api/brands');
    brandsCache = await res.json();
    renderBrands();
  } catch(e) { console.error('Failed loading brands', e); }
}

function renderBrands() {
  const container = document.getElementById('brands-list');
  if(!container) return;
  if(brandsCache.length === 0) {
    container.innerHTML = `<p style="padding:15px;color:#6b7280;text-align:center">No brands yet. Add one!</p>`;
    return;
  }
  container.innerHTML = brandsCache.map(b => `
    <div style="background:#f9fafb;padding:12px;border:1px solid #e5e7eb;border-radius:6px;display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:10px">
      <div style="flex-grow:1;display:flex;align-items:center;gap:15px;min-width:0">
        <div style="width:60px;height:40px;background:#fff;border:1px solid #ddd;border-radius:4px;display:flex;align-items:center;justify-content:center;overflow:hidden">
            ${b.image_url ? `<img src="${b.image_url}" style="max-width:100%;max-height:100%;object-fit:contain">` : `<span style="font-size:10px;color:#aaa">No img</span>`}
        </div>
        <div>
          <div style="font-weight:600;font-size:14px;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${b.name || '(unnamed)'} <span style="color:#6b7280;font-weight:normal;font-size:12px">Order: ${b.sort_order}</span>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn btn-outline btn-sm" onclick="openBrandModal(${b.id})">Edit</button>
        <button class="btn btn-sm" style="background:#dc3545;color:#fff;border:none" onclick="deleteBrand(${b.id})">Delete</button>
      </div>
    </div>
  `).join('');
}

function openBrandModal(id) {
  document.getElementById('brand-id').value = '';
  document.getElementById('brand-name').value = '';
  document.getElementById('brand-image').value = '';
  document.getElementById('brand-order').value = '0';

  if (id) {
    const b = brandsCache.find(x => x.id === id);
    if (b) {
      document.getElementById('brand-id').value = b.id;
      document.getElementById('brand-name').value = b.name || '';
      document.getElementById('brand-image').value = b.image_url || '';
      document.getElementById('brand-order').value = b.sort_order || 0;
    }
  }
  document.getElementById('modal-brand').classList.add('active');
}

function closeBrandModal() {
  document.getElementById('modal-brand').classList.remove('active');
}

async function saveBrand() {
  const id = document.getElementById('brand-id').value;
  const payload = {
    name: document.getElementById('brand-name').value,
    image_url: document.getElementById('brand-image').value,
    sort_order: parseInt(document.getElementById('brand-order').value) || 0
  };

  const url = id ? `/api/brands/${id}` : '/api/brands';
  const method = id ? 'PUT' : 'POST';

  await fetch(url, {
    method,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload)
  });

  closeBrandModal();
  await loadBrands();
  showToast(id ? '✓ Brand updated' : '✓ Brand added');
}

async function deleteBrand(id) {
  if(!confirm('Delete this brand?')) return;
  await fetch(`/api/brands/${id}`, { method: 'DELETE' });
  await loadBrands();
  showToast('Brand deleted');
}

// ===== FAQS CRUD =====

async function loadFaqs() {
  try {
    const res = await fetch('/api/faqs');
    faqsCache = await res.json();
    renderFaqs();
  } catch(e) { console.error('Failed loading faqs', e); }
}

function renderFaqs() {
  const container = document.getElementById('faqs-list');
  if(!container) return;
  if(faqsCache.length === 0) {
    container.innerHTML = `<p style="padding:15px;color:#6b7280;text-align:center">No FAQs yet. Add one!</p>`;
    return;
  }
  container.innerHTML = faqsCache.map(f => `
    <div style="background:#f9fafb;padding:12px;border:1px solid #e5e7eb;border-radius:6px;display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:10px">
      <div style="flex-grow:1;min-width:0">
        <div style="font-weight:600;font-size:14px;color:#111827;margin-bottom:4px">
          ${f.question || '(no question)'}
        </div>
        <div style="font-size:12px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${f.answer || ''}
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn btn-outline btn-sm" onclick="openFaqModal(${f.id})">Edit</button>
        <button class="btn btn-sm" style="background:#dc3545;color:#fff;border:none" onclick="deleteFaq(${f.id})">Delete</button>
      </div>
    </div>
  `).join('');
}

function openFaqModal(id) {
  document.getElementById('faq-id').value = '';
  document.getElementById('faq-question').value = '';
  document.getElementById('faq-answer').value = '';
  document.getElementById('faq-order').value = '0';

  if (id) {
    const f = faqsCache.find(x => x.id === id);
    if (f) {
      document.getElementById('faq-id').value = f.id;
      document.getElementById('faq-question').value = f.question || '';
      document.getElementById('faq-answer').value = f.answer || '';
      document.getElementById('faq-order').value = f.sort_order || 0;
    }
  }
  document.getElementById('modal-faq').classList.add('active');
}

function closeFaqModal() {
  document.getElementById('modal-faq').classList.remove('active');
}

async function saveFaq() {
  const id = document.getElementById('faq-id').value;
  const payload = {
    question: document.getElementById('faq-question').value,
    answer: document.getElementById('faq-answer').value,
    sort_order: parseInt(document.getElementById('faq-order').value) || 0
  };

  const url = id ? `/api/faqs/${id}` : '/api/faqs';
  const method = id ? 'PUT' : 'POST';

  await fetch(url, {
    method,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload)
  });

  closeFaqModal();
  await loadFaqs();
  showToast(id ? '✓ FAQ updated' : '✓ FAQ added');
}

// ===== LEADS & MEMORY LOGIC =====

async function loadLeads() {
  const res = await fetch('/api/leads');
  leadsCache = await res.json();
  if (currentLeadTab === 'leads') renderLeads();
}

async function loadMemory() {
  const res = await fetch('/api/memory');
  memoryCache = await res.json();
  if (currentLeadTab === 'memory') renderLeads();
}

function switchLeadTab(tab) {
  currentLeadTab = tab;
  document.querySelectorAll('.tabs .btn').forEach(b => b.classList.remove('active'));
  const activeBtn = Array.from(document.querySelectorAll('.tabs .btn')).find(b => b.textContent.toLowerCase().includes(tab === 'analytics' ? 'visitor' : tab));
  if (activeBtn) activeBtn.classList.add('active');
  
  if (tab === 'analytics') {
    document.getElementById('leads-container').style.display = 'none';
    document.getElementById('analytics-container').style.display = 'block';
    loadAnalytics();
  } else {
    document.getElementById('leads-container').style.display = 'block';
    document.getElementById('analytics-container').style.display = 'none';
    renderLeads();
  }
}

async function loadAnalytics() {
    const container = document.getElementById('analytics-container');
    container.innerHTML = `<p style="color:var(--text-muted);padding:20px;text-align:center">Gathering intelligence...</p>`;
    
    try {
        const res = await fetch('/api/analytics');
        analyticsCache = await res.json();
        renderAnalytics();
    } catch (err) {
        container.innerHTML = `<p style="color:red;padding:20px;text-align:center">Error fetching analytics.</p>`;
    }
}

function renderAnalytics() {
    const container = document.getElementById('analytics-container');
    if (!analyticsCache) return;

    const { topCountries, topPages, recentHits } = analyticsCache;

    container.innerHTML = `
        <div class="analytics-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
            <div class="card" style="background:#111; border:1px solid #333;">
                <div class="card-title" style="font-size:14px; margin-bottom:15px;"><i data-lucide="globe" style="width:14px; margin-right:5px;"></i> Top Countries</div>
                <div class="stats-list">
                    ${topCountries.map(c => `
                        <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:13px;">
                            <span>${c.country === 'Localhost' ? '🏠 Localhost' : c.country}</span>
                            <span style="color:#00e0ff; font-weight:700;">${c.count} hits</span>
                        </div>
                    `).join('') || '<p style="color:#555">No data yet</p>'}
                </div>
            </div>
            <div class="card" style="background:#111; border:1px solid #333;">
                <div class="card-title" style="font-size:14px; margin-bottom:15px;"><i data-lucide="eye" style="width:14px; margin-right:5px;"></i> Popular Pages</div>
                <div class="stats-list">
                    ${topPages.map(p => `
                        <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:13px;">
                            <span style="color:#aaa;">${p.path}</span>
                            <span style="font-weight:700;">${p.count}</span>
                        </div>
                    `).join('') || '<p style="color:#555">No data yet</p>'}
                </div>
            </div>
        </div>

        <div class="card" style="margin-top:20px; background:#111; border:1px solid #333;">
            <div class="card-title" style="font-size:14px; margin-bottom:15px;"><i data-lucide="activity" style="width:14px; margin-right:5px;"></i> Real-time Visitor Log</div>
            <div class="hits-table" style="max-height:300px; overflow-y:auto;">
                <table style="width:100%; border-collapse:collapse; font-size:12px;">
                    <thead>
                        <tr style="text-align:left; color:#555; border-bottom:1px solid #222;">
                            <th style="padding:8px;">Path</th>
                            <th style="padding:8px;">Location</th>
                            <th style="padding:8px;">Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${recentHits.map(h => `
                            <tr style="border-bottom:1px solid #222;">
                                <td style="padding:8px; color:#00e0ff;">${h.path}</td>
                                <td style="padding:8px;">${h.country === 'Localhost' ? '🏠 Localhost' : h.country}</td>
                                <td style="padding:8px; color:#555;">${new Date(h.created_at).toLocaleTimeString()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    lucide.createIcons();
}



// ── Prospecting ───────────────────────────────────────────────────────────────
let prospectsCache = [];

async function loadProspects() {
  try { prospectsCache = await (await fetch('/api/prospects')).json(); } catch (e) { prospectsCache = []; }
  if (currentLeadTab === 'prospects') renderLeads();
}

async function analyseProspect() {
  const url = document.getElementById('prospect-url').value.trim();
  const status = document.getElementById('prospect-status');
  if (!url) { status.textContent = 'Paste a website address first.'; return; }
  status.textContent = 'Reading their site…';
  status.style.color = '#888';
  try {
    const r = await (await fetch('/api/prospects/analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    })).json();
    if (r.error) { status.textContent = r.error; status.style.color = '#ff6b6b'; return; }
    status.textContent = `Analysed ${r.business_name || url}.`;
    status.style.color = '#35c66b';
    document.getElementById('prospect-url').value = '';
    loadProspects();
  } catch (e) { status.textContent = e.message; status.style.color = '#ff6b6b'; }
}

async function draftProspect(id) {
  const box = document.getElementById('pdraft-' + id);
  box.innerHTML = '<span style="color:#888;font-size:12px;">Writing…</span>';
  const r = await (await fetch(`/api/prospects/${id}/draft`, { method: 'POST' })).json();
  if (r.error) { box.innerHTML = `<span style="color:#ff6b6b;font-size:12px;">${r.error}</span>`; return; }
  box.innerHTML = `
    <div style="border:1px solid #333;border-radius:8px;padding:12px;background:#0d0d0f;margin-top:10px;">
      <input id="pto-${id}" placeholder="their@email.com" value="${r.contact_email || ''}"
        style="width:100%;background:#141416;border:1px solid #333;color:#fff;padding:8px;border-radius:6px;margin-bottom:8px;">
      <input id="psubj-${id}" value="${String(r.subject || '').replace(/"/g, '&quot;')}"
        style="width:100%;background:#141416;border:1px solid #333;color:#fff;padding:8px;border-radius:6px;margin-bottom:8px;">
      <textarea id="pbody-${id}" rows="9"
        style="width:100%;background:#141416;border:1px solid #333;color:#ddd;padding:8px;border-radius:6px;font-family:inherit;">${r.body || ''}</textarea>
      <div style="display:flex;gap:8px;margin-top:8px;align-items:center;">
        <button class="btn btn-sm" onclick="sendProspect(${id})">Approve &amp; send</button>
        <button class="btn btn-sm btn-outline" onclick="draftProspect(${id})">Rewrite</button>
        <span style="font-size:11px;color:#777;">An unsubscribe line is added automatically.</span>
      </div>
    </div>`;
}

async function sendProspect(id) {
  const to = document.getElementById('pto-' + id).value.trim();
  const subject = document.getElementById('psubj-' + id).value;
  const body = document.getElementById('pbody-' + id).value;
  const box = document.getElementById('pdraft-' + id);
  const r = await (await fetch(`/api/prospects/${id}/send`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, subject, body })
  })).json();
  if (r.sent) { box.innerHTML = '<span style="color:#35c66b;font-size:12px;">Sent.</span>'; showToast('Outreach sent.'); loadProspects(); }
  else box.innerHTML = `<span style="color:#ffb648;font-size:12px;">Not sent: ${r.reason || r.error}</span>`;
}



// Jumps straight to the outreach workflow from the sidebar. It lives inside the
// leads panel, but it is a daily task in its own right and was undiscoverable as
// the fifth button in a tab row.
function openProspecting() {
  showSection('leads');
  switchLeadTab('prospects');
  document.getElementById('topbar-title').textContent = 'Find Clients';
  document.getElementById('topbar-sub').textContent = 'Search for businesses, audit their site, and send outreach';
  loadProspects();
}

async function discoverProspects() {
  const place = document.getElementById('disc-place').value.trim();
  const category = document.getElementById('disc-cat').value;
  const out = document.getElementById('disc-results');
  if (!place) { out.innerHTML = '<span style="color:#ffb648;font-size:12px;">Enter a city.</span>'; return; }
  out.innerHTML = '<span style="color:#888;font-size:12px;">Searching OpenStreetMap… this can take 30s.</span>';
  try {
    const r = await (await fetch(`/api/prospects/discover?category=${encodeURIComponent(category)}&place=${encodeURIComponent(place)}`)).json();
    if (r.error) { out.innerHTML = `<span style="color:#ff6b6b;font-size:12px;">${r.error}</span>`; return; }
    const row = (b, hasSite) => `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #222;">
        <div style="min-width:0;">
          <div style="color:#ddd;font-size:13px;">${b.name}</div>
          <div style="font-size:11px;color:#666;">${b.website || b.phone || b.address || 'no contact details'}</div>
        </div>
        ${hasSite
          ? `<button class="btn btn-sm btn-outline" onclick="analyseFromDiscovery('${b.website}')">Audit</button>`
          : `<span style="font-size:11px;color:#fe812e;white-space:nowrap;">no website</span>`}
      </div>`;
    out.innerHTML = `
      <div style="font-size:12px;color:#888;margin:10px 0;">
        ${r.total} found · ${r.withWebsite.length} to audit · ${r.withoutWebsite.length} with no website · ${r.alreadySeen} already seen
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;">
        <div>
          <strong style="color:#00e0ff;font-size:12px;">Has a website — audit and pitch improvements</strong>
          ${r.withWebsite.map(b => row(b, true)).join('') || '<p style="color:#666;font-size:12px;">None new.</p>'}
        </div>
        <div>
          <strong style="color:#fe812e;font-size:12px;">No website — different pitch entirely</strong>
          ${r.withoutWebsite.map(b => row(b, false)).join('') || '<p style="color:#666;font-size:12px;">None new.</p>'}
        </div>
      </div>`;
  } catch (e) { out.innerHTML = `<span style="color:#ff6b6b;font-size:12px;">${e.message}</span>`; }
}

async function analyseFromDiscovery(url) {
  document.getElementById('prospect-url').value = url;
  await analyseProspect();
}

function renderProspects(container) {
  const cats = ['contractors','dentists','clinics','lawyers','realestate','salons','fitness','autoshops','accountants','vets'];
  container.innerHTML = `
    <div style="border:1px solid #333;border-radius:10px;padding:14px;margin-bottom:18px;">
      <strong style="color:#00e0ff;font-size:13px;">Find businesses</strong>
      <p style="color:#777;font-size:12px;margin:4px 0 10px;">
        Open data from OpenStreetMap — free and legal. Coverage is thinner than Google's,
        so run a few cities. Anything already researched is filtered out automatically.
      </p>
      <div style="display:flex;gap:8px;">
        <select id="disc-cat" style="background:#141416;border:1px solid #333;color:#fff;padding:9px;border-radius:8px;">
          ${cats.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
        <input id="disc-place" placeholder="City, e.g. Los Angeles"
          style="flex:1;background:#141416;border:1px solid #333;color:#fff;padding:9px;border-radius:8px;">
        <button class="btn btn-sm" onclick="discoverProspects()">Search</button>
      </div>
      <div id="disc-results"></div>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:6px;">
      <input id="prospect-url" placeholder="Or paste a website directly, e.g. theirbusiness.com"
        style="flex:1;background:#141416;border:1px solid #333;color:#fff;padding:10px;border-radius:8px;">
      <button class="btn btn-sm" onclick="analyseProspect()">Analyse site</button>
    </div>
    <div id="prospect-status" style="font-size:12px;color:#888;margin-bottom:16px;min-height:16px;"></div>
  ` + (prospectsCache.length ? prospectsCache.map(p => `
      <div class="work-item" style="display:block;padding:14px;border:1px solid #333;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;gap:10px;">
          <div>
            <div style="color:#00e0ff;font-weight:700;">${p.business_name || p.website}</div>
            <div style="font-size:12px;color:#888;">${p.website} ${p.industry ? '· ' + p.industry : ''} ${p.contact_email ? '· ' + p.contact_email : '· no email found'}</div>
          </div>
          <span style="font-size:11px;padding:2px 8px;border-radius:4px;height:fit-content;
            background:${p.status === 'sent' ? 'rgba(53,198,107,.12)' : 'rgba(255,255,255,.06)'};
            color:${p.status === 'sent' ? '#35c66b' : '#aaa'};">${p.status}</span>
        </div>
        ${(p.findings || []).length ? `<ul style="margin:10px 0 0;padding-left:18px;color:#bbb;font-size:12.5px;">
          ${(p.findings || []).slice(0, 4).map(f => `<li style="margin-bottom:3px;">${f}</li>`).join('')}
        </ul>` : ''}
        ${p.ai_angle ? `<p style="margin:10px 0 0;font-size:12.5px;color:#fe812e;">AI angle: <span style="color:#ccc;">${p.ai_angle}</span></p>` : ''}
        <div style="margin-top:10px;"><button class="btn btn-sm btn-outline" onclick="draftProspect(${p.id})">Draft outreach</button></div>
        <div id="pdraft-${p.id}"></div>
      </div>`).join('')
    : '<p style="color:var(--text-muted);padding:16px;text-align:center">No prospects yet. Paste a website above.</p>');
}

// ── Inbox ─────────────────────────────────────────────────────────────────────
let inboxCache = [];
let inboxOpenId = null;

async function loadInbox(sync) {
  try {
    const r = await (await fetch('/api/inbox' + (sync ? '?sync=1' : ''))).json();
    inboxCache = r.messages || [];
    window.__inboxConfigured = r.configured;
    window.__inboxMissing = r.missing || [];
    if (currentLeadTab === 'inbox') renderLeads();
    refreshInboxBadge();
  } catch (e) { console.error('inbox load failed', e); }
}

// Polled so a message arriving while another tab is open still surfaces.
async function refreshInboxBadge() {
  try {
    const { unread } = await (await fetch('/api/inbox/unread-count')).json();
    const b = document.getElementById('inbox-badge');
    if (!b) return;
    b.textContent = unread > 99 ? '99+' : String(unread);
    b.style.display = unread > 0 ? 'inline-flex' : 'none';
    // Mirror onto the Inbox tab so the count is visible once inside the panel too.
    const t = document.getElementById('inbox-tab-count');
    if (t) t.textContent = unread > 0 ? `(${unread > 99 ? '99+' : unread})` : '';
  } catch (e) { /* badge is cosmetic; never block on it */ }
}

async function saveInboxSettings() {
  const status = document.getElementById('imap-status');
  const vals = {
    imap_host: document.getElementById('imap_host').value.trim(),
    imap_user: document.getElementById('imap_user').value.trim(),
    imap_password: document.getElementById('imap_password').value
  };
  if (!vals.imap_host || !vals.imap_user || !vals.imap_password) {
    status.textContent = 'All three fields are required.';
    status.style.color = '#ffb648';
    return;
  }
  status.textContent = 'Connecting…';
  status.style.color = '#888';
  for (const [key, value] of Object.entries(vals)) {
    await fetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value })
    });
  }
  // Sync immediately so a wrong password surfaces now, not silently later.
  const r = await (await fetch('/api/inbox?sync=1')).json();
  if (r.configured) {
    status.textContent = 'Connected.';
    status.style.color = '#35c66b';
    loadInbox(true);
  } else {
    status.textContent = 'Saved, but the connection failed. Check the mailbox password.';
    status.style.color = '#ff6b6b';
  }
}

async function openInboxMessage(id) {
  const m = inboxCache.find(x => x.id === id);
  if (!m) return;
  if (m.is_read === '0') {
    m.is_read = '1';
    fetch(`/api/inbox/${id}/read`, { method: 'POST' }).then(refreshInboxBadge);
  }
  // Same full reader the leads use, so "open a message" means one thing here.
  openLead({
    id: 'inbox-' + m.id,
    name: m.from_name || m.from_email,
    email: m.from_email,
    budget: null,
    country: null,
    created_at: m.received_at,
    project_scope: `Subject: ${m.subject || '(no subject)'}\n\n${m.body || ''}`,
    triage: { verdict: m.triage_verdict, reasons: [] }
  }, true);
  renderLeads();
}

function renderInbox(container) {
  if (!window.__inboxConfigured) {
    // Configurable here rather than only in Render, matching how the AI API keys
    // already work. The password is filtered out of the public settings response.
    container.innerHTML = `
      <div style="padding:18px;border:1px solid #333;border-radius:10px;max-width:520px;">
        <div style="color:#ffb648;margin-bottom:6px;font-weight:700;">Inbox not connected</div>
        <p style="color:#888;font-size:13px;margin:0 0 16px;">
          Connect the hello@jomiez.com mailbox and mail sent to it appears here.
          Use the <strong>mailbox</strong> password from hPanel &rarr; Emails, not your Hostinger account password.
        </p>
        <label style="display:block;font-size:12px;color:#aaa;margin-bottom:4px;">IMAP host</label>
        <input id="imap_host" value="imap.hostinger.com" style="width:100%;background:#141416;border:1px solid #333;color:#fff;padding:9px;border-radius:6px;margin-bottom:10px;">
        <label style="display:block;font-size:12px;color:#aaa;margin-bottom:4px;">Email address</label>
        <input id="imap_user" placeholder="hello@jomiez.com" style="width:100%;background:#141416;border:1px solid #333;color:#fff;padding:9px;border-radius:6px;margin-bottom:10px;">
        <label style="display:block;font-size:12px;color:#aaa;margin-bottom:4px;">Mailbox password</label>
        <input id="imap_password" type="password" style="width:100%;background:#141416;border:1px solid #333;color:#fff;padding:9px;border-radius:6px;margin-bottom:14px;">
        <button class="btn btn-sm" onclick="saveInboxSettings()">Connect inbox</button>
        <span id="imap-status" style="margin-left:10px;font-size:12px;color:#888;"></span>
      </div>`;
    return;
  }
  const unread = inboxCache.filter(m => m.is_read === '0').length;
  container.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;">
      <strong style="color:#00e0ff;">Inbox</strong>
      <span style="color:#777;font-size:12px;">${inboxCache.length} messages · ${unread} unread</span>
      <span style="flex:1"></span>
      <button class="btn btn-sm btn-outline" onclick="loadInbox(true)">Check for new mail</button>
    </div>` + (inboxCache.length ? inboxCache.map(m => {
      const open = inboxOpenId === m.id;
      const isUnread = m.is_read === '0';
      return `
      <div class="work-item" style="display:block;padding:14px;border:1px solid ${isUnread ? '#00e0ff44' : '#333'};
           margin-bottom:10px;background:${isUnread ? 'rgba(0,224,255,.04)' : 'transparent'};cursor:pointer;"
           onclick="openInboxMessage(${m.id})">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
          <div style="min-width:0;">
            <div style="color:${isUnread ? '#fff' : '#bbb'};font-weight:${isUnread ? '700' : '500'};">
              ${isUnread ? '<span style="color:#ff3b3b;">●</span> ' : ''}${m.subject || '(no subject)'}
            </div>
            <div style="font-size:12px;color:#888;margin-top:2px;">
              ${m.from_name || ''} &lt;${m.from_email || 'unknown'}&gt;
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            ${m.triage_verdict === 'junk'
              ? '<span style="background:rgba(255,107,107,.12);color:#ff6b6b;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">Likely junk</span>'
              : ''}
            <div style="font-size:11px;color:#555;margin-top:4px;">
              ${m.received_at ? new Date(m.received_at).toLocaleString() : ''}
            </div>
          </div>
        </div>
        ${open ? `<pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;color:#ddd;
          margin-top:12px;padding-top:12px;border-top:1px solid #333;">${
            (m.body || '(empty message)').replace(/[<>]/g, c => c === '<' ? '&lt;' : '&gt;')
          }</pre>` : `<div style="font-size:12px;color:#666;margin-top:6px;">
            ${String(m.body || '').replace(/\s+/g, ' ').slice(0, 110)}… <span style="color:#00e0ff;">click to read</span>
          </div>`}
      </div>`;
    }).join('') : `<p style="color:var(--text-muted);padding:20px;text-align:center">No mail yet. Hit "Check for new mail".</p>`);
}

function leadBadge(triage) {
  if (!triage) return '';
  const map = {
    junk:    ['#ff6b6b', 'rgba(255,107,107,.12)', 'Likely junk'],
    unsure:  ['#ffb648', 'rgba(255,182,72,.12)', 'Unsure'],
    genuine: ['#35c66b', 'rgba(53,198,107,.12)', 'Genuine']
  };
  const [c, bg, label] = map[triage.verdict] || map.unsure;
  return `<span title="${(triage.reasons || []).join('; ').replace(/"/g, '&quot;')}"
    style="background:${bg};color:${c};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">${label}</span>`;
}

function renderLeads() {
  const container = document.getElementById('leads-container');
  if (!container) return;

  if (currentLeadTab === 'prospects') { renderProspects(container); return; }
  if (currentLeadTab === 'inbox') { renderInbox(container); return; }

  if (currentLeadTab === 'memory') {
    const data = memoryCache;
    container.innerHTML = data.length ? data.map(m => `
      <div class="work-item" style="padding:15px; border:1px solid #333; margin-bottom:10px;">
        <div class="work-info">
          <div class="work-title" style="color:#ff00ff;">[${m.insight_type.toUpperCase()}] ${m.key}</div>
          <p style="margin-top:8px; font-size:14px;">${m.value}</p>
          <div style="font-size:11px; color:#555; margin-top:5px;">Stored: ${new Date(m.created_at).toLocaleString()}</div>
        </div>
        <div class="work-actions">
          <button class="btn btn-danger btn-sm" onclick="deleteMemory(${m.id})">Delete</button>
        </div>
      </div>`).join('') : `<p style="color:var(--text-muted);padding:20px;text-align:center">No memory stored yet.</p>`;
    return;
  }

  // Cold SEO pitches are separated from real enquiries rather than deleted — the
  // scoring is deliberately conservative, so anything it gets wrong stays reachable.
  const inbox = leadsCache.filter(l => (l.triage || {}).verdict !== 'junk');
  const junk  = leadsCache.filter(l => (l.triage || {}).verdict === 'junk');
  const showing = leadsShowJunk ? junk : inbox;

  const tabs = `
    <div style="display:flex;gap:8px;margin-bottom:16px;align-items:center;">
      <button class="btn btn-sm ${leadsShowJunk ? 'btn-outline' : ''}" onclick="setLeadFolder(false)">Inbox (${inbox.length})</button>
      <button class="btn btn-sm ${leadsShowJunk ? '' : 'btn-outline'}" onclick="setLeadFolder(true)">Junk (${junk.length})</button>
      <span style="flex:1"></span>
      <span id="mail-status" style="font-size:11px;color:#777;"></span>
      <button class="btn btn-sm btn-outline" style="font-size:11px;padding:4px 10px;"
        onclick="sendMailTest()">Send test email</button>
    </div>`;

  const list = showing.length ? showing.map(l => {
    const dated = l.created_at && l.created_at !== 'unknown'
      ? new Date(l.created_at).toLocaleString()
      : 'date not recorded';
    const scope = String(l.project_scope || '');
    const isLong = scope.length > 220;
    return `
      <div class="work-item" style="padding:15px; border:1px solid #333; margin-bottom:10px; display:block;">
        <div style="display:flex; justify-content:space-between; align-items:start; gap:10px;">
          <div class="work-title" style="color:#00e0ff;">${l.name || 'Anonymous'}</div>
          <div style="display:flex;gap:6px;align-items:center;">
            ${leadBadge(l.triage)}
            <span style="background:rgba(0,224,255,0.1); color:#00e0ff; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:700;">
              ${l.country === 'Localhost' ? 'Localhost' : (l.country || 'Global')}
            </span>
          </div>
        </div>
        <div style="font-size:12px; color:#aaa; margin-top:4px;">${l.email || 'no email'} | Budget: ${l.budget || 'not given'}</div>

        <p style="margin-top:8px; font-size:13px; white-space:pre-wrap;">${
          isLong ? scope.slice(0, 220) + '…' : scope
        }</p>
        <button class="btn btn-sm btn-outline" onclick="openLead(${l.id})">Open message</button>

        <div style="font-size:11px; color:#555; margin-top:6px;">Captured: ${dated} | IP: ${l.ip_address || 'Hidden'}</div>

        <div id="reply-${l.id}" style="margin-top:12px;"></div>

        <div class="work-actions" style="margin-top:12px;display:flex;gap:8px;">
          <button class="btn btn-sm" onclick="draftReply(${l.id})">Draft reply</button>
          <button class="btn btn-danger btn-sm" onclick="deleteLead(${l.id})">Delete</button>
        </div>
      </div>`;
  }).join('') : `<p style="color:var(--text-muted);padding:20px;text-align:center">Nothing in ${leadsShowJunk ? 'junk' : 'the inbox'}.</p>`;

  container.innerHTML = tabs + list;
  refreshMailStatus();
}

function setLeadFolder(showJunk) { leadsShowJunk = showJunk; renderLeads(); }

// Opens a lead in a full-screen reader.
//
// This replaced an inline "view full message" toggle that only appeared on
// messages over 220 characters — so on a short enquiry there was no way to open
// anything at all, and the panel still looked read-only. Every lead is now
// openable, and the whole message is shown without truncation.
function openLead(id, isObject) {
  const l = isObject ? id : leadsCache.find(x => x.id === id);
  if (!l) return;
  closeLead();

  const esc = (v) => String(v == null ? '' : v).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const dated = l.created_at && l.created_at !== 'unknown'
    ? new Date(l.created_at).toLocaleString() : 'date not recorded';
  const t = l.triage || {};

  const overlay = document.createElement('div');
  overlay.id = 'lead-modal';
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;
    display:flex;align-items:center;justify-content:center;padding:24px;`;
  overlay.onclick = (e) => { if (e.target === overlay) closeLead(); };

  overlay.innerHTML = `
    <div style="background:#0f0f12;border:1px solid #333;border-radius:14px;width:min(760px,100%);
         max-height:88vh;display:flex;flex-direction:column;overflow:hidden;">
      <div style="padding:18px 20px;border-bottom:1px solid #262626;display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
        <div style="min-width:0;">
          <div style="color:#00e0ff;font-size:18px;font-weight:700;">${esc(l.name) || 'Anonymous'}</div>
          <div style="color:#999;font-size:13px;margin-top:3px;">${esc(l.email) || 'no email'}</div>
          <div style="color:#666;font-size:12px;margin-top:6px;">
            Budget: ${esc(l.budget) || 'not given'} &nbsp;·&nbsp; ${esc(l.country) || 'Global'} &nbsp;·&nbsp; ${dated}
          </div>
        </div>
        <button class="btn btn-sm btn-outline" onclick="closeLead()">Close</button>
      </div>

      ${t.verdict ? `<div style="padding:10px 20px;background:${t.verdict === 'junk' ? 'rgba(255,107,107,.08)' : 'rgba(53,198,107,.06)'};
        border-bottom:1px solid #262626;font-size:12px;color:${t.verdict === 'junk' ? '#ff6b6b' : '#35c66b'};">
        ${t.verdict === 'junk' ? 'Looks like cold outreach' : 'Looks genuine'} — ${esc((t.reasons || []).join('; ')) || 'no strong signals'}
      </div>` : ''}

      <div style="padding:20px;overflow-y:auto;flex:1;">
        <pre style="white-space:pre-wrap;word-break:break-word;font-family:inherit;
             font-size:14px;line-height:1.65;color:#ddd;margin:0;">${esc(l.project_scope) || '(empty message)'}</pre>
      </div>

      <div style="padding:14px 20px;border-top:1px solid #262626;">
        <div id="reply-modal-${l.id}"></div>
        <div style="display:flex;gap:8px;margin-top:10px;">
          ${String(l.id).startsWith('inbox-') ? '' : `<button class="btn btn-sm" onclick="draftReply(${l.id}, true)">Draft reply</button>`}
          <button class="btn btn-sm btn-outline" onclick="closeLead()">Done</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  document.addEventListener('keydown', escCloseLead);
}

function escCloseLead(e) { if (e.key === 'Escape') closeLead(); }

function closeLead() {
  const m = document.getElementById('lead-modal');
  if (m) m.remove();
  document.removeEventListener('keydown', escCloseLead);
}

async function refreshMailStatus() {
  const el = document.getElementById('mail-status');
  if (!el) return;
  try {
    const s = await (await fetch('/api/leads/mail-status')).json();
    window.__mailStatus = s;
    el.textContent = s.configured
      ? `Sending as ${s.from} · mode: ${s.mode}`
      : `Email not configured — missing ${(s.missing || []).join(', ')}`;
    el.style.color = s.configured ? '#35c66b' : '#ffb648';
  } catch (e) { el.textContent = ''; }
}

// The first real send should never be the first test. This exercises the same
// path a lead reply takes — key, from-address, domain verification — but aimed at
// the owner.
async function sendMailTest() {
  const el = document.getElementById('mail-status');
  const suggested = (window.__mailStatus && window.__mailStatus.notifyTo) || '';
  const to = prompt('Send a test email to which address?', suggested);
  if (!to) return;
  if (el) { el.textContent = 'Sending test…'; el.style.color = '#888'; }
  try {
    const r = await (await fetch('/api/leads/mail-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to })
    })).json();
    if (el) {
      el.textContent = r.sent ? `Test sent to ${to} — check that inbox` : `Test failed: ${r.reason}`;
      el.style.color = r.sent ? '#35c66b' : '#ff6b6b';
    }
  } catch (e) {
    if (el) { el.textContent = `Test failed: ${e.message}`; el.style.color = '#ff6b6b'; }
  }
}

async function draftReply(id, inModal) {
  const box = document.getElementById((inModal ? 'reply-modal-' : 'reply-') + id);
  if (!box) return;
  box.innerHTML = `<div style="color:#888;font-size:12px;">Drafting…</div>`;
  try {
    const r = await (await fetch(`/api/leads/${id}/draft`, { method: 'POST' })).json();
    if (!r.drafted) {
      box.innerHTML = `<div style="color:#ffb648;font-size:12px;">${r.reason || r.error || 'Could not draft.'}</div>`;
      return;
    }
    box.innerHTML = `
      <div style="border:1px solid #333;border-radius:8px;padding:12px;background:#0d0d0f;">
        <input id="subj-${id}" value="${String(r.subject).replace(/"/g, '&quot;')}"
          style="width:100%;background:#141416;border:1px solid #333;color:#fff;padding:8px;border-radius:6px;margin-bottom:8px;">
        <textarea id="body-${id}" rows="9"
          style="width:100%;background:#141416;border:1px solid #333;color:#ddd;padding:8px;border-radius:6px;font-family:inherit;">${r.body}</textarea>
        <div style="display:flex;gap:8px;margin-top:8px;align-items:center;">
          <button class="btn btn-sm" onclick="sendReply(${id}, false, ${!!inModal})">Approve &amp; send</button>
          <button class="btn btn-sm btn-outline" onclick="draftReply(${id}, ${!!inModal})">Redraft</button>
          <span style="font-size:11px;color:#777;">Edit anything before sending — your version is what goes out.</span>
        </div>
      </div>`;
  } catch (e) {
    box.innerHTML = `<div style="color:#ff6b6b;font-size:12px;">${e.message}</div>`;
  }
}

async function sendReply(id, force, inModal) {
  const subject = document.getElementById('subj-' + id).value;
  const body = document.getElementById('body-' + id).value;
  const box = document.getElementById((inModal ? 'reply-modal-' : 'reply-') + id);
  const res = await fetch(`/api/leads/${id}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subject, body, force: !!force })
  });
  const r = await res.json();
  if (res.status === 409) {
    // Triage thinks this is cold outreach. Say so plainly and let the owner override.
    if (confirm(`This looks like junk, not a client:\n\n${(r.triage.reasons || []).join('\n')}\n\nSend anyway?`)) {
      return sendReply(id, true, inModal);
    }
    return;
  }
  if (r.sent) {
    box.innerHTML = `<div style="color:#35c66b;font-size:12px;">Sent.</div>`;
    showToast('Reply sent.');
  } else {
    box.innerHTML = `<div style="color:#ffb648;font-size:12px;">Not sent: ${r.reason || r.error}</div>`;
  }
}

async function deleteLead(id) {
  if (!confirm('Delete this inquiry?')) return;
  await fetch(`/api/leads/${id}`, { method: 'DELETE' });
  loadLeads();
  showToast('Lead removed.');
}

async function deleteMemory(id) {
  if (!confirm('Forget this memory?')) return;
  await fetch(`/api/memory/${id}`, { method: 'DELETE' });
  loadMemory();
  showToast('Memory forgotten.');
}

// ===== RESUME LOGIC =====

async function uploadResume() {
  const fileInput = document.getElementById('resume_file');
  if (!fileInput.files[0]) return;

  const btn = document.querySelector('#panel-resume .btn-primary');
  showToast('Uploading Resume...');
  
  try {
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    const res = await fetch('/api/resume/upload', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      showToast('✓ Resume uploaded and active!');
      const status = document.getElementById('active-resume-status');
      if (status) status.textContent = 'Active File: ' + data.url.split('/').pop();
      loadSettings(); 
    } else {
      showToast('✗ Upload failed: ' + data.error);
    }
  } catch (e) {
    showToast('✗ Upload error');
  }
}


async function deleteFaq(id) {
  if(!confirm('Delete this FAQ?')) return;
  await fetch(`/api/faqs/${id}`, { method: 'DELETE' });
  await loadFaqs();
  showToast('FAQ deleted');
}

// ===== MARQUEE CRUD =====

async function loadMarquee() {
  try {
    const res = await fetch('/api/marquee');
    marqueeCache = await res.json();
    renderMarquee();
  } catch(e) { console.error('Failed loading marquee', e); }
}

function renderMarquee() {
  const container = document.getElementById('marquee-list');
  if(!container) return;
  if(marqueeCache.length === 0) {
    container.innerHTML = `<p style="padding:15px;color:#6b7280;text-align:center">No images yet. Add one!</p>`;
    return;
  }
  container.innerHTML = marqueeCache.map(m => `
    <div style="background:#f9fafb;padding:12px;border:1px solid #e5e7eb;border-radius:6px;display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:10px">
      <div style="flex-grow:1;display:flex;align-items:center;gap:15px;min-width:0">
        <div style="width:60px;height:40px;background:#fff;border:1px solid #ddd;border-radius:4px;display:flex;align-items:center;justify-content:center;overflow:hidden">
            ${m.image_url ? `<img src="${m.image_url}" style="max-width:100%;max-height:100%;object-fit:cover">` : `<span style="font-size:10px;color:#aaa">No img</span>`}
        </div>
        <div style="font-size:12px;color:#6b7280">Order: ${m.sort_order}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn btn-outline btn-sm" onclick="openMarqueeModal(${m.id})">Edit</button>
        <button class="btn btn-sm" style="background:#dc3545;color:#fff;border:none" onclick="deleteMarquee(${m.id})">Delete</button>
      </div>
    </div>
  `).join('');
}

function openMarqueeModal(id) {
  document.getElementById('marquee-id').value = '';
  document.getElementById('marquee-image').value = '';
  document.getElementById('marquee-order').value = '0';

  if (id) {
    const m = marqueeCache.find(x => x.id === id);
    if (m) {
      document.getElementById('marquee-id').value = m.id;
      document.getElementById('marquee-image').value = m.image_url || '';
      document.getElementById('marquee-order').value = m.sort_order || 0;
    }
  }
  document.getElementById('modal-marquee').classList.add('active');
}

function closeMarqueeModal() {
  document.getElementById('modal-marquee').classList.remove('active');
}

async function saveMarquee() {
  const id = document.getElementById('marquee-id').value;
  const payload = {
    image_url: document.getElementById('marquee-image').value,
    sort_order: parseInt(document.getElementById('marquee-order').value) || 0
  };
  const url = id ? `/api/marquee/${id}` : '/api/marquee';
  const method = id ? 'PUT' : 'POST';

  await fetch(url, { method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
  closeMarqueeModal();
  await loadMarquee();
  showToast(id ? 'Updated image' : 'Added image');
}

async function deleteMarquee(id) {
  if(!confirm('Delete this image?')) return;
  await fetch(`/api/marquee/${id}`, { method: 'DELETE' });
  await loadMarquee();
  showToast('Image deleted');
}

// ===== TESTIMONIALS CRUD =====

async function loadTestimonials() {
  try {
    const res = await fetch('/api/testimonials');
    testimonialsCache = await res.json();
    renderTestimonials();
  } catch(e) { console.error('Failed loading testimonials', e); }
}

function renderTestimonials() {
  const container = document.getElementById('testimonials-list');
  if(!container) return;
  if(testimonialsCache.length === 0) {
    container.innerHTML = `<p style="padding:15px;color:#6b7280;text-align:center">No testimonials yet. Add one!</p>`;
    return;
  }
  container.innerHTML = testimonialsCache.map(t => `
    <div style="background:#f9fafb;padding:12px;border:1px solid #e5e7eb;border-radius:6px;display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:10px">
      <div style="flex-grow:1;min-width:0;display:flex;gap:15px;align-items:center">
        <div style="width:40px;height:40px;border-radius:50%;overflow:hidden;background:#fff;border:1px solid #eee;flex-shrink:0">
           ${t.author_image ? `<img src="${t.author_image}" style="width:100%;height:100%;object-fit:cover">` : ''}
        </div>
        <div>
          <div style="font-weight:600;font-size:14px;color:#111827">${t.author_name || 'Anonymous'}</div>
          <div style="font-size:12px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:300px">${t.message || ''}</div>
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn btn-outline btn-sm" onclick="openTestimonialModal(${t.id})">Edit</button>
        <button class="btn btn-sm" style="background:#dc3545;color:#fff;border:none" onclick="deleteTestimonial(${t.id})">Delete</button>
      </div>
    </div>
  `).join('');
}

function openTestimonialModal(id) {
  document.getElementById('test-id').value = '';
  document.getElementById('test-name').value = '';
  document.getElementById('test-role').value = '';
  document.getElementById('test-image').value = '';
  document.getElementById('test-msg').value = '';
  document.getElementById('test-rating').value = '5';
  document.getElementById('test-order').value = '0';

  if (id) {
    const t = testimonialsCache.find(x => x.id === id);
    if (t) {
      document.getElementById('test-id').value = t.id;
      document.getElementById('test-name').value = t.author_name || '';
      document.getElementById('test-role').value = t.author_role || '';
      document.getElementById('test-image').value = t.author_image || '';
      document.getElementById('test-msg').value = t.message || '';
      document.getElementById('test-rating').value = t.rating || 5;
      document.getElementById('test-order').value = t.sort_order || 0;
    }
  }
  document.getElementById('modal-testimonial').classList.add('active');
}

function closeTestimonialModal() {
  document.getElementById('modal-testimonial').classList.remove('active');
}

async function saveTestimonial() {
  const id = document.getElementById('test-id').value;
  const payload = {
    author_name: document.getElementById('test-name').value,
    author_role: document.getElementById('test-role').value,
    author_image: document.getElementById('test-image').value,
    message: document.getElementById('test-msg').value,
    rating: parseInt(document.getElementById('test-rating').value) || 5,
    sort_order: parseInt(document.getElementById('test-order').value) || 0
  };
  const url = id ? `/api/testimonials/${id}` : '/api/testimonials';
  const method = id ? 'PUT' : 'POST';

  await fetch(url, { method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
  closeTestimonialModal();
  await loadTestimonials();
  showToast(id ? 'Updated testimonial' : 'Added testimonial');
}

async function deleteTestimonial(id) {
  if(!confirm('Delete this testimonial?')) return;
  await fetch(`/api/testimonials/${id}`, { method: 'DELETE' });
  await loadTestimonials();
  showToast('Testimonial deleted');
}

// ===== COUNTERS LOGIC =====
let countersCache = [];
async function loadCounters() {
  try {
    const res = await fetch('/api/counters');
    countersCache = await res.json();
    renderCounters();
  } catch(e) { console.error('Failed loading counters', e); }
}

function renderCounters() {
  const container = document.getElementById('counters-list');
  if(!container) return;
  if(countersCache.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);padding:20px 0;text-align:center;">No counters yet. Click "+ Add Counter" to get started.</p>';
    return;
  }
  container.innerHTML = countersCache.map(c => `
    <div style="background:#f9fafb;padding:12px;border:1px solid #e5e7eb;border-radius:6px;display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:10px">
      <div style="flex-grow:1;min-width:0">
        <div style="font-weight:600;font-size:16px;color:#111827;">
          ${c.value}${c.suffix || ''}
        </div>
        <div style="font-size:12px;color:#6b7280;">
          ${c.label || '(no label)'}
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn btn-outline btn-sm" onclick="openCounterModal(${c.id})">Edit</button>
        <button class="btn btn-sm" style="background:#dc3545;color:#fff;border:none" onclick="deleteCounter(${c.id})">Delete</button>
      </div>
    </div>
  `).join('');
}

function openCounterModal(id) {
  document.getElementById('counter-id').value = '';
  document.getElementById('counter-label').value = '';
  document.getElementById('counter-value').value = '';
  document.getElementById('counter-suffix').value = '';
  document.getElementById('counter-order').value = '0';

  if (id) {
    const c = countersCache.find(x => x.id === id);
    if (c) {
      document.getElementById('counter-id').value = c.id;
      document.getElementById('counter-label').value = c.label || '';
      document.getElementById('counter-value').value = c.value || '';
      document.getElementById('counter-suffix').value = c.suffix || '';
      document.getElementById('counter-order').value = c.sort_order || 0;
    }
  }
  document.getElementById('modal-counter').classList.add('active');
}

function closeCounterModal() {
  document.getElementById('modal-counter').classList.remove('active');
}

async function saveCounter() {
  const id = document.getElementById('counter-id').value;
  const payload = {
    label: document.getElementById('counter-label').value,
    value: document.getElementById('counter-value').value,
    suffix: document.getElementById('counter-suffix').value,
    sort_order: parseInt(document.getElementById('counter-order').value) || 0
  };

  const url = id ? '/api/counters/' + id : '/api/counters';
  const method = id ? 'PUT' : 'POST';

  await fetch(url, {
    method,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload)
  });

  closeCounterModal();
  await loadCounters();
  showToast(id ? '✓ Counter updated' : '✓ Counter added');
}

async function deleteCounter(id) {
  if(!confirm('Delete this counter?')) return;
  await fetch('/api/counters/' + id, { method: 'DELETE' });
  await loadCounters();
  showToast('Counter deleted');
}

// Add to DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    loadCounters();
});

// ----------------------------------------------------
// AUTONOMOUS ENGINEERING AGENT (NEMOTRON) LOGIC
// ----------------------------------------------------

async function executeAgentCommand() {
  const cmd = document.getElementById('agent_command').value.trim();
  if(!cmd) return showToast('Please enter a command for the agent.');
  
  const logsEl = document.getElementById('agent_logs');
  const btn = document.querySelector('[onclick="executeAgentCommand()"]');
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader"></i> Running...';
  
  logsEl.innerHTML = '[System] Booting Nemotron Autonomous Engine...<br>[System] Committing current state for safe Undo...<br>[System] Sending command to Nemotron 3 Ultra (550B)...<br>';
  
  try {
    const res = await fetch('/api/agent/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd })
    });
    
    const data = await res.json();
    if(data.success) {
      logsEl.innerHTML += '<br>[Nemotron] Task completed successfully.<br>[Summary] ' + (data.summary || 'Files updated.');
      showToast('Agent completed task.');
    } else {
      logsEl.innerHTML += '<br>[Error] ' + (data.error || 'Unknown error');
      showToast('Agent encountered an error.');
    }
  } catch(e) {
    logsEl.innerHTML += '<br>[Fatal Error] ' + e.message;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="play"></i> Execute Agent';
    if(window.lucide) window.lucide.createIcons();
  }
}

async function undoLastAgentAction() {
  if(!confirm('Are you sure you want to rollback the repository to the state BEFORE the last Agent action?')) return;
  
  const logsEl = document.getElementById('agent_logs');
  logsEl.innerHTML += '<br>[System] Initiating Git Rollback...';
  
  try {
    const res = await fetch('/api/agent/undo', { method: 'POST' });
    const data = await res.json();
    if(data.success) {
      logsEl.innerHTML += '<br>[System] Rollback successful. Codebase restored.';
      showToast('Codebase rolled back successfully.');
    } else {
      logsEl.innerHTML += '<br>[Error] Rollback failed: ' + (data.error || 'Unknown error');
      showToast('Rollback failed.');
    }
  } catch(e) {
    logsEl.innerHTML += '<br>[Fatal Error] ' + e.message;
  }
}
