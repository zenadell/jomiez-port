/**
 * Finds real website templates for a given trade, without asking a model.
 *
 * The first attempt at this used a language model to "find good templates for a
 * dentist". That is the wrong tool twice over. It burns tokens on every lookup,
 * and worse, a model asked to recall a URL will produce a confident, well-formed,
 * entirely fictional one — framer.com/templates/lawyer-pro looked completely real
 * and never existed. A dead link in cold outreach proves nobody checked.
 *
 * Framer already solved the classification problem. Its marketplace publishes a
 * sitemap and organises every template under categories the template's own author
 * chose: dental, legal, veterinary, car-and-auto, hair-and-beauty, accounting.
 * Reading that taxonomy is more accurate than any model guess, because it is the
 * ground truth rather than a recollection of it — and it costs nothing but an
 * HTTP request.
 *
 * So: fetch the category page, take the slugs, read each template's own page for
 * its real name and live demo, confirm the demo loads. No model anywhere in the
 * path. Framer's robots.txt allows this (`Allow: /`, plus an explicit
 * `Content-Signal: ai-input=yes`), and the result sends traffic to the authors.
 */

const UA = 'Mozilla/5.0 (compatible; JomiezTemplateFinder/1.0; +https://www.jomiez.com)';
const BASE = 'https://www.framer.com/marketplace/templates';

/**
 * Our trades mapped onto Framer's own category slugs.
 *
 * Ordered by how squarely each category fits: the first is the bullseye, the rest
 * are near neighbours used only when the bullseye is thin. Deliberately no generic
 * catch-alls like "business" or "minimal" — a dentist sent a generic SaaS landing
 * page learns only that nobody looked at their trade.
 */
const TRADE_CATEGORIES = {
  dentists:    ['dental', 'medical'],
  clinics:     ['medical', 'therapy', 'dental'],
  lawyers:     ['legal', 'consulting'],
  vets:        ['veterinary', 'pet'],
  accountants: ['accounting', 'insurance', 'consulting', 'professional-services'],
  salons:      ['hair-and-beauty'],
  autoshops:   ['car-and-auto'],
  contractors: ['construction', 'landscaping', 'architecture'],
  realestate:  ['real-estate', 'realtor', 'property-management'],
  fitness:     ['sports', 'coaching', 'nutrition'],
  restaurant:  ['restaurant', 'food', 'bakery-and-cafe', 'catering']
};

/**
 * Turns the free text the audit produced into one of our trade keys.
 *
 * The audit writes what it sees — "auto repair shop", "Tax Law Firm",
 * "Bookkeeping & Accounting Services" — while the library is tagged with keys
 * like autoshops and lawyers. Comparing the two directly matched nothing at all,
 * so every prospect fell through to a general pool and a dentist could have been
 * shown a law firm's template.
 *
 * Scored by the length of the matched phrase so the most specific wins: "Tax Law
 * Firm" hits "law firm" and "tax law" for lawyers, which beats a bare "tax".
 */
const TRADE_KEYWORDS = {
  dentists:    ['dental', 'dentist', 'orthodont', 'endodont', 'periodont', 'oral surgery', 'teeth', 'dds', 'dmd'],
  clinics:     ['medical clinic', 'physiotherap', 'chiropract', 'podiatr', 'dermatolog', 'physician', 'doctors office',
                'urgent care', 'family practice', 'health clinic', 'therapy', 'clinic', 'medical', 'wellness'],
  lawyers:     ['law firm', 'tax law', 'law office', 'attorney', 'solicitor', 'barrister', 'legal', 'lawyer', 'notary', 'counsel'],
  vets:        ['veterinar', 'animal hospital', 'animal clinic', 'pet clinic', 'vet clinic'],
  accountants: ['bookkeep', 'accounting', 'accountant', 'tax preparation', 'tax service', 'payroll', 'cpa',
                'insurance agency', 'insurance broker', 'financial advis', 'insurance'],
  salons:      ['hair salon', 'nail salon', 'beauty salon', 'barber', 'day spa', 'lash', 'brow bar', 'aesthetic',
                'salon', 'spa', 'hairdress', 'nails', 'beauty'],
  autoshops:   ['auto repair', 'car repair', 'auto body', 'body shop', 'collision', 'transmission', 'tire shop',
                'tyre', 'smog', 'mechanic', 'auto service', 'automotive', 'car wash'],
  contractors: ['general contractor', 'contractor', 'plumb', 'electrical', 'electrician', 'hvac', 'roofing', 'roofer',
                'construction', 'remodel', 'landscap', 'painting', 'carpent', 'lumber', 'fencing', 'hardware store',
                'builder', 'concrete', 'glazier', 'flooring', 'masonry'],
  realestate:  ['real estate', 'realtor', 'property management', 'estate agent', 'lettings', 'property'],
  fitness:     ['fitness', 'gym', 'yoga', 'pilates', 'crossfit', 'martial arts', 'personal train', 'health club'],
  restaurant:  ['restaurant', 'cafe', 'coffee shop', 'bakery', 'catering', 'bistro', 'pizzeria', 'taqueria', 'diner', 'bar and grill']
};

function classifyTrade(text) {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return null;
  let best = null, bestScore = 0;
  for (const [trade, words] of Object.entries(TRADE_KEYWORDS)) {
    let score = 0;
    for (const w of words) if (t.includes(w)) score += w.length;
    if (score > bestScore) { bestScore = score; best = trade; }
  }
  return best;
}

// Paths that appear in the markup but are not templates.
const NOT_A_SLUG = /^(categories|templates|plugins|components|vectors|search|new|popular|free|all)$/i;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Category listings run past a megabyte and their response time swings wildly —
 * measured between 4 and 90 seconds for the same page — so the budget is
 * generous and a single timeout is retried once before giving up.
 */
async function getText(url, timeoutMs = 60000, attempts = 2) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await sleep(3000);
    }
  }
  throw new Error(lastErr && lastErr.name === 'TimeoutError' ? 'timed out' : (lastErr ? lastErr.message : 'failed'));
}

/** Template slugs listed under one Framer category. */
async function slugsInCategory(category) {
  const html = await getText(`${BASE}/categories/${encodeURIComponent(category)}/`, 75000);
  const found = new Set();
  for (const m of html.matchAll(/\/marketplace\/templates\/([a-z0-9][a-z0-9-]{1,60})\//g)) {
    const slug = m[1];
    if (!NOT_A_SLUG.test(slug)) found.add(slug);
  }
  return [...found];
}

/**
 * Reads one template's page for the details worth storing.
 *
 * The live demo is the thing to send a business owner — a marketplace listing
 * asks them to understand what Framer is first. Authors host demos on
 * <slug>.framer.website (or .framer.ai / .framer.media), and the page links to
 * several such hosts, so match the one whose subdomain is this template's slug
 * rather than taking whichever appears first.
 */
async function templateDetails(slug) {
  const listingUrl = `${BASE}/${slug}/`;
  const html = await getText(listingUrl, 30000);

  const rawTitle = (html.match(/<title[^>]*>([^<]{0,240})<\/title>/i) || [, ''])[1].trim();
  if (/page not found|404|— Framer Marketplace$/i.test(rawTitle) && !rawTitle.includes(':')) {
    return null;
  }
  // "Dentelio: Free Agency Website Template by Modex Studio — Framer Marketplace"
  const name = rawTitle.split(':')[0].split('—')[0].trim() || slug;
  const description = (html.match(/<meta[^>]+name="description"[^>]+content="([^"]{0,300})"/i) || [, ''])[1].trim();

  const hosts = [...new Set(
    [...html.matchAll(/https:\/\/([a-z0-9-]+\.framer\.(?:website|ai|media))/gi)].map(m => m[1].toLowerCase())
  )];
  const demoHost = hosts.find(h => h.split('.')[0] === slug) || null;

  return {
    slug,
    name,
    description,
    listingUrl,
    demoUrl: demoHost ? `https://${demoHost}/` : null,
    isFree: /\bfree\b/i.test(rawTitle)
  };
}

/** A demo that does not load must never reach a prospect. */
async function demoIsLive(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(20000)
    });
    if (!res.ok) return false;
    const html = await res.text();
    if (html.length < 3000) return false;
    const title = (html.match(/<title[^>]*>([^<]{0,200})<\/title>/i) || [, ''])[1];
    return !/page not found|404|site not found|coming soon/i.test(title);
  } catch (e) {
    return false;
  }
}

/**
 * @param {string} trade  a key of TRADE_CATEGORIES
 * @param {number} want   how many verified templates to return
 */
async function findForTrade(trade, want = 6) {
  const categories = TRADE_CATEGORIES[trade];
  if (!categories) return { ok: false, reason: `No Framer category is mapped to "${trade}".` };

  const seen = new Set();
  const out = [];
  const notes = [];

  for (const category of categories) {
    if (out.length >= want) break;
    let slugs = [];
    try {
      slugs = await slugsInCategory(category);
    } catch (e) {
      notes.push(`${category}: ${e.message}`);
      continue;
    }

    for (const slug of slugs) {
      if (out.length >= want) break;
      if (seen.has(slug)) continue;
      seen.add(slug);
      try {
        const d = await templateDetails(slug);
        if (!d || !d.demoUrl) continue;
        if (!(await demoIsLive(d.demoUrl))) continue;
        out.push({ ...d, trade, category });
      } catch (e) { /* a single unreadable listing is not worth failing over */ }
      await sleep(700);   // courteous pacing; this is somebody else's server
    }
    await sleep(1200);
  }

  return { ok: true, trade, found: out.length, templates: out, notes };
}

module.exports = { findForTrade, slugsInCategory, templateDetails, demoIsLive, classifyTrade, TRADE_CATEGORIES };
