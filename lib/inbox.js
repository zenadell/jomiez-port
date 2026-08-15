const { ImapFlow } = require('imapflow');

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

function isConfigured() {
  return !!(process.env.IMAP_HOST && process.env.IMAP_USER && process.env.IMAP_PASSWORD);
}

function missingConfig() {
  return ['IMAP_HOST', 'IMAP_USER', 'IMAP_PASSWORD'].filter(k => !process.env[k]);
}

function client() {
  return new ImapFlow({
    host: process.env.IMAP_HOST,
    port: Number(process.env.IMAP_PORT || 993),
    secure: true,
    auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASSWORD },
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
        // Parsing the full MIME tree needs another dependency; the plain-text part
        // is enough for reading and replying, which is all this panel does.
        const raw = msg.source ? msg.source.toString('utf8') : '';
        const split = raw.split(/\r?\n\r?\n/);
        const body = tidyBody(split.slice(1).join('\n\n')).slice(0, 20000);

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

module.exports = { isConfigured, missingConfig, fetchRecent };
