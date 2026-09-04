const { Resend } = require('resend');
const dns = require('dns').promises;

/**
 * Outbound mail for lead replies.
 *
 * Deliberately narrow: this module only knows how to send a plain-text reply to a
 * lead and a notification to the site owner. It is not a general mail helper,
 * because the blast radius of a bug in something that emails strangers in the
 * owner's name should stay small.
 *
 * Nothing here can send unless RESEND_API_KEY and LEAD_FROM_EMAIL are both set.
 * isConfigured() is checked by callers so a missing key surfaces as a clear
 * message in the admin panel rather than a silent failure that looks like a sent
 * email.
 */

function isConfigured() {
  return !!(process.env.RESEND_API_KEY && process.env.LEAD_FROM_EMAIL);
}

function client() {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set.');
  return new Resend(process.env.RESEND_API_KEY);
}

function missingConfig() {
  const missing = [];
  if (!process.env.RESEND_API_KEY) missing.push('RESEND_API_KEY');
  if (!process.env.LEAD_FROM_EMAIL) missing.push('LEAD_FROM_EMAIL');
  return missing;
}

/**
 * @param {object} opts
 * @param {string} opts.to        recipient address
 * @param {string} opts.subject
 * @param {string} opts.body      plain text
 * @param {string} [opts.replyTo] where replies should land
 * @param {boolean} [opts.dryRun] build the payload, send nothing
 */
/**
 * Does this domain accept mail at all?
 *
 * Harvested addresses are guesses, and some of the domains behind them have no
 * mail server whatsoever — ghremodeling.com has no MX records, so every message
 * to it was guaranteed to bounce before it was sent. Bounces are not free: past
 * roughly five percent they damage the sending domain's reputation, which then
 * costs deliverability on the mail that would have worked.
 *
 * Cached because a run of outreach hits the same domains repeatedly, and a
 * lookup failure is treated as deliverable — a DNS hiccup should not silently
 * stop a real client's reply going out.
 */
const mxCache = new Map();

async function domainAcceptsMail(domain) {
  const key = String(domain || '').toLowerCase();
  if (!key) return { ok: false, reason: 'no domain' };
  if (mxCache.has(key)) return mxCache.get(key);

  let verdict;
  try {
    const records = await dns.resolveMx(key);
    verdict = (records && records.length)
      ? { ok: true }
      : { ok: false, reason: `${key} publishes no mail server, so nothing sent there can arrive` };
  } catch (e) {
    // Only a domain that does not exist is certain. A domain with no MX is NOT
    // undeliverable: RFC 5321 falls back to the A record, and Resend delivered
    // to helectricconnection.com that way — it publishes no MX on any resolver
    // yet its web host also answers on port 25. Blocking on missing MX would
    // have silently dropped a real prospect, which is the worse error.
    verdict = ['ENOTFOUND', 'NXDOMAIN'].includes(e.code)
      ? { ok: false, reason: `${key} does not exist` }
      : { ok: true, noMx: e.code === 'ENODATA' };
  }
  mxCache.set(key, verdict);
  return verdict;
}

async function sendLeadReply({ to, subject, body, replyTo, dryRun = false, skipMxCheck = false }) {
  const missing = missingConfig();
  if (missing.length) {
    return { sent: false, reason: `Email is not configured. Missing: ${missing.join(', ')}` };
  }
  const address = String(to || '').trim();
  if (!address || !/^[^@\s%]+@[^@\s%]+\.[^@\s%]+$/.test(address)) {
    return { sent: false, reason: `Refusing to send to an invalid address: ${to || '(empty)'}` };
  }
  if (!skipMxCheck) {
    const mx = await domainAcceptsMail(address.split('@')[1]);
    if (!mx.ok) return { sent: false, reason: `Not sent — ${mx.reason}.`, undeliverable: true };
  }

  const payload = {
    from: process.env.LEAD_FROM_EMAIL,
    to: [address],
    subject: subject || 'Re: your enquiry',
    text: body,
    reply_to: replyTo || process.env.LEAD_REPLY_TO || process.env.LEAD_FROM_EMAIL
  };

  // Lets the whole path be exercised — config, validation, payload shape — without
  // a real message reaching a real person.
  if (dryRun) return { sent: false, dryRun: true, payload };

  try {
    const { data, error } = await client().emails.send(payload);
    if (error) return { sent: false, reason: error.message || String(error) };
    return { sent: true, id: data && data.id };
  } catch (e) {
    return { sent: false, reason: e.message };
  }
}

/** Tells the owner a lead came in or replied. Never sent to the lead. */
async function notifyOwner({ subject, body, dryRun = false }) {
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  if (!to) return { sent: false, reason: 'ADMIN_NOTIFY_EMAIL is not set.' };
  return sendLeadReply({ to, subject, body, dryRun });
}

module.exports = { isConfigured, missingConfig, sendLeadReply, notifyOwner, domainAcceptsMail };
