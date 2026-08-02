// Great-circle distance in km between two lat/lng points (Haversine
// formula). Used client-side only for map-interaction decisions (how far
// did the user pan, how big a radius does the visible viewport need) --
// the actual nearby-restaurant search is real PostGIS math on the server.
export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Radius (km) that comfortably covers the visible map viewport: distance
// from the centre to the north-east corner of the current bounds, with a
// floor and a ceiling so a fully zoomed-out map can't trigger a
// city-spanning Overpass query and a fully zoomed-in one still searches a
// useful area.
export function radiusForBounds(center, bounds) {
  const ne = bounds.getNorthEast();
  const raw = haversineKm(center.lat, center.lng, ne.lat(), ne.lng());
  return Math.min(Math.max(raw, 0.6), 8);
}
