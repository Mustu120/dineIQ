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

const CUISINE_WEIGHT = 0.5;
const PRICE_WEIGHT = 0.25;
const RATING_WEIGHT = 0.25;

// Scores one candidate restaurant against a user's preference profile.
// See the formula walkthrough in the chat for what each piece means --
// this is just that math. Missing data (no price, no reviews yet) falls
// back to a neutral 0.5 rather than punishing the restaurant for it.
function scoreRestaurant(restaurant, profile, avgRating) {
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

  return (
    cuisineScore * CUISINE_WEIGHT +
    priceScore * PRICE_WEIGHT +
    ratingScore * RATING_WEIGHT
  );
}

module.exports = { buildPreferenceProfile, scoreRestaurant };
