// Public Overpass API mirrors, tried in order. Overpass is OpenStreetMap's
// live query engine -- free, keyless, no billing -- so this is what makes
// "nearby restaurants" a real-time lookup instead of a database seeded
// once and left to rot.
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

const FOOD_AMENITIES = "restaurant|cafe|fast_food|bar|pub|food_court|ice_cream|biergarten";

// Same etiquette Nominatim asks for (see utils/geocode.js): public Overpass
// mirrors rate-limit or reject requests that show up with a generic/absent
// User-Agent, since that's usually a misbehaving bot. A descriptive one is
// what keeps a free, keyless API usable for everyone.
const USER_AGENT = "DineIQ/1.0 (restaurant discovery app; contact: insanetrickster074@gmail.com)";

// `around:radius,lat,lng` is Overpass QL's own proximity filter. Both nodes
// (a single point) and ways (a restaurant mapped as a building outline) are
// queried, and `out center` makes ways report a centre point too, so both
// shapes can be handled identically once the results come back.
function buildQuery(lat, lng, radiusM) {
  return `[out:json][timeout:20];(
    node["amenity"~"^(${FOOD_AMENITIES})$"](around:${radiusM},${lat},${lng});
    way["amenity"~"^(${FOOD_AMENITIES})$"](around:${radiusM},${lat},${lng});
  );out center tags;`;
}

function titleCase(str) {
  return str.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildAddress(tags) {
  const parts = [];
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  if (street) parts.push(street);
  if (tags["addr:city"]) parts.push(tags["addr:city"]);
  return parts.length ? parts.join(", ") : null;
}

// Converts one raw Overpass element into the shape restaurants.* expects.
// Returns null for elements that aren't actually usable (no name, no
// coordinates) so the caller can filter them out with a simple .filter(Boolean).
function normaliseElement(el) {
  const tags = el.tags || {};
  const name = tags.name || tags["name:en"];
  if (!name) return null;

  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (lat == null || lng == null) return null;

  const rawCuisine = tags.cuisine?.split(";")[0]?.trim();

  return {
    osm_id: `${el.type}/${el.id}`,
    name,
    cuisine: rawCuisine ? titleCase(rawCuisine) : null,
    latitude: lat,
    longitude: lng,
    address: buildAddress(tags),
    phone: tags.phone || tags["contact:phone"] || null,
    website: tags.website || tags["contact:website"] || null,
    opening_hours: tags.opening_hours || null,
  };
}

// Queries every food-related point within radiusM metres of (lat, lng),
// live. Public Overpass instances are shared infrastructure and
// occasionally slow or unreachable, so this tries a short list of mirrors
// and gives up quietly -- returning [] rather than throwing -- if all of
// them fail. The caller (see index.js) falls back to whatever's already
// cached in Supabase from earlier searches near this spot, so one Overpass
// outage never takes the whole search feature down with it.
async function fetchNearbyFromOverpass(lat, lng, radiusM) {
  const query = buildQuery(lat, lng, Math.min(radiusM, 8000));

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
        body: query,
        signal: AbortSignal.timeout(9000),
      });

      if (!res.ok) continue;

      const { elements } = await res.json();
      return elements.map(normaliseElement).filter(Boolean);
    } catch {
      continue; // this mirror is down or slow -- try the next one
    }
  }

  return [];
}

module.exports = { fetchNearbyFromOverpass };
