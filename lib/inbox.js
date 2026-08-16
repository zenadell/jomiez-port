const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

/**
 * Pulls mail from the real hello@jomiez.com mailbox into the admin panel.
 *
 * IMAP rather than a provider webhook, deliberately. An inbound webhook would
 * mean pointing MX at the mail provider, which would take delivery away from
 * Hostinger and break the existing mailbox. Polling reads the same inbox the
 * owner already has, changes no DNS, and keeps working if this feature is ever
 * turned off.
 *
 * Requires IMAP_HOST / IMAP_USER / IMAP_PASSWORD. Without them this is inert —
 * the admin panel reports it as not configured rather than failing quietly.
 */

// Settings saved in /admin win over environment variables.
//
// The panel already stores the Gemini and DeepSeek keys in the database, so
// requiring a Render redeploy for this one credential was an inconsistency, not a
// security posture. The settings reader strips anything matching
// key/token/secret/password from the public /api/settings response, so the
// mailbox password is only ever visible to a logged-in session.
let overrides = {};
function configure(values = {}) {
  overrides = { ...overrides, ...values };
}

function conf(name, fallbackEnv) {
  const v = overrides[name];
  return (v && String(v).trim()) || process.env[fallbackEnv] || '';
}

function isConfigured() {
  return !!(conf('imap_host', 'IMAP_HOST') && conf('imap_user', 'IMAP_USER') && conf('imap_password', 'IMAP_PASSWORD'));
}

function missingConfig() {
  return [
    ['imap_host', 'IMAP_HOST'],
    ['imap_user', 'IMAP_USER'],
    ['imap_password', 'IMAP_PASSWORD']
  ].filter(([k, e]) => !conf(k, e)).map(([k]) => k);
}

function client() {
  return new ImapFlow({
    host: conf('imap_host', 'IMAP_HOST'),
    port: Number(conf('imap_port', 'IMAP_PORT') || 993),
    secure: true,
    auth: { user: conf('imap_user', 'IMAP_USER'), pass: conf('imap_password', 'IMAP_PASSWORD') },
    logger: false
  });
}

/** Strips quoted replies and signatures so the panel shows what was actually written. */
function tidyBody(text = '') {
  return String(text)
    .replace(/\r\n/g, '\n')
    .split(/\n-{2,}\s*\n|\nOn .+ wrote:\n/)[0]
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Turns a raw message into readable text.
 *
 * The first version split the source on the first blank line and kept the rest,
 * which for any multipart message hands back the whole MIME structure — part
 * boundaries, base64 blobs, a quoted-printable HTML document. Real messages are
 * almost always multipart, so the panel showed encoded noise instead of words.
 *
 * Prefer the text/plain part; fall back to flattening the HTML one.
 */
async function extractBody(source) {
  try {
    const parsed = await simpleParser(source);
    if (parsed.text && parsed.text.trim()) return tidyBody(parsed.text);
    if (parsed.html) {
      const flattened = String(parsed.html)
        .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
        .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
      return tidyBody(flattened);
    }
    return '(no readable content)';
  } catch (e) {
    return '(could not parse this message)';
  }
}

/**
 * Fetches recent messages. Returns plain objects; storage is the caller's job.
 * @param {number} limit how many of the most recent messages to read
 */
async function fetchRecent(limit = 40) {
  if (!isConfigured()) return { ok: false, reason: `IMAP not configured. Missing: ${missingConfig().join(', ')}` };

  const c = client();
  const messages = [];
  try {
    await c.connect();
    const lock = await c.getMailboxLock('INBOX');
    try {
      const total = c.mailbox.exists;
      if (!total) return { ok: true, messages: [] };
      const from = Math.max(1, total - limit + 1);

      for await (const msg of c.fetch(`${from}:*`, { envelope: true, source: true, flags: true, uid: true })) {
        const env = msg.envelope || {};
        const sender = (env.from && env.from[0]) || {};
        const body = (msg.source ? await extractBody(msg.source) : '').slice(0, 20000);

        messages.push({
          uid: String(msg.uid),
          subject: env.subject || '(no subject)',
          from_name: sender.name || '',
          from_email: sender.address || '',
          received_at: env.date ? new Date(env.date).toISOString() : new Date().toISOString(),
          body,
          seen: !!(msg.flags && msg.flags.has && msg.flags.has('\\Seen'))
        });
      }
    } finally {
      lock.release();
    }
    return { ok: true, messages: messages.reverse() };
  } catch (e) {
    return { ok: false, reason: e.message };
  } finally {
    try { await c.logout(); } catch (e) { /* connection already gone */ }
  }
}

module.exports = { isConfigured, missingConfig, fetchRecent, configure };
