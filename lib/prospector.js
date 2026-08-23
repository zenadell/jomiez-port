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
    platform,
    excerpt: text.slice(0, 3000)
  };
}

/** Turns the measurements into findings a business owner would care about. */
function deriveFindings(s) {
  const f = [];
  if (!s.https) f.push('The site is not served over HTTPS — browsers mark it "Not secure".');
  if (!s.title) f.push('No page title, so search results show the bare URL.');
  else if (s.titleLength > 65) f.push(`Page title is ${s.titleLength} characters and will be cut off in search results.`);
  if (!s.description) f.push('No meta description, so Google invents the snippet under your listing.');
  if (!s.viewport) f.push('No mobile viewport tag — the site will render desktop-sized on phones.');
  if (!s.ogImage) f.push('No social preview image, so links shared to WhatsApp or LinkedIn appear as bare text.');
  if (s.schemaBlocks === 0) f.push('No structured data, so search engines and AI assistants cannot read what the business does.');
  if (s.imgs > 0 && s.imgsNoAlt / s.imgs > 0.4) f.push(`${s.imgsNoAlt} of ${s.imgs} images have no alt text.`);
  if (s.loadMs > 3000) f.push(`The homepage took ${(s.loadMs / 1000).toFixed(1)}s to respond.`);
  if (s.wordCount < 250) f.push(`Only ~${s.wordCount} words of readable text, which gives search engines very little to rank.`);
  if (!s.hasForm && !s.hasWhatsApp) f.push('No contact form or WhatsApp link — a visitor ready to buy has no easy way to start.');
  if (!s.hasBooking) f.push('No way to book or schedule directly from the site.');
  if (!s.hasChat) f.push('No live chat or assistant, so enquiries outside working hours go unanswered.');
  return f;
}

async function analyse(url, geminiKey, ourWork = []) {
  const signals = await inspect(url);
  if (!signals.ok) return signals;

  const findings = deriveFindings(signals);
  const portfolio = ourWork.slice(0, 8).map(w => `- ${w.title}: ${(w.description || '').slice(0, 110)}`).join('\n');

  const prompt = `You are preparing a short, honest audit of a prospective client's website for Jomiez Innovation, a software studio.

MEASURED FACTS about ${signals.url} (do not contradict these, do not invent others):
- Platform: ${signals.platform} | HTTPS: ${signals.https} | Response: ${signals.loadMs}ms | Readable words: ${signals.wordCount}
- Title: ${signals.title || 'MISSING'}
- Meta description: ${signals.description || 'MISSING'}
- H1: ${signals.h1 || 'MISSING'}
- Structured data blocks: ${signals.schemaBlocks} | Social image: ${signals.ogImage} | Mobile viewport: ${signals.viewport}
- Images: ${signals.imgs} (${signals.imgsNoAlt} without alt text)
- Contact form: ${signals.hasForm} | WhatsApp: ${signals.hasWhatsApp} | Live chat: ${signals.hasChat} | Booking: ${signals.hasBooking}

Automated findings already derived:
${findings.map(x => '- ' + x).join('\n') || '- Nothing obviously broken.'}

Page text excerpt:
"""${signals.excerpt.slice(0, 1500)}"""

Work Jomiez has actually done (reference only these, never invent):
${portfolio}

Return strict JSON, nothing else:
{
  "business_name": "their business name as written on the site",
  "industry": "short label",
  "summary": "two sentences on what this business does and who it serves",
  "opportunities": ["three to five specific improvements, each naming something real from the facts above"],
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
  if (!raw) return { ok: false, url: signals.url, reason: `Analysis failed: ${lastErr && lastErr.message}` };

  let parsed = {};
  try { parsed = JSON.parse(raw.replace(/^```(?:json)?|```$/gm, '').trim()); } catch (e) { parsed = {}; }

  return { ok: true, signals, findings, ...parsed };
}

module.exports = { inspect, deriveFindings, analyse };
