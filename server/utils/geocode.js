const NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search";

// Nominatim's usage policy asks for a descriptive User-Agent identifying the
// app instead of a generic browser UA -- this is the etiquette that keeps a
// free, keyless geocoder usable for everyone, not just this app.
const USER_AGENT =
  "DineIQ/1.0 (restaurant discovery app; contact: insanetrickster074@gmail.com)";

// Turns a free-text search ("koramangala bangalore") into a short list of
// {label, latitude, longitude} suggestions, so the location search bar can
// jump the map anywhere in the world without a paid geocoding API. This is
// the same public service that powers openstreetmap.org's own search box.
async function searchPlaces(query) {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "0",
    limit: "6",
  });

  const res = await fetch(`${NOMINATIM_SEARCH}?${params}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(6000),
  });

  if (!res.ok) {
    throw new Error(`Nominatim responded ${res.status}`);
  }

  const results = await res.json();

  return results.map((r) => ({
    label: r.display_name,
    latitude: parseFloat(r.lat),
    longitude: parseFloat(r.lon),
  }));
}

module.exports = { searchPlaces };
