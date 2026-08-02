function average(numbers) {
  if (numbers.length === 0) return null;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

// Builds a taste profile from the restaurants a user has favourited: their
// most-favourited cuisine, average price level, and the average rating
// level of the places they favourite.
function buildPreferenceProfile(favouritedRestaurants, avgRatingByRestaurantId) {
  const cuisineCounts = {};
  favouritedRestaurants.forEach((restaurant) => {
    if (!restaurant.cuisine) return;
    cuisineCounts[restaurant.cuisine] = (cuisineCounts[restaurant.cuisine] || 0) + 1;
  });

  const topCuisine =
    Object.entries(cuisineCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const avgPriceLevel = average(
    favouritedRestaurants.map((r) => r.price_level).filter((p) => p != null)
  );

  const avgRating = average(
    favouritedRestaurants
      .map((r) => avgRatingByRestaurantId[r.id])
      .filter((rating) => rating != null)
  );

  return { topCuisine, avgPriceLevel, avgRating };
}

const CUISINE_WEIGHT = 0.4;
const PRICE_WEIGHT = 0.2;
const RATING_WEIGHT = 0.2;
const DISTANCE_WEIGHT = 0.2;

// Great-circle distance in km between two lat/lng points (Haversine
// formula) -- used only to rank recommendations by an exponential decay
// curve, not for the nearby-restaurant search itself (that's PostGIS's
// job, see supabase/schema.sql).
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Scores one candidate restaurant against a user's preference profile.
// See the formula walkthrough in the chat for what each piece means --
// this is just that math. Missing data (no price, no reviews yet, no
// known location) falls back to a neutral 0.5 rather than punishing the
// restaurant for it.
//
// Distance uses a decay curve (e^(-d/k)) rather than a hard cutoff, so an
// excellent restaurant just outside some arbitrary radius can still
// outscore a mediocre one right next door -- see Phase 13.3 of the guide
// for why a cliff is the wrong shape here.
function scoreRestaurant(restaurant, profile, avgRating, userLocation) {
  const cuisineScore =
    profile.topCuisine && restaurant.cuisine === profile.topCuisine ? 1 : 0;

  const priceScore =
    profile.avgPriceLevel != null && restaurant.price_level != null
      ? 1 - Math.abs(restaurant.price_level - profile.avgPriceLevel) / 3
      : 0.5;

  const ratingScore =
    profile.avgRating != null && avgRating != null
      ? 1 - Math.abs(avgRating - profile.avgRating) / 4
      : 0.5;

  let distanceScore = 0.5;
  let distanceKm = null;
  if (userLocation && restaurant.latitude != null && restaurant.longitude != null) {
    distanceKm = haversineKm(userLocation.lat, userLocation.lng, restaurant.latitude, restaurant.longitude);
    distanceScore = Math.exp(-distanceKm / 5); // k=5km -- half-life of a few km
  }

  const score =
    cuisineScore * CUISINE_WEIGHT +
    priceScore * PRICE_WEIGHT +
    ratingScore * RATING_WEIGHT +
    distanceScore * DISTANCE_WEIGHT;

  return { score, distanceKm };
}

module.exports = { buildPreferenceProfile, scoreRestaurant };
