// Restaurants only carry their own facts (name, address, ...) -- rating is
// derived from the reviews table, so it's computed here rather than stored.
// The nearby_restaurants SQL function does this join itself (Postgres can
// do it in one query), but a couple of routes fetch restaurants without
// going through that function -- this gives them the same avg_rating /
// review_count shape without duplicating the aggregation logic.
async function attachRatingAggregates(supabase, restaurants) {
  if (restaurants.length === 0) return restaurants;

  const ids = restaurants.map((r) => r.id);
  const { data: reviews, error } = await supabase
    .from("reviews")
    .select("restaurant_id, rating")
    .in("restaurant_id", ids);

  if (error || !reviews) return restaurants.map((r) => ({ ...r, avg_rating: null, review_count: 0 }));

  const ratingsByRestaurant = {};
  reviews.forEach(({ restaurant_id, rating }) => {
    (ratingsByRestaurant[restaurant_id] ??= []).push(rating);
  });

  return restaurants.map((restaurant) => {
    const ratings = ratingsByRestaurant[restaurant.id];
    return {
      ...restaurant,
      avg_rating: ratings ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
      review_count: ratings ? ratings.length : 0,
    };
  });
}

module.exports = { attachRatingAggregates };
