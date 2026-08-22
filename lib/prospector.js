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

/** Pulls the raw signals we can establish as fact, without a model. */
async function inspect(url) {
  const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const started = Date.now();

  let res, html = '';
  try {
    res = await fetch(target, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    html = await res.text();
  } catch (e) {
    return { ok: false, url: target, reason: e.message };
  }
  const loadMs = Date.now() - started;

  const pick = (re) => { const m = html.match(re); return m ? m[1].trim() : null; };
  const count = (re) => (html.match(re) || []).length;

  const title = pick(/<title[^>]*>([^<]{0,200})<\/title>/i);
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
