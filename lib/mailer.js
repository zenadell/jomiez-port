const { Resend } = require('resend');

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
async function sendLeadReply({ to, subject, body, replyTo, dryRun = false }) {
  const missing = missingConfig();
  if (missing.length) {
    return { sent: false, reason: `Email is not configured. Missing: ${missing.join(', ')}` };
  }
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(to))) {
    return { sent: false, reason: `Refusing to send to an invalid address: ${to || '(empty)'}` };
  }

  const payload = {
    from: process.env.LEAD_FROM_EMAIL,
    to: [to],
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

module.exports = { isConfigured, missingConfig, sendLeadReply, notifyOwner };
