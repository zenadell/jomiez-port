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
 * National chains and franchise storefronts.
 *
 * They dominate a map search and are all dead ends: the website belongs to a
 * head office that will never read a cold email, and the local manager cannot
 * commission one. Filtering them here saves reading past them on every search.
 */
const CHAIN_NAME = /\b(valvoline|jiffy lube|midas|meineke|aamco|maaco|pep boys|firestone|autozone|o'?reilly|napa auto|advance auto|discount tire|america'?s tire|les schwab|mavis|monro|take 5|grease monkey|ziebart|maaco)\b/i
  .source + '|' + /\b(aaa|nationwide|farmers insurance|state farm|allstate|geico|progressive|liberty mutual|h&r block|jackson hewitt)\b/i.source
  + '|' + /\b(western dental|aspen dental|smile ?direct|banfield|vca |petco|petsmart|supercuts|great clips|sport ?clips|fantastic sams|drybar|massage envy|european wax|planet fitness|la fitness|24 hour fitness|orangetheory|anytime fitness|crunch fitness|equinox)\b/i.source
  + '|' + /\b(home depot|lowe'?s|ace hardware|sherwin.?williams|behr|benjamin moore|84 lumber|builders firstsource)\b/i.source;
const CHAIN_RE = new RegExp(CHAIN_NAME, 'i');

// Franchise and directory hosts: a per-branch page on a corporate domain is not
// a website the local owner controls or could pay to have replaced.
const CHAIN_HOST = /(^|\.)((aaa|nationwide|farmers|statefarm|allstate|geico|progressive)\.com|(autozone|oreillyauto|napaonline|advanceautoparts|discounttire|americastire|vioc|valvoline|jiffylube|midas|meineke|aamco)\.com|locations\.|store\.|agents?\.|agency\.)/i;

function isChain(b) {
  if (CHAIN_RE.test(b.name || '')) return true;
  if (b.brand) return true;                    // OSM tags brand only on chains
  try { return CHAIN_HOST.test(new URL(b.website).hostname); } catch (e) { return false; }
}

// Geocoding results never change, and Render's outbound IP is shared with every
// other service on the host — which is why Nominatim started answering 429 in
// production while working fine from a laptop. Cache aggressively and never ask
// twice for the same place.
const placeCache = new Map();

async function askPhoton(place) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(place)}&limit=1`;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) return { ok: false, reason: `Photon ${res.status}` };
  const data = await res.json();
  const hit = (data.features || [])[0];
  if (!hit || !hit.properties || !hit.properties.extent) return { ok: false, reason: 'Photon had no area for that name' };
  // Photon extent is [west, north, east, south].
  const [w, n, e, sth] = hit.properties.extent.map(Number);
  if ([w, n, e, sth].some(v => !Number.isFinite(v))) return { ok: false, reason: 'Photon returned an unusable area' };
  return { ok: true, bbox: [sth, w, n, e], label: hit.properties.name || place };
}

async function askNominatim(place) {
  const url = 'https://nominatim.openstreetmap.org/search'
    + `?q=${encodeURIComponent(place)}&format=json&limit=1&addressdetails=0`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en' },
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) return { ok: false, reason: `Nominatim ${res.status}` };
  const rows = await res.json();
  if (!rows.length) return { ok: false, reason: 'not found' };
  // Nominatim gives [south, north, west, east] as strings.
  const [sth, n, w, e] = rows[0].boundingbox.map(Number);
  if ([sth, n, w, e].some(v => !Number.isFinite(v))) return { ok: false, reason: 'unusable area' };
  return { ok: true, bbox: [sth, w, n, e], label: rows[0].display_name };
}

/**
 * Turns "Los Angeles" into a bounding box.
 *
 * Two independent geocoders, because a single one is a single point of failure
 * and this is the very first step of every search — when it fails, nothing works.
 * If both are unreachable the caller falls back to resolving the name inside
 * Overpass, which is slower but keeps the feature alive.
 */
async function resolvePlace(place) {
  const key = place.toLowerCase().trim();
  if (placeCache.has(key)) return placeCache.get(key);

  const reasons = [];
  for (const [name, fn] of [['Photon', askPhoton], ['Nominatim', askNominatim]]) {
    try {
      const got = await fn(place);
      if (got.ok) { placeCache.set(key, got); return got; }
      reasons.push(`${name}: ${got.reason}`);
    } catch (err) {
      reasons.push(`${name}: ${err.name === 'TimeoutError' ? 'timed out' : err.message}`);
    }
  }
  // "not found" from both means the name is wrong, not that the services are down.
  const nameIsWrong = reasons.every(r => /not found|no area/i.test(r));
  return {
    ok: false,
    softFail: !nameIsWrong,
    reason: nameIsWrong
      ? `No place called "${place}" was found. Try the city on its own, e.g. "Los Angeles" or "Los Angeles, California".`
      : `Could not look up "${place}" (${reasons.join('; ')}).`
  };
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

/** Fallback: let Overpass resolve the place name itself. Slower and load-sensitive. */
function buildAreaQuery(category, place, limit) {
  const selectors = CATEGORIES[category] || CATEGORIES.contractors;
  const body = selectors.map(sel => `  nwr[${sel}](area.a);`).join('\n');
  return `[out:json][timeout:90];
area["name"="${place.replace(/["\\]/g, '')}"]["boundary"="administrative"]->.a;
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
    brand: t.brand || t['brand:wikidata'] || '',
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
  if (!located.ok && !located.softFail) return { ok: false, reason: located.reason };

  // Both geocoders unreachable: fall back to resolving the name inside Overpass.
  // It is the expensive path this code exists to avoid, but a slow search beats
  // no search.
  const query = located.ok
    ? buildQuery(category, located.bbox, limit)
    : buildAreaQuery(category, place, limit);
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
          const independents = unique.filter(b => !isChain(b));
          return {
            ok: true,
            place: located.label || place,
            category,
            total: independents.length,
            chainsFiltered: unique.length - independents.length,
            withWebsite: independents.filter(b => b.website),
            withoutWebsite: independents.filter(b => !b.website)
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
