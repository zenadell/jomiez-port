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
 */

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

// Trades where one job is worth enough to justify a website, and where the owner
// is typically on site and missing calls — the argument that actually lands.
const CATEGORIES = {
  contractors: ['node["craft"~"plumber|electrician|hvac|roofer|carpenter|painter|builder"]', 'node["office"="construction_company"]', 'node["shop"="doityourself"]'],
  dentists: ['node["amenity"="dentist"]', 'node["healthcare"="dentist"]'],
  clinics: ['node["amenity"="clinic"]', 'node["amenity"="doctors"]', 'node["healthcare"~"clinic|doctor|physiotherapist"]'],
  lawyers: ['node["office"="lawyer"]', 'node["office"="notary"]'],
  realestate: ['node["office"="estate_agent"]'],
  salons: ['node["shop"~"hairdresser|beauty"]', 'node["leisure"="spa"]'],
  fitness: ['node["leisure"="fitness_centre"]', 'node["amenity"="gym"]'],
  autoshops: ['node["shop"="car_repair"]', 'node["shop"="tyres"]'],
  accountants: ['node["office"~"accountant|tax_advisor|financial"]'],
  vets: ['node["amenity"="veterinary"]']
};

function buildQuery(category, place, limit) {
  const selectors = CATEGORIES[category] || CATEGORIES.contractors;
  const body = selectors.map(sel => `  ${sel}(area.a);`).join('\n');
  return `[out:json][timeout:40];
area["name"="${place.replace(/"/g, '')}"]["boundary"="administrative"]->.a;
(
${body}
);
out body ${Math.min(limit, 200)};`;
}

function normalise(el) {
  const t = el.tags || {};
  const website = t.website || t['contact:website'] || '';
  const phone = t.phone || t['contact:phone'] || '';
  const email = t.email || t['contact:email'] || '';
  const addr = [t['addr:housenumber'], t['addr:street'], t['addr:city']].filter(Boolean).join(' ');
  return {
    osm_id: `${el.type || 'node'}/${el.id}`,
    name: t.name || '',
    website: website && /^https?:\/\//i.test(website) ? website : (website ? `https://${website}` : ''),
    phone,
    email,
    address: addr,
    category: t.craft || t.office || t.shop || t.amenity || t.healthcare || t.leisure || '',
    lat: el.lat, lon: el.lon
  };
}

/**
 * @param {string} category key from CATEGORIES
 * @param {string} place    an administrative area name, e.g. "Los Angeles"
 * @param {number} limit
 */
async function findBusinesses(category, place, limit = 60) {
  const query = buildQuery(category, place, limit);
  let lastErr = null;

  // Overpass mirrors rate-limit and go down; try the next before giving up.
  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        body: query,
        headers: { 'Content-Type': 'text/plain', 'User-Agent': 'JomiezProspecting/1.0 (+https://www.jomiez.com)' },
        signal: AbortSignal.timeout(50000)
      });
      if (!res.ok) { lastErr = new Error(`${endpoint} returned ${res.status}`); continue; }

      const data = await res.json();
      const all = (data.elements || []).map(normalise).filter(b => b.name);

      return {
        ok: true,
        place,
        category,
        total: all.length,
        withWebsite: all.filter(b => b.website),
        withoutWebsite: all.filter(b => !b.website)
      };
    } catch (e) {
      lastErr = e;
    }
  }
  return { ok: false, reason: lastErr ? lastErr.message : 'All Overpass endpoints failed.' };
}

module.exports = { findBusinesses, CATEGORIES: Object.keys(CATEGORIES) };
