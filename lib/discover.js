/**
 * Finds businesses to approach, without scraping anyone.
 *
 * Source is OpenStreetMap via the Overpass API: free, no key, and explicitly
 * open data. Scraping Google Maps was the obvious alternative and is not an
 * option — it breaks Google's terms, and the realistic outcome is a blocked IP
 * and a burned Google account, which costs more than the leads are worth.
 *
 * The trade-off is honest: OSM's coverage of small US businesses is thinner than
 * Google's, so expect fewer results per search. What comes back is real, though,
 * and it costs nothing. Yelp Fusion or Google Places can be added later behind
 * the same interface if the volume is ever worth paying for.
 *
 * Two cohorts come out of every search, and they need completely different
 * pitches:
 *   - has a website  -> audit it, lead with something specific that is wrong
 *   - has no website -> there is nothing to audit; the pitch is that customers
 *     searching for them right now find nothing
 *
 * Reliability notes, learned the hard way from a run of 502s:
 *   - Overpass mirrors are free, unfunded and frequently overloaded. One mirror
 *     failing is normal, so we walk a list and retry transient failures rather
 *     than surfacing the first 502 as if the search were impossible.
 *   - Resolving a place name inside Overpass (`area[name=...]`) is one of the
 *     most expensive things you can ask it to do, and it is the first thing to
 *     fail under load. Nominatim resolves the same name to a bounding box in one
 *     cheap call, and a bbox query is dramatically lighter on the mirror.
 *   - Querying only `node` silently loses every business mapped as a building
 *     outline rather than a pin. For dentists and clinics that is a large share
 *     of them, so we query nodes, ways and relations.
 */

// Verified by querying each one directly. Two caveats worth writing down:
//   - overpass.osm.ch answers 200 with zero results outside Switzerland. A
//     regional extract is worse than a dead mirror, because an empty success
//     looks like "there are no dentists in Los Angeles". Never add one.
//   - maps.mail.ru is a long-standing public mirror that is reachable when the
//     main instance is not. The request carries a bounding box and OSM tags and
//     nothing else — no visitor or client data — but it is a third-party host,
//     so drop this line if you would rather not use it.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

const UA = 'JomiezProspecting/1.0 (+https://www.jomiez.com; hello@jomiez.com)';

// Trades where one job is worth enough to justify a website, and where the owner
// is typically on site and missing calls — the argument that actually lands.
const CATEGORIES = {
  contractors: ['craft~"plumber|electrician|hvac|roofer|carpenter|painter|builder|glazier|tiler"', 'office="construction_company"', 'shop="doityourself"'],
  dentists: ['amenity="dentist"', 'healthcare="dentist"'],
  clinics: ['amenity~"clinic|doctors"', 'healthcare~"clinic|doctor|physiotherapist|podiatrist"'],
  lawyers: ['office~"lawyer|notary"'],
  realestate: ['office="estate_agent"'],
  salons: ['shop~"hairdresser|beauty|nail"', 'leisure="spa"'],
  fitness: ['leisure="fitness_centre"', 'amenity="gym"'],
  autoshops: ['shop~"car_repair|tyres|car_parts"'],
  accountants: ['office~"accountant|tax_advisor|financial|insurance"'],
  vets: ['amenity="veterinary"']
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Turns "Los Angeles" into a bounding box.
 *
 * Doing this here instead of inside the Overpass query is the single biggest
 * reliability win available: it removes the area lookup that was timing out.
 */
async function resolvePlace(place) {
  const url = 'https://nominatim.openstreetmap.org/search'
    + `?q=${encodeURIComponent(place)}&format=json&limit=1&addressdetails=0`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(20000)
    });
    if (!res.ok) return { ok: false, reason: `Place lookup returned ${res.status}.` };
    const rows = await res.json();
    if (!rows.length) {
      return { ok: false, reason: `No place called "${place}" was found. Try the city name on its own, e.g. "Los Angeles" or "Los Angeles, California".` };
    }
    // Nominatim gives [south, north, west, east] as strings.
    const [s, n, w, e] = rows[0].boundingbox.map(Number);
    if ([s, n, w, e].some(v => !Number.isFinite(v))) {
      return { ok: false, reason: 'Place lookup returned an unusable area.' };
    }
    return { ok: true, bbox: [s, w, n, e], label: rows[0].display_name };
  } catch (err) {
    return { ok: false, reason: `Place lookup failed: ${err.message}` };
  }
}

function buildQuery(category, bbox, limit) {
  const selectors = CATEGORIES[category] || CATEGORIES.contractors;
  const box = bbox.join(',');
  // nwr = node + way + relation. A dentist mapped as a building outline is a way,
  // and querying nodes alone dropped those entirely.
  const body = selectors.map(sel => `  nwr[${sel}](${box});`).join('\n');
  return `[out:json][timeout:60];
(
${body}
);
out center ${Math.min(limit, 300)};`;
}

function normalise(el) {
  const t = el.tags || {};
  const website = t.website || t['contact:website'] || t.url || '';
  const phone = t.phone || t['contact:phone'] || t['contact:mobile'] || '';
  const email = t.email || t['contact:email'] || '';
  const addr = [t['addr:housenumber'], t['addr:street'], t['addr:city']].filter(Boolean).join(' ');
  // Ways and relations carry no lat/lon of their own; `out center` supplies one.
  const lat = el.lat != null ? el.lat : (el.center && el.center.lat);
  const lon = el.lon != null ? el.lon : (el.center && el.center.lon);
  return {
    osm_id: `${el.type || 'node'}/${el.id}`,
    name: t.name || t.operator || t.brand || '',
    website: website && /^https?:\/\//i.test(website) ? website : (website ? `https://${website}` : ''),
    phone,
    email,
    address: addr,
    category: t.craft || t.office || t.shop || t.amenity || t.healthcare || t.leisure || '',
    lat, lon
  };
}

/** One Overpass attempt. Separates "this mirror is busy" from "this query is wrong". */
async function askOverpass(endpoint, query) {
  const res = await fetch(endpoint, {
    method: 'POST',
    body: query,
    headers: { 'Content-Type': 'text/plain', 'User-Agent': UA },
    signal: AbortSignal.timeout(70000)
  });
  if (res.ok) return { ok: true, data: await res.json() };
  // 429 and 504 are Overpass's documented "I am busy" codes; 502/503 are the
  // proxy in front of it giving up. All are worth trying elsewhere.
  const transient = [429, 502, 503, 504].includes(res.status);
  return { ok: false, transient, status: res.status };
}

/**
 * @param {string} category key from CATEGORIES
 * @param {string} place    a city or area name, e.g. "Los Angeles"
 * @param {number} limit
 */
async function findBusinesses(category, place, limit = 60) {
  const located = await resolvePlace(place);
  if (!located.ok) return { ok: false, reason: located.reason };

  const query = buildQuery(category, located.bbox, limit);
  const failures = [];

  // Paced deliberately. Overpass rate-limits per IP with a small number of
  // concurrent slots, so firing every mirror at once turns one busy server into
  // a throttle across all of them — an earlier burst-retry version caused the
  // failures it was written to survive. One request at a time, with a gap.
  let firstAttempt = true;
  for (let round = 0; round < 2; round++) {
    for (const endpoint of OVERPASS_ENDPOINTS) {
      const host = new URL(endpoint).host;
      if (!firstAttempt) await sleep(2500);
      firstAttempt = false;
      try {
        const attempt = await askOverpass(endpoint, query);
        if (attempt.ok) {
          const all = (attempt.data.elements || []).map(normalise).filter(b => b.name);
          // Ways and their nodes can both be tagged, producing the same business twice.
          const seen = new Set();
          const unique = all.filter(b => {
            const key = `${b.name.toLowerCase()}|${b.address.toLowerCase() || b.phone || b.osm_id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          return {
            ok: true,
            place: located.label || place,
            category,
            total: unique.length,
            withWebsite: unique.filter(b => b.website),
            withoutWebsite: unique.filter(b => !b.website)
          };
        }
        failures.push(`${host}: ${attempt.status}`);
        if (!attempt.transient) break; // a malformed query fails identically everywhere
      } catch (err) {
        failures.push(`${host}: ${err.name === 'TimeoutError' ? 'timed out' : err.message}`);
      }
    }
    if (round === 0) await sleep(10000);
  }

  return {
    ok: false,
    reason: `Every OpenStreetMap mirror was busy or unreachable. These are free community servers and they do go down — wait a minute and search again. (${failures.slice(0, 4).join('; ')})`
  };
}

module.exports = { findBusinesses, resolvePlace, CATEGORIES: Object.keys(CATEGORIES) };
