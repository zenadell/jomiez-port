const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Reads a prospect's website and works out what could genuinely be improved.
 *
 * The value of this is entirely in being SPECIFIC. "We can improve your SEO" is
 * what every spammer sends and is why that mail gets deleted — the recipient of
 * this site's own contact form has received two of them. An audit that quotes
 * their actual page title, names a real missing tag and points at a real slow
 * asset reads as work already done for free, which is the only version of cold
 * outreach that earns a reply.
 *
 * So this module measures first, then asks the model to interpret measurements.
 * It never asks the model to guess what a site looks like.
 */

const UA = 'Mozilla/5.0 (compatible; JomiezSiteAudit/1.0; +https://www.jomiez.com)';
// Some WAFs reject anything that does not look like a browser. Reading a public
// homepage is exactly what a browser does, so a second attempt under a normal UA
// is fair — but only as a fallback, so the honest identifier is what most hosts
// see in their logs.
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** Bot walls answer 200 with a holding page. Auditing one produces a confident, wrong report. */
function isChallengePage(html, title) {
  const t = (title || '').toLowerCase();
  if (/just a moment|attention required|access denied|are you a robot|checking your browser/.test(t)) return true;
  return /cf-browser-verification|_cf_chl_opt|challenge-platform|__CF\$cv\$params/.test(html);
}

/** Tries the sensible spellings of an address a person would type. */
function candidateUrls(raw) {
  const cleaned = raw.trim().replace(/\s+/g, '');
  if (/^https?:\/\//i.test(cleaned)) {
    const u = new URL(cleaned);
    const swapped = u.hostname.startsWith('www.')
      ? u.hostname.slice(4)
      : `www.${u.hostname}`;
    const alt = new URL(cleaned); alt.hostname = swapped;
    return [cleaned, alt.toString(), cleaned.replace(/^https:/i, 'http:')];
  }
  const bare = cleaned.replace(/^www\./i, '');
  return [`https://${bare}`, `https://www.${bare}`, `http://${bare}`];
}

/** Domain parking lander, i.e. registered but not actually a website. */
function isParkedPage(html, title) {
  const t = (title || '').toLowerCase();
  if (/domain (is )?(for sale|parked)|buy this domain|this domain is available/.test(t)) return true;
  return /sedoparking|parkingcrew|bodis\.com|afternic|dan\.com\/domain|hugedomains|domain[- ]for[- ]sale/i.test(html)
      // GoDaddy/Wsimg landers announce themselves in their bootstrap script.
      || /parking-lander|LANDER_SYSTEM|ap:\s*["']parking["']/i.test(html);
}

/**
 * Follows the one-line redirect stubs that parked domains and cheap hosts use.
 * Server-side redirects are handled by fetch; these are not, and without this a
 * real site behind a meta-refresh reads as an empty page.
 */
function redirectTargetFrom(html, base) {
  if (html.length > 4000) return null; // only trust this on a stub page
  const meta = html.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"';]+)/i);
  const js = html.match(/(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i);
  const found = (meta && meta[1]) || (js && js[1]);
  if (!found) return null;
  try { return new URL(found.trim(), base).toString(); } catch (e) { return null; }
}

async function fetchOnce(target, ua, timeoutMs) {
  const res = await fetch(target, {
    headers: { 'User-Agent': ua, 'Accept': 'text/html,application/xhtml+xml' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs)
  });
  return { res, html: await res.text() };
}

/** Pulls the raw signals we can establish as fact, without a model. */
async function inspect(url) {
  const started = Date.now();
  const attempts = [];
  let res = null, html = '', target = null;

  // Walk the URL spellings, and for each one fall back to a browser UA on a 403.
  // Anything non-2xx is a failure: an earlier version returned ok on a 404 and
  // duly reported that the owner's error page "has no meta description".
  outer:
  for (const candidate of candidateUrls(url)) {
    for (const ua of [UA, BROWSER_UA]) {
      try {
        const got = await fetchOnce(candidate, ua, 20000);
        if (got.res.ok) {
          res = got.res; html = got.html; target = got.res.url || candidate;
          const hop = redirectTargetFrom(html, target);
          if (hop && hop !== target) {
            try {
              const followed = await fetchOnce(hop, ua, 20000);
              if (followed.res.ok) { res = followed.res; html = followed.html; target = followed.res.url || hop; }
            } catch (e) { /* keep the stub; the guards below will describe it */ }
          }
          break outer;
        }
        attempts.push(`${candidate} -> HTTP ${got.res.status}`);
        if (got.res.status !== 403) break; // only a 403 is worth a UA retry
      } catch (e) {
        attempts.push(`${candidate} -> ${e.name === 'TimeoutError' ? 'timed out' : e.message}`);
        break; // network-level failure; try the next spelling, not another UA
      }
    }
  }

  if (!res) {
    const saw404 = attempts.some(a => /HTTP 4[0-9][0-9]/.test(a));
    return {
      ok: false,
      url,
      reason: saw404
        ? `That address did not return a page (${attempts[0]}). Check the URL — it may have moved or the homepage may be at a different path.`
        : `Could not reach that site. ${attempts[0] || 'No response.'}`
    };
  }

  const loadMs = Date.now() - started;

  const pick = (re) => { const m = html.match(re); return m ? m[1].trim() : null; };
  const count = (re) => (html.match(re) || []).length;

  const title = pick(/<title[^>]*>([^<]{0,200})<\/title>/i);
  if (isChallengePage(html, title)) {
    return {
      ok: false,
      url: target,
      reason: 'That site is behind a bot-protection wall (Cloudflare or similar), so only the holding page is readable. Auditing it would describe the wall, not their website.'
    };
  }
  // A near-empty body is a redirect stub, and following it does not always
  // succeed — the same domain would otherwise report two different failures on
  // two attempts. Both cases mean the same thing in practice, so say so once.
  if (isParkedPage(html, title) || html.length < 500) {
    return {
      ok: false,
      url: target,
      parked: true,
      reason: 'That address shows a placeholder or parking page, not a real website. Approach them as a business with no web presence — anyone who types their address today sees an advert instead of their business.'
    };
  }
  const description = pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{0,300})["']/i);
  const ogImage = pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  const viewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  const h1 = pick(/<h1[^>]*>([\s\S]{0,160}?)<\/h1>/i);

  const imgs = count(/<img\b/gi);
  const imgsNoAlt = count(/<img\b(?![^>]*\balt=)[^>]*>/gi);

  const text = html
    .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Contact routes a visitor could actually use.
  const emails = [...new Set((html.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [])
    .filter(e => !/\.(png|jpe?g|gif|svg|webp)$/i.test(e)))].slice(0, 5);
  const hasForm = /<form\b/i.test(html);
  const hasWhatsApp = /wa\.me|api\.whatsapp\.com/i.test(html);
  const hasChat = /intercom|crisp|tawk|drift|livechat|tidio|hubspot/i.test(html);
  const hasBooking = /calendly|cal\.com|acuity|booking|schedule/i.test(html);

  // Signals that matter specifically to a local business being found and called.
  const telLinks = count(/<a\b[^>]+href=["']tel:/gi);
  const phoneInText = /(\+?\d[\d\s().-]{8,}\d)/.test(text);
  const hasAddress = /\b\d{1,6}\s+[A-Z][A-Za-z.]+\s+(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|suite|ste)\b/i.test(text)
    || /itemprop=["']address["']|postal-address|streetAddress/i.test(html);
  const hasMap = /google\.com\/maps|maps\.google|openstreetmap|mapbox|leaflet/i.test(html);
  const hasHours = /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\s*[-–—:]\s*/i.test(text) && /\d{1,2}\s*(am|pm|:\d{2})/i.test(text);
  const hasReviews = /\b(review|testimonial|what our (patients|clients|customers) say)\b/i.test(text);

  const socials = ['facebook','instagram','twitter','x.com','linkedin','youtube','tiktok','yelp']
    .filter(n => new RegExp(`(?:https?://)?(?:www\\.)?${n.replace('.','\\.')}`, 'i').test(html));

  // A stale copyright is the clearest public sign a site has been abandoned.
  const years = (text.match(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–—]\s*)?(\d{4})/gi) || [])
    .map(m => parseInt((m.match(/(\d{4})\s*$/) || [])[1], 10)).filter(Boolean);
  const copyrightYear = years.length ? Math.max(...years) : null;

  // Responsiveness is more than the viewport tag: without media queries the
  // layout does not actually adapt.
  const mediaQueries = count(/@media[^{]*\(/gi);
  const headHtml = (html.match(/<head[\s\S]*?<\/head>/i) || [''])[0];
  const blockingScripts = (headHtml.match(/<script\b(?![^>]*\b(async|defer|type=["']application\/ld\+json["']))[^>]*\bsrc=/gi) || []).length;
  const favicon = /<link[^>]+rel=["'][^"']*icon/i.test(html);
  const inlineStyleAttrs = count(/\sstyle=["']/gi);
  const h1Count = count(/<h1\b/gi);

  // A single-page app serves an empty shell to a plain fetch. Measuring its word
  // count and concluding the business has no content would be confidently wrong
  // — the same class of mistake as auditing a 404 page.
  const spaShell = /<div\s+id=["'](root|app|__next)["']\s*>\s*<\/div>/i.test(html)
    || /__NEXT_DATA__|window\.__NUXT__|ng-version=/i.test(html);
  const jsRendered = spaShell && text.split(' ').filter(Boolean).length < 200;

  const platform =
    /wp-content|wp-includes/i.test(html) ? 'WordPress' :
    /cdn\.shopify\.com/i.test(html) ? 'Shopify' :
    /wix\.com|wixstatic/i.test(html) ? 'Wix' :
    /squarespace/i.test(html) ? 'Squarespace' :
    /webflow/i.test(html) ? 'Webflow' :
    /_next\/static/i.test(html) ? 'Next.js' : 'unknown';

  return {
    ok: true,
    url: target,
    status: res.status,
    https: target.startsWith('https://'),
    loadMs,
    bytes: html.length,
    title,
    titleLength: title ? title.length : 0,
    description,
    descriptionLength: description ? description.length : 0,
    h1,
    ogImage: !!ogImage,
    viewport,
    imgs,
    imgsNoAlt,
    wordCount: text.split(' ').filter(Boolean).length,
    schemaBlocks: count(/application\/ld\+json/gi),
    emails,
    hasForm, hasWhatsApp, hasChat, hasBooking,
    telLinks, phoneInText, hasAddress, hasMap, hasHours, hasReviews,
    socials, copyrightYear, mediaQueries, blockingScripts, favicon,
    inlineStyleAttrs, h1Count, jsRendered,
    platform,
    excerpt: text.slice(0, 3000)
  };
}

/**
 * Turns the measurements into findings a business owner would care about.
 *
 * Each finding carries a weight, because a dentist whose phone number is not
 * tappable on a phone is losing money today, while a missing og:image is a
 * nice-to-have. Sorting by weight is what lets the outreach email lead with the
 * one thing most likely to make the owner reply.
 */
function deriveFindings(s) {
  const now = new Date().getFullYear();
  const f = [];
  const add = (weight, tag, text) => f.push({ weight, tag, text });

  // Everything below reads the HTML as served. On a JavaScript-rendered site
  // that HTML is a shell, so the content-based checks would all fire falsely.
  // Report only what is still true of a shell and say why the rest is skipped.
  if (s.jsRendered) {
    add(18, 'render', 'The page is built entirely in JavaScript, so it arrives empty and is filled in by the browser. Search engines and AI assistants that do not run scripts see a blank page.');
    if (!s.https) add(30, 'security', 'The site is not served over HTTPS, so browsers display "Not secure" in the address bar.');
    if (!s.title) add(26, 'seo', 'No page title in the served HTML, so search results show the bare web address.');
    if (!s.description) add(14, 'seo', 'No meta description in the served HTML.');
    if (s.schemaBlocks === 0) add(16, 'seo', 'No structured data, so search engines and AI assistants cannot reliably read what this business does.');
    if (!s.viewport) add(28, 'mobile', 'No mobile viewport tag, so the site renders at desktop width on a phone.');
    if (s.loadMs > 2500) add(10, 'speed', `The homepage took ${(s.loadMs / 1000).toFixed(1)} seconds to respond.`);
    return f.sort((a, b) => b.weight - a.weight);
  }

  // --- money is leaking right now -----------------------------------------
  if (s.phoneInText && s.telLinks === 0) {
    add(30, 'phone', 'The phone number is written as plain text, so tapping it on a phone does nothing. Most visitors to a site like this are on mobile and ready to call.');
  } else if (!s.phoneInText && s.telLinks === 0) {
    add(28, 'phone', 'No phone number anywhere on the homepage — a visitor who wants to call has to go back to Google.');
  }
  if (!s.hasForm && !s.hasWhatsApp && s.telLinks === 0) {
    add(25, 'contact', 'No contact form, WhatsApp link or clickable phone number. A visitor ready to buy has no way to start.');
  }
  if (!s.hasBooking) add(14, 'booking', 'No way to book or request an appointment from the site — every enquiry has to become a phone call first.');
  if (!s.hasChat) add(10, 'chat', 'No live chat or assistant, so enquiries outside working hours go unanswered until the next morning.');

  // --- cannot be found -----------------------------------------------------
  if (!s.https) add(30, 'security', 'The site is not served over HTTPS, so browsers display "Not secure" in the address bar before anyone reads a word.');
  if (!s.title) add(26, 'seo', 'No page title, so search results show the bare web address instead of the business name.');
  else if (s.titleLength > 65) add(8, 'seo', `The page title is ${s.titleLength} characters and gets cut off in search results.`);
  else if (s.titleLength < 15) add(10, 'seo', `The page title is only ${s.titleLength} characters — too thin to describe the business or where it is.`);
  if (!s.description) add(14, 'seo', 'No meta description, so Google writes its own snippet under the listing from whatever text it finds.');
  if (s.schemaBlocks === 0) add(16, 'seo', 'No structured data, so search engines and AI assistants like ChatGPT cannot reliably read what this business does, where it is, or when it is open.');
  if (!s.hasAddress) add(15, 'local', 'No street address in the page text, which is one of the strongest signals Google uses to rank a local business.');
  if (!s.hasMap) add(6, 'local', 'No map on the site, so a first-time visitor cannot see where you are without leaving the page.');
  if (!s.hasHours) add(9, 'local', 'Opening hours are not on the homepage — one of the two things people most often look for.');
  if (s.h1Count === 0) add(9, 'seo', 'No main heading (H1) on the page, so search engines have to guess what it is about.');
  else if (s.h1Count > 1) add(4, 'seo', `${s.h1Count} competing main headings on one page, which dilutes what the page is understood to be about.`);
  if (s.wordCount < 250) add(13, 'content', `Only about ${s.wordCount} words of readable text, which gives search engines very little to rank and visitors very little to trust.`);

  // --- looks neglected -----------------------------------------------------
  if (s.copyrightYear && s.copyrightYear < now - 1) {
    add(22, 'stale', `The copyright notice still says ${s.copyrightYear}. To a visitor comparing three businesses, that reads as "possibly closed".`);
  }
  if (!s.viewport) add(28, 'mobile', 'No mobile viewport tag, so the site renders at desktop width on a phone and visitors have to pinch and zoom.');
  else if (s.mediaQueries === 0) add(18, 'mobile', 'The page declares itself mobile-ready but has no responsive styling, so the layout does not actually adapt to a phone screen.');
  if (!s.favicon) add(4, 'polish', 'No favicon, so the browser tab shows a blank page icon next to competitors who have one.');
  if (s.socials.length === 0) add(7, 'social', 'No links to any social profile, so there is nothing connecting the site to an audience that already follows the business.');
  if (!s.hasReviews) add(11, 'trust', 'No reviews or testimonials on the homepage, which is the single thing most people look for before choosing a local business.');
  if (!s.ogImage) add(6, 'social', 'No social preview image, so a link shared to WhatsApp or Facebook appears as bare text with no picture.');

  // --- slow ----------------------------------------------------------------
  if (s.loadMs > 5000) add(20, 'speed', `The homepage took ${(s.loadMs / 1000).toFixed(1)} seconds to respond. Most visitors on a phone leave before three.`);
  else if (s.loadMs > 2500) add(10, 'speed', `The homepage took ${(s.loadMs / 1000).toFixed(1)} seconds to respond, which is slow enough to lose impatient visitors.`);
  if (s.blockingScripts >= 3) add(8, 'speed', `${s.blockingScripts} scripts load before the page can display, delaying what the visitor sees.`);
  if (s.imgs > 0 && s.imgsNoAlt / s.imgs > 0.4) {
    add(7, 'a11y', `${s.imgsNoAlt} of ${s.imgs} images have no alt text, so screen readers and Google Images cannot tell what they show.`);
  }

  return f.sort((a, b) => b.weight - a.weight);
}

/**
 * 0-100, where 100 is a site with nothing found wrong.
 *
 * Deliberately not a made-up "SEO score" out of thin air — it is the sum of the
 * weights above, which are all things measured on the page.
 */
function scoreSite(findings) {
  const lost = findings.reduce((n, f) => n + f.weight, 0);
  return Math.max(0, Math.min(100, Math.round(100 - lost * 0.55)));
}

function verdictFor(score) {
  if (score >= 80) return 'in good shape — a light-touch pitch only';
  if (score >= 60) return 'workable but leaking enquiries';
  if (score >= 35) return 'clearly costing them customers';
  return 'badly neglected';
}

/** Names the business without a model, for when the model is unavailable. */
function guessName(signals) {
  const t = (signals.title || '').split(/[|\-–—:]/)[0].trim();
  if (t && t.length > 2 && t.length < 60) return t;
  if (signals.h1) return signals.h1.replace(/<[^>]+>/g, '').trim().slice(0, 60);
  try { return new URL(signals.url).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
}

/**
 * Most small businesses put the email on /contact, not the homepage. Outreach
 * without an address is wasted research, so spend one extra request on it.
 */
async function findContactEmail(signals) {
  if ((signals.emails || []).length) return signals.emails;
  let base;
  try { base = new URL(signals.url); } catch (e) { return []; }
  for (const path of ['/contact', '/contact-us', '/contactus', '/about']) {
    try {
      const got = await fetchOnce(new URL(path, base).toString(), UA, 12000);
      if (!got.res.ok) continue;
      const found = [...new Set((got.html.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [])
        .filter(e => !/\.(png|jpe?g|gif|svg|webp|css|js)$/i.test(e))
        .filter(e => !/^(example|your|email|name|user)@/i.test(e)))];
      if (found.length) return found.slice(0, 5);
    } catch (e) { /* try the next path */ }
  }
  return [];
}

async function analyse(url, geminiKey, ourWork = []) {
  const signals = await inspect(url);
  if (!signals.ok) return signals;

  if (!(signals.emails || []).length) {
    signals.emails = await findContactEmail(signals);
  }

  const detailed = deriveFindings(signals);
  const findings = detailed.map(f => f.text);
  const score = scoreSite(detailed);

  // Everything above is measurement and needs no model at all. The model only
  // adds interpretation, so when it is unavailable — a dead key, a quota, an
  // outage — the audit degrades to "facts without commentary" instead of
  // failing outright. An earlier version returned nothing at all when the key
  // was rejected, which threw away work already done.
  const base = {
    ok: true,
    signals,
    findings,
    detailed,
    score,
    verdict: verdictFor(score),
    headline: detailed.length ? detailed[0].text : 'Nothing obviously broken on the homepage.',
    business_name: guessName(signals),
    industry: signals.platform !== 'unknown' ? `${signals.platform} site` : '',
    summary: '',
    opportunities: findings.slice(0, 5),
    ai_angle: '',
    best_project_match: '',
    aiUsed: false
  };

  if (!geminiKey) {
    return { ...base, aiNote: 'No Gemini API key is configured, so this audit is measurements only.' };
  }

  const portfolio = ourWork.slice(0, 8).map(w => `- ${w.title}: ${(w.description || '').slice(0, 110)}`).join('\n');

  const prompt = `You are preparing a short, honest audit of a prospective client's website for Jomiez Innovation, a software studio.

MEASURED FACTS about ${signals.url} (do not contradict these, do not invent others):
- Platform: ${signals.platform} | HTTPS: ${signals.https} | Response: ${signals.loadMs}ms | Readable words: ${signals.wordCount}
- Title: ${signals.title || 'MISSING'}
- Meta description: ${signals.description || 'MISSING'}
- H1: ${signals.h1 || 'MISSING'}
- Structured data blocks: ${signals.schemaBlocks} | Social image: ${signals.ogImage} | Mobile viewport: ${signals.viewport} | Responsive CSS rules: ${signals.mediaQueries}
- Images: ${signals.imgs} (${signals.imgsNoAlt} without alt text)
- Clickable phone links: ${signals.telLinks} | Phone number in text: ${signals.phoneInText} | Address on page: ${signals.hasAddress} | Opening hours: ${signals.hasHours}
- Contact form: ${signals.hasForm} | WhatsApp: ${signals.hasWhatsApp} | Live chat: ${signals.hasChat} | Booking: ${signals.hasBooking}
- Reviews on page: ${signals.hasReviews} | Social profiles linked: ${signals.socials.join(', ') || 'none'} | Copyright year: ${signals.copyrightYear || 'not shown'}
- Overall measured score: ${score}/100 (${verdictFor(score)})

Findings already derived, strongest first:
${detailed.slice(0, 10).map(x => `- [${x.tag}] ${x.text}`).join('\n') || '- Nothing obviously broken.'}

Page text excerpt:
"""${signals.excerpt.slice(0, 1500)}"""

Work Jomiez has actually done (reference only these, never invent):
${portfolio}

Return strict JSON, nothing else:
{
  "business_name": "their business name as written on the site",
  "industry": "short label, e.g. dental practice",
  "summary": "two sentences on what this business does and who it serves",
  "opportunities": ["three to five specific improvements, each naming something real from the facts above, strongest first"],
  "ai_angle": "two or three sentences on one AI capability that would plausibly earn this specific business money — answering enquiries out of hours, qualifying leads, booking jobs. Be concrete about their trade. Do not promise numbers.",
  "best_project_match": "the single most relevant Jomiez project from the list, or empty string"
}

Rules: never invent a fact not in the measurements. Never promise a price, a timeline or a percentage improvement. Write as if the owner will read it — no jargon, no condescension.`;

  const client = new GoogleGenerativeAI(geminiKey);
  let raw = null, lastErr = null;
  for (const model of ['gemini-3.5-flash-lite', 'gemini-flash-latest', 'gemini-2.5-flash']) {
    try {
      raw = (await client.getGenerativeModel({ model }).generateContent(prompt)).response.text();
      break;
    } catch (e) { lastErr = e; }
  }

  if (!raw) {
    const why = String(lastErr && lastErr.message || '');
    // Worth naming precisely: a revoked key and an exhausted quota need very
    // different actions from whoever is reading the panel.
    const note = /leaked|API key not valid|API_KEY_INVALID|403/i.test(why)
      ? 'The Gemini API key was rejected — Google reports it as invalid or leaked. Replace it in the environment; the measurements below are unaffected.'
      : /quota|429|RESOURCE_EXHAUSTED/i.test(why)
        ? 'The Gemini quota is exhausted for now. The measurements below are unaffected.'
        : `The AI commentary step failed (${why.slice(0, 120)}). The measurements below are unaffected.`;
    return { ...base, aiNote: note };
  }

  let parsed = {};
  try { parsed = JSON.parse(raw.replace(/^```(?:json)?|```$/gm, '').trim()); } catch (e) { parsed = {}; }

  return {
    ...base,
    aiUsed: true,
    business_name: parsed.business_name || base.business_name,
    industry: parsed.industry || base.industry,
    summary: parsed.summary || '',
    opportunities: Array.isArray(parsed.opportunities) && parsed.opportunities.length ? parsed.opportunities : base.opportunities,
    ai_angle: parsed.ai_angle || '',
    best_project_match: parsed.best_project_match || ''
  };
}

module.exports = { inspect, deriveFindings, scoreSite, findContactEmail, analyse };
