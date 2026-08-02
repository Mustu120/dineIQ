// Google Places API (New). This is a billed API -- it needs
// GOOGLE_PLACES_API_KEY (a separate, server-side-only key; see
// server/.env.example) and "Places API (New)" enabled on the project.
//
// Nearby Search now drives restaurant discovery directly (every map
// search/pan spends a billed call, cached into Supabase by
// google_place_id -- see syncNearbyFromGooglePlaces in index.js), with
// the free OpenStreetMap Overpass path kept only as a fallback if Google's
// API is unreachable. Per-restaurant review import (findPlaceId /
// getPlaceReviews) stays lazy and cached for 30 days regardless.
const PLACES_BASE = "https://places.googleapis.com/v1";

// Nearby Search (New): the primary restaurant-discovery call. Google caps
// this at 20 results per request (tighter than Overpass's effectively
// unlimited radius query) and there's no pagination for it, so a single
// search only ever returns the top 20 by Google's own relevance ranking.
const FOOD_TYPES = ["restaurant", "cafe", "meal_takeaway", "bar", "bakery"];

function mapPriceLevel(level) {
  switch (level) {
    case "PRICE_LEVEL_FREE":
    case "PRICE_LEVEL_INEXPENSIVE":
      return 1;
    case "PRICE_LEVEL_MODERATE":
      return 2;
    case "PRICE_LEVEL_EXPENSIVE":
      return 3;
    case "PRICE_LEVEL_VERY_EXPENSIVE":
      return 4;
    default:
      return null;
  }
}

async function searchNearbyPlaces(lat, lng, radiusM) {
  const res = await fetch(`${PLACES_BASE}/places:searchNearby`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey(),
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.location",
        "places.formattedAddress",
        "places.rating",
        "places.userRatingCount",
        "places.priceLevel",
        "places.primaryTypeDisplayName",
        "places.internationalPhoneNumber",
        "places.websiteUri",
        "places.regularOpeningHours.weekdayDescriptions",
        // `photos` is what bumps this whole request to a pricier Google
        // pricing tier -- worth knowing since Nearby Search already runs
        // on every map search/pan, not just once per restaurant. Only the
        // reference is fetched here; resolving it into actual image bytes
        // (fetchPhotoBytes, below) is a further, separate billed call,
        // done lazily and cached forever in Supabase Storage -- see
        // GET /api/restaurants/:id/photo in server/index.js.
        "places.photos",
      ].join(","),
    },
    body: JSON.stringify({
      includedTypes: FOOD_TYPES,
      maxResultCount: 20,
      locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: Math.min(radiusM, 50000) } },
    }),
    signal: AbortSignal.timeout(9000),
  });

  if (!res.ok) throw new Error(`Places nearby search responded ${res.status}`);

  const { places } = await res.json();

  return (places || [])
    .filter((place) => place.displayName?.text && place.location)
    .map((place) => {
      const photo = place.photos?.[0];
      return {
        google_place_id: place.id,
        name: place.displayName.text,
        cuisine: place.primaryTypeDisplayName?.text || null,
        latitude: place.location.latitude,
        longitude: place.location.longitude,
        address: place.formattedAddress || null,
        phone: place.internationalPhoneNumber || null,
        website: place.websiteUri || null,
        opening_hours: place.regularOpeningHours?.weekdayDescriptions?.join("; ") || null,
        price_level: mapPriceLevel(place.priceLevel),
        google_rating: place.rating ?? null,
        google_review_count: place.userRatingCount ?? null,
        photo_reference: photo?.name || null,
        photo_attribution: photo?.authorAttributions?.[0]?.displayName || null,
      };
    });
}

// Resolves a photo_reference (Google's resource name, e.g.
// "places/ID/photos/PHOTO_ID") into actual image bytes. This is the call
// that's billed every time it's made -- callers should fetch it once per
// restaurant and cache the result (see server/index.js), never call it on
// every page view.
async function fetchPhotoBytes(photoReference, maxWidthPx = 800) {
  const res = await fetch(`${PLACES_BASE}/${photoReference}/media?maxWidthPx=${maxWidthPx}`, {
    headers: { "X-Goog-Api-Key": apiKey() },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`Place photo media responded ${res.status}`);

  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get("content-type") || "image/jpeg",
  };
}

function apiKey() {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("GOOGLE_PLACES_API_KEY is not set");
  return key;
}

const MAX_MATCH_DISTANCE_KM = 2;

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Text Search (New): matches a restaurant we already know the name and
// approximate location of (from OSM) to Google's own Place ID.
// locationBias is only a *soft* hint, not a filter -- a generic or
// franchise-like name ("The Halal Guys", "Cafe Coffee Day") can still
// come back as some famous, completely unrelated place on the other side
// of the world if that listing has a stronger text match. So the result's
// own coordinates are checked against the restaurant we searched for, and
// anything more than MAX_MATCH_DISTANCE_KM away is treated as no match at
// all -- importing another restaurant's reviews under our name would be
// worse than importing nothing (Phase 19.2 of the guide: flag uncertain
// matches rather than auto-merge them).
async function findPlaceId(name, lat, lng) {
  const res = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey(),
      "X-Goog-FieldMask": "places.id,places.displayName,places.location",
    },
    body: JSON.stringify({
      textQuery: name,
      locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 300 } },
      maxResultCount: 1,
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`Places text search responded ${res.status}`);

  const { places } = await res.json();
  const match = places?.[0];
  if (!match?.location) return null;

  const distanceKm = haversineKm(lat, lng, match.location.latitude, match.location.longitude);
  if (distanceKm > MAX_MATCH_DISTANCE_KM) return null;

  return match.id;
}

// Place Details (New): the `reviews` field is what makes this call billed
// beyond the Essentials tier -- Google returns at most 5 reviews per
// place, same limit the build guide notes for the legacy API.
async function getPlaceReviews(placeId) {
  const res = await fetch(`${PLACES_BASE}/places/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": apiKey(),
      "X-Goog-FieldMask": "id,rating,userRatingCount,reviews",
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`Place details responded ${res.status}`);

  const place = await res.json();

  return {
    rating: place.rating ?? null,
    reviewCount: place.userRatingCount ?? 0,
    reviews: (place.reviews || []).map((review) => ({
      externalId: review.name, // "places/{placeId}/reviews/{reviewId}" -- stable and unique
      rating: review.rating,
      text: review.text?.text || review.originalText?.text || "",
      authorName: review.authorAttribution?.displayName || "Google user",
      publishTime: review.publishTime || null,
    })),
  };
}

module.exports = { searchNearbyPlaces, findPlaceId, getPlaceReviews, fetchPhotoBytes };
