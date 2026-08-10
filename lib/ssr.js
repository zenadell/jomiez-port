const { JSDOM } = require('jsdom');

/**
 * Server-side content rendering.
 *
 * The pages in this repo are a Webflow export whose collection lists were
 * originally hydrated only in the browser by js/dynamic.js. That meant anything
 * that does not run JavaScript — Google's raw fetch, GPTBot, ClaudeBot,
 * PerplexityBot, link unfurlers — saw the *unedited template* markup rather than
 * Jomiez content. This module fills the same slots on the server so the HTML that
 * leaves the origin already contains the real content.
 *
 * js/dynamic.js still runs and rewrites these nodes with identical values; that is
 * intentional and harmless. It stays authoritative for anything interactive.
 */

// A populated slot must drop `skeleton`, or the shimmer background paints over the
// text we just rendered. Setting textContent also removes any child
// <div class="skeleton"> placeholder the export used to reserve the space.
//
// The inline `style` is deliberately LEFT ALONE. Webflow's IX2 entrance animations
// start elements at opacity:0 and reveal them on load; stripping that made
// server-rendered text flash in unstyled before the page had initialised.
function setText(el, value) {
  if (!el || value == null || value === '') return false;
  el.classList.remove('skeleton');
  el.textContent = String(value);
  return true;
}

function setImage(container, url, alt) {
  if (!container || !url) return false;
  container.classList.remove('skeleton');
  container.innerHTML = '';
  const img = container.ownerDocument.createElement('img');
  img.setAttribute('src', url);
  img.setAttribute('alt', alt || '');
  img.setAttribute('loading', 'lazy');
  img.setAttribute('style', 'width:100%;height:100%;object-fit:cover;display:block;border-radius:12px;');
  container.appendChild(img);
  return true;
}

/**
 * Webflow collection lists ship exactly one item in the export, used as a template.
 * Clone it once per record and drop the original.
 */
function renderCollection(doc, listSelector, itemSelector, records, fill) {
  let rendered = 0;
  doc.querySelectorAll(listSelector).forEach((list) => {
    const template = list.querySelector(itemSelector);
    if (!template) return;
    if (!records.length) { list.innerHTML = ''; return; }
    const frag = doc.createDocumentFragment();
    records.forEach((record) => {
      const node = template.cloneNode(true);
      fill(node, record);
      frag.appendChild(node);
      rendered++;
    });
    list.innerHTML = '';
    list.appendChild(frag);
  });
  return rendered;
}

function renderContent(html, data = {}) {
  const { settings = {}, faqs = [], testimonials = [], services = [], brands = [],
          skills = [], counters = [], isHome = false } = data;
  // js/dynamic.js shows only the first 4 projects on the home page. Match it, so a
  // crawler and a visitor see the same list rather than 9 vs 4.
  const works = isHome ? (data.works || []).slice(0, 4) : (data.works || []);

  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const stats = {};

  // --- FAQs -----------------------------------------------------------------
  // The export hardcodes 8 accordion blocks. Fill as many as we have records for
  // and delete the remainder, otherwise the leftover template questions (the
  // near-duplicate "complete website design" set) stay visible to crawlers.
  const faqWraps = Array.from(doc.querySelectorAll('.faq-question-wrapper'));
  faqWraps.forEach((wrap, i) => {
    const faq = faqs[i];
    if (!faq) { wrap.remove(); return; }
    setText(wrap.querySelector('.faq-question-text'), faq.question);
    setText(wrap.querySelector('.faq-answer-text'), faq.answer);
  });
  stats.faqs = Math.min(faqs.length, faqWraps.length);

  // --- Testimonials ---------------------------------------------------------
  // With no records the entire section comes out, along with its nav link. The
  // alternative is shipping the template's "Lin & Co" quotes, which is what made
  // the site read as an unedited template in the first place.
  // Two different layouts ship in this export: the home page uses a Webflow slider
  // (.section-testslider > .testslider-slide), the testimonials page uses a plain
  // card grid (.testimonials-card-wrap > .testimonials-card).
  const fillCard = (node, t) => {
    setText(node.querySelector('.testimonials-summery'), t.message);
    setText(node.querySelector('.testimonials-information'),
      [t.author_name, t.author_role].filter(Boolean).join(', '));
    const img = node.querySelector('.testimonials-image');
    if (!img) return;
    if (t.author_image) {
      img.classList.remove('skeleton');
      img.setAttribute('src', t.author_image);
      img.setAttribute('alt', `${t.author_name || 'Client'} — Jomiez Innovation client`);
    } else {
      const wrap = img.closest('.testimonials-image-wrap');
      (wrap || img).remove();
    }
  };

  if (!testimonials.length) {
    // Remove the whole section rather than ship the template's "Lin & Co" quotes.
    doc.querySelectorAll('.section-testslider, .testimonials-wrapper').forEach((section) => {
      // Vertical rhythm comes from an inner `.space` (60px top + bottom), and the
      // section that follows opts out of its top padding with `.space.down` because
      // it used to sit right under this one. Dropping this section therefore leaves
      // the next one flush against the section above it — brands ran straight into
      // the FAQ with a 0px gap. Promote it back to a full `.space`.
      const next = section.nextElementSibling;
      const spacer = next && next.querySelector('.space.down');
      if (spacer) spacer.classList.remove('down');
      section.remove();
    });
    stats.testimonials = 0;
  } else {
    stats.testimonials =
      renderCollection(doc, '.testslider-mask', '.testslider-slide', testimonials,
        (slide, t) => fillCard(slide, t)) +
      renderCollection(doc, '.testimonials-card-wrap', '.testimonials-card', testimonials, fillCard);
  }

  // Nav placeholder is filled only when there is a testimonials page worth linking.
  const navLink = testimonials.length
    ? '<a href="/testimonials" class="navbar-nav-link w-nav-link"> Testimonials\n                                </a>'
    : '';

  // --- Works ----------------------------------------------------------------
  stats.works = renderCollection(doc, '.works-list, .work-list', '.work-item', works, (node, work) => {
    const link = node.querySelector('a.work-wrap');
    if (link && work.slug) link.setAttribute('href', `/work/${work.slug}`);
    setText(node.querySelector('.work-name'), work.title);
    setText(node.querySelector('.work-except'), work.description);
    setImage(node.querySelector('.work-image'), work.thumbnail_url,
      `${work.title || 'Project'} — Jomiez Innovation portfolio project`);
  });

  // --- Services -------------------------------------------------------------
  stats.services = renderCollection(doc, '.services-list', '.services-item', services, (node, svc) => {
    const link = node.querySelector('a.services-wrap');
    if (link && svc.slug) link.setAttribute('href', `/services/${svc.slug}`);
    setText(node.querySelector('.services-heading'), svc.title);
    setText(node.querySelector('.services-summery'), svc.description);
    node.querySelectorAll('img.services-image').forEach((img) => {
      if (svc.image_url) {
        img.classList.remove('skeleton');
        img.setAttribute('src', svc.image_url);
        img.setAttribute('alt', `${svc.title || 'Service'} — Jomiez Innovation`);
      }
    });
  });

  // --- About page -----------------------------------------------------------
  // This page shipped ~86 words of crawlable text: everything below the hero was a
  // skeleton waiting on JS. It is the page that establishes who is behind the studio,
  // so it is the one an AI most needs to be able to read.
  //
  // js/dynamic.js rebuilds these nodes on load (splitting the bio into animated
  // 3-word spans, adding skill icons). The text content ends up identical, so the
  // rebuild is invisible — this just makes it exist before JS runs.
  setText(doc.querySelector('.about-hero-heading'), settings.about_hero_heading);

  const aboutText = doc.querySelector('.about-text-wrap');
  if (aboutText && settings.about_me_page_text) {
    aboutText.classList.remove('skeleton');
    aboutText.innerHTML = '';
    const p = doc.createElement('p');
    p.textContent = settings.about_me_page_text;
    aboutText.appendChild(p);
    if (settings.founder_bio) {
      const p2 = doc.createElement('p');
      p2.textContent = settings.founder_bio;
      aboutText.appendChild(p2);
    }
  }

  const skillsGrid = doc.querySelector('.skills-content-wrapper');
  if (skillsGrid && skills.length) {
    skillsGrid.innerHTML = '';
    skills.forEach((s) => {
      const card = doc.createElement('div');
      card.setAttribute('class', 'skills-card');
      const h4 = doc.createElement('h4');
      h4.setAttribute('class', 'skills-name');
      h4.textContent = s.name || s.title || '';
      card.appendChild(h4);
      if (s.description) {
        const t = doc.createElement('div');
        t.setAttribute('class', 'skills-text');
        t.textContent = s.description;
        card.appendChild(t);
      }
      skillsGrid.appendChild(card);
    });
  }

  const counterWrap = doc.querySelector('.counter-wrapper');
  if (counterWrap && counters.length) {
    counterWrap.innerHTML = '';
    counters.forEach((c) => {
      const block = doc.createElement('div');
      block.setAttribute('class', 'counter-wrap');
      const n = doc.createElement('div');
      n.setAttribute('class', 'counter-title');
      n.textContent = `${c.value || ''}${c.suffix || ''}`;
      const l = doc.createElement('div');
      l.setAttribute('class', 'counter-text');
      l.textContent = c.label || '';
      block.appendChild(n);
      block.appendChild(l);
      counterWrap.appendChild(block);
    });
  }

  // --- Brand logos ----------------------------------------------------------
  // The export hardcodes the template's own placeholder logos as inline SVGs, so on
  // every load the marquee painted those first and swapped in the real brands once
  // js/dynamic.js ran. This builds the same DOM that dynamic.js builds, so the
  // markup it produces on hydration is identical and nothing visibly changes.
  stats.brands = 0;
  const usableBrands = brands.filter((b) => b.image_url || b.name);
  doc.querySelectorAll('.brands-logo-marquee').forEach((marquee) => {
    const template = marquee.querySelector('.brands-logo-block');
    if (!template || !usableBrands.length) return;
    const frag = doc.createDocumentFragment();
    usableBrands.forEach((b) => {
      const clone = template.cloneNode(true);
      const svg = clone.querySelector('svg');
      if (svg) {
        const wrapper = doc.createElement('div');
        wrapper.setAttribute('class', svg.getAttribute('class') || 'brands-logo');
        wrapper.setAttribute('style', 'display:flex;align-items:center;justify-content:center;gap:15px;');
        if (b.image_url) {
          const img = doc.createElement('img');
          img.setAttribute('src', b.image_url);
          img.setAttribute('alt', b.name ? `${b.name} logo` : 'Client logo');
          img.setAttribute('loading', 'lazy');
          img.setAttribute('style', 'max-height:65px;max-width:180px;object-fit:contain;display:block;');
          wrapper.appendChild(img);
        }
        if (b.name) {
          const text = doc.createElement('span');
          text.setAttribute('style', 'font-weight:700;font-size:1.85rem;color:currentColor;letter-spacing:1px;');
          text.textContent = b.name;
          wrapper.appendChild(text);
        }
        svg.replaceWith(wrapper);
      }
      frag.appendChild(clone);
      stats.brands++;
    });
    marquee.innerHTML = '';
    marquee.appendChild(frag);
  });

  // --- Single-value slots ---------------------------------------------------
  // Previously injected as <span class="skeleton" style="color:transparent"> —
  // text present for crawlers but invisible to people, which is the exact pattern
  // search engines flag as hidden text. Render it normally instead.
  setText(doc.querySelector('.home-hero-text'), settings.hero_text);
  setText(doc.querySelector('.about-hero-subheading'), settings.about_hero_subheading);

  // hero_headline holds the ROTATOR's full list, one headline per line. Render only
  // the first — js/dynamic.js does the same (`headlines[0]`) before it starts
  // cycling. Dumping the raw value printed all four stacked on top of each other.
  if (settings.hero_headline) {
    const first = String(settings.hero_headline).split('\n').map(s => s.trim()).filter(Boolean)[0];
    setText(doc.querySelector('.hero-heading, .home-hero-heading'), first || settings.hero_headline);
  }

  // The logo is a text wordmark injected on load; without it the header shows an
  // empty dark box until JS lands.
  if (settings.site_logo_text) {
    doc.querySelectorAll('.navbar-logo, .footer-logo').forEach((wrap) => {
      wrap.classList.remove('skeleton');
      wrap.innerHTML = '';
      const span = doc.createElement('span');
      span.setAttribute('style', 'font-size:24px;font-weight:800;color:currentColor;display:block;letter-spacing:-0.5px;');
      span.textContent = settings.site_logo_text;
      wrap.appendChild(span);
    });
  }

  // --- Footer contact + socials --------------------------------------------
  // Drop rows we have no real value for rather than linking to a bare
  // https://github.com or a tel: with template digits.
  const contact = { footerPhone: settings.contact_phone, footerEmail: settings.contact_email };
  doc.querySelectorAll('a[href^="tel:"]').forEach((a) => {
    if (!contact.footerPhone) { a.remove(); return; }
    a.setAttribute('href', `tel:${String(contact.footerPhone).replace(/[^\d+]/g, '')}`);
    setText(a, contact.footerPhone);
  });
  doc.querySelectorAll('a[href^="mailto:"]').forEach((a) => {
    if (!contact.footerEmail) { a.remove(); return; }
    a.setAttribute('href', `mailto:${contact.footerEmail}`);
    if (a.classList.contains('footer-nav-link')) setText(a, contact.footerEmail);
  });

  const socials = {
    WhatsApp: settings.social_whatsapp || settings.contact_whatsapp,
    Instagram: settings.social_instagram,
    LinkedIn: settings.social_linkedin,
    GitHub: settings.social_github,
    Twitter: settings.social_twitter,
    Facebook: settings.social_facebook,
    YouTube: settings.social_youtube
  };
  doc.querySelectorAll('a.footer-nav-link[target="_blank"]').forEach((a) => {
    const label = (a.textContent || '').trim();
    const url = socials[label];
    // A link to the platform's homepage is worse than no link at all.
    if (!url || /^https?:\/\/(www\.)?[a-z.]+\/?$/i.test(url)) { a.remove(); return; }
    a.setAttribute('href', url);
    a.setAttribute('rel', 'noopener noreferrer');
  });

  let out = dom.serialize();
  out = out.replace('<!--NAV_TESTIMONIALS-->', navLink);
  dom.window.close();
  return { html: out, stats };
}

module.exports = { renderContent };
