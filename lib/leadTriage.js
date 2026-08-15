/**
 * Lead triage.
 *
 * Most of what lands in client_leads is not a client. It is cold outreach —
 * agencies pitching SEO, "we reviewed your website and found problems", link
 * sellers — plus test submissions and bots.
 *
 * This matters more than it looks. Auto-replying to a cold pitch burns model
 * credits, and replying to a scraped address confirms it is live, which reliably
 * increases the volume. Any automation has to know what NOT to answer.
 *
 * Scoring is deliberately conservative: it flags, it does not delete. A missed
 * spam costs one wasted draft; a real enquiry wrongly binned costs a client.
 */

// Phrases that show up when someone is selling TO you, not hiring you.
const PITCH_PHRASES = [
  'going through your website', 'came across your website', 'visited your website',
  'reviewed your website', 'completed the review', 'audit of your website',
  'appear on search engines', "google's first page", 'first page of google',
  'increase targeted traffic', 'increase your traffic', 'boost your ranking',
  'improve your ranking', 'search engine optimization', 'seo services',
  'lack of proper', 'not ranking', 'we can increase', 'we noticed that your',
  'i am a digital marketer', 'we are a digital marketing', 'link building',
  'guest post', 'backlink', 'domain authority', 'web design services at',
  'backend analysis', 'ran a analysis', 'not appearing on google', 'important seo',
  'seo steps are incomplete', 'we recently ran',
  'affordable price', 'kindly revert', 'please revert back', 'let me know if you are interested'
];

// A real enquiry usually describes something they want built.
const INTENT_PHRASES = [
  'i need', 'i want', 'we need', 'we want', 'looking for', 'can you build',
  'can you help', 'quote', 'how much', 'budget', 'timeline', 'my business',
  'my company', 'our startup', 'build me', 'build us', 'develop a', 'design a',
  'interested in hiring', 'work with you', 'project'
];

const THROWAWAY_EMAIL = /@(example|test|mailinator|guerrillamail|tempmail|yopmail|10minutemail)\./i;

function scoreLead(lead = {}) {
  const text = `${lead.project_scope || ''}`.toLowerCase();
  const email = String(lead.email || '').toLowerCase();
  const name = String(lead.name || '').toLowerCase();

  const reasons = [];
  let score = 0; // higher = more likely junk

  const pitchHits = PITCH_PHRASES.filter(p => text.includes(p));
  let pitchScore = 0;
  if (pitchHits.length) {
    pitchScore = Math.min(60, pitchHits.length * 25);
    score += pitchScore;
    reasons.push(`sales pitch language (${pitchHits.slice(0, 2).join('; ')})`);
  }

  if (THROWAWAY_EMAIL.test(email)) { score += 50; reasons.push('throwaway or example email domain'); }
  if (!email) { score += 25; reasons.push('no email address'); }
  if (/^(john doe|jane doe|test|asdf|anonymous)$/i.test(name.trim())) {
    score += 45; reasons.push('placeholder name');
  }

  // Cold pitches are long and generic; real first enquiries are usually short.
  if (text.length > 600 && pitchHits.length) { score += 10; reasons.push('long unsolicited pitch'); }

  // Intent phrases can only rescue a lead that isn't already clearly a pitch.
  // Cold outreach uses the same words about itself — "we want to help you rank",
  // "looking for keywords" — and that was cancelling a strong pitch score and
  // dropping SEO spam straight into the inbox.
  const intentHits = INTENT_PHRASES.filter(p => text.includes(p));
  if (intentHits.length && pitchScore < 40) {
    score -= Math.min(40, intentHits.length * 15);
    reasons.push(`states a need (${intentHits.slice(0, 2).join('; ')})`);
  } else if (intentHits.length) {
    reasons.push('uses need-like wording, but reads as outreach');
  }
  if (lead.budget && !/unknown|^$/i.test(String(lead.budget))) {
    score -= 20; reasons.push('gave a budget');
  }

  score = Math.max(0, Math.min(100, score));
  const verdict = score >= 60 ? 'junk' : score >= 30 ? 'unsure' : 'genuine';

  return {
    score,
    verdict,
    reasons,
    // Only ever auto-reply to something that looks like a real person with a real
    // need and a real address. Everything else waits for a human.
    safeToAutoReply: verdict === 'genuine' && !!email && !THROWAWAY_EMAIL.test(email)
  };
}

module.exports = { scoreLead };
