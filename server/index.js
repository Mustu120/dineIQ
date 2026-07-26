const express = require("express");
const cors = require("cors");
const supabase = require("./db");
const requireAuth = require("./middleware/auth");
const { analyzeSentiment, classifySentiment } = require("./utils/sentiment");
const findFrequentPhrases = require("./utils/phraseFrequency");
const { buildPreferenceProfile, scoreRestaurant } = require("./utils/recommendations");

const app = express();
// Render (and most hosts) assign the port at runtime via process.env.PORT --
// 5000 is only used as a fallback for local development.
const PORT = process.env.PORT || 5000;

// Allows the React app to call this API. CLIENT_URL should be set to the
// deployed frontend's URL in production; without it, any origin is allowed,
// which is fine for local development.
app.use(cors({ origin: process.env.CLIENT_URL || "*" }));
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Example route showing the Supabase connection in action.
// Requires the restaurants table (supabase/schema.sql) and real keys in .env.
app.get("/api/restaurants", async (req, res) => {
  const { data, error } = await supabase.from("restaurants").select("*");

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// Finds restaurants within `radius` km of (latitude, longitude), optionally
// narrowed down by cuisine and/or price_level. All the geospatial math
// happens in Postgres via the nearby_restaurants RPC function (see
// supabase/schema.sql) -- this route just validates input and passes it through.
app.get("/api/restaurants/nearby", async (req, res) => {
  const { latitude, longitude, radius, cuisine, price_level } = req.query;

  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);
  const radiusKm = parseFloat(radius);

  if (Number.isNaN(lat) || Number.isNaN(lng) || Number.isNaN(radiusKm)) {
    return res.status(400).json({
      error: "latitude, longitude, and radius (km) are required and must be numbers",
    });
  }

  const priceLevel = price_level !== undefined ? parseInt(price_level, 10) : null;
  if (price_level !== undefined && Number.isNaN(priceLevel)) {
    return res.status(400).json({ error: "price_level must be a number" });
  }

  const { data, error } = await supabase.rpc("nearby_restaurants", {
    lat,
    long: lng,
    radius_km: radiusKm,
    cuisine_filter: cuisine || null,
    price_level_filter: priceLevel,
  });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// Example protected route: only accessible with a valid Supabase session
// token. Try calling this without logging in first -- you'll get a 401.
app.get("/api/me", requireAuth, (req, res) => {
  res.json({ id: req.user.id, email: req.user.email });
});

// Creates a review. Requires login (the review is attached to req.user.id,
// not a user_id sent by the client, so people can't post as someone else).
// Sentiment analysis runs automatically here -- the caller never sends a
// sentiment_score, it's always computed server-side from the review text.
app.post("/api/reviews", requireAuth, async (req, res) => {
  const { restaurant_id, rating, review_text } = req.body;

  if (!restaurant_id || !rating) {
    return res.status(400).json({ error: "restaurant_id and rating are required" });
  }

  const { score } = analyzeSentiment(review_text);

  const { data, error } = await supabase
    .from("reviews")
    .insert({
      restaurant_id,
      user_id: req.user.id,
      rating,
      review_text,
      sentiment_score: score,
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.status(201).json(data);
});

// Lists the logged-in user's favourited restaurants, restaurant details
// included via Supabase's foreign-key join (aliased to `restaurant` so the
// frontend doesn't need to know the underlying table name).
app.get("/api/favourites", requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from("favourites")
    .select("id, restaurant_id, created_at, restaurant:restaurants(*)")
    .eq("user_id", req.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// Favourites a restaurant for the logged-in user.
app.post("/api/favourites", requireAuth, async (req, res) => {
  const { restaurant_id } = req.body;

  if (!restaurant_id) {
    return res.status(400).json({ error: "restaurant_id is required" });
  }

  const { data, error } = await supabase
    .from("favourites")
    .insert({ user_id: req.user.id, restaurant_id })
    .select("id, restaurant_id, created_at, restaurant:restaurants(*)")
    .single();

  if (error) {
    // Postgres unique_violation -- this restaurant is already favourited.
    if (error.code === "23505") {
      return res.status(409).json({ error: "Already favourited" });
    }
    return res.status(500).json({ error: error.message });
  }

  res.status(201).json(data);
});

// Removes a favourite by its own id. Scoped to the logged-in user's id as
// well as the row id, so nobody can delete someone else's favourite by
// guessing its id.
app.delete("/api/favourites/:id", requireAuth, async (req, res) => {
  const { error, count } = await supabase
    .from("favourites")
    .delete({ count: "exact" })
    .eq("id", req.params.id)
    .eq("user_id", req.user.id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  if (count === 0) {
    return res.status(404).json({ error: "Favourite not found" });
  }

  res.status(204).send();
});

// Looks at a restaurant's negative reviews (sentiment_score < 0) and
// returns the most frequently repeated two-word complaint phrases, e.g.
// "slow service" or "cold food".
app.get("/api/restaurants/:id/complaints", async (req, res) => {
  const { data, error } = await supabase
    .from("reviews")
    .select("review_text")
    .eq("restaurant_id", req.params.id)
    .lt("sentiment_score", 0);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const complaints = findFrequentPhrases(
    data.map((review) => review.review_text)
  );

  res.json(complaints);
});

// Builds the summary shown on a restaurant's detail page: overall sentiment
// as a percentage, plus the top 3 recurring compliments and complaints.
// Compliments come from positive reviews, complaints from negative ones --
// same phrase-frequency logic used by /complaints above, just run twice.
app.get("/api/restaurants/:id/summary", async (req, res) => {
  const { data, error } = await supabase
    .from("reviews")
    .select("review_text, sentiment_score")
    .eq("restaurant_id", req.params.id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const totalReviews = data.length;

  if (totalReviews === 0) {
    return res.json({
      totalReviews: 0,
      positivePercent: 0,
      neutralPercent: 0,
      negativePercent: 0,
      topCompliments: [],
      topComplaints: [],
    });
  }

  const positiveReviews = [];
  const negativeReviews = [];
  let positiveCount = 0;
  let neutralCount = 0;
  let negativeCount = 0;

  data.forEach((review) => {
    const label = classifySentiment(review.sentiment_score);
    if (label === "positive") {
      positiveCount++;
      positiveReviews.push(review.review_text);
    } else if (label === "negative") {
      negativeCount++;
      negativeReviews.push(review.review_text);
    } else {
      neutralCount++;
    }
  });

  res.json({
    totalReviews,
    positivePercent: Math.round((positiveCount / totalReviews) * 100),
    neutralPercent: Math.round((neutralCount / totalReviews) * 100),
    negativePercent: Math.round((negativeCount / totalReviews) * 100),
    topCompliments: findFrequentPhrases(positiveReviews, 3),
    topComplaints: findFrequentPhrases(negativeReviews, 3),
  });
});

// Data for the restaurant owner/admin analytics dashboard: review volume
// over time, an overall sentiment breakdown, and the top complaint
// keywords. Shaped directly for the three charts the frontend renders --
// no chart-specific reshaping happens on the client.
//
// Note: this route isn't restricted to the restaurant's actual owner --
// there's no owner/role concept in the schema yet (restaurants aren't
// linked to a user). Anyone logged in can view it for now.
app.get("/api/restaurants/:id/analytics", requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from("reviews")
    .select("review_text, sentiment_score, created_at")
    .eq("restaurant_id", req.params.id)
    .order("created_at", { ascending: true });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const countByDate = {};
  const negativeReviews = [];
  let positiveCount = 0;
  let neutralCount = 0;
  let negativeCount = 0;

  data.forEach((review) => {
    const date = review.created_at.slice(0, 10); // YYYY-MM-DD
    countByDate[date] = (countByDate[date] || 0) + 1;

    const label = classifySentiment(review.sentiment_score);
    if (label === "positive") positiveCount++;
    else if (label === "negative") {
      negativeCount++;
      negativeReviews.push(review.review_text);
    } else neutralCount++;
  });

  const reviewsOverTime = Object.entries(countByDate)
    .sort(([dateA], [dateB]) => (dateA < dateB ? -1 : 1))
    .map(([date, count]) => ({ date, count }));

  res.json({
    reviewsOverTime,
    sentimentBreakdown: [
      { name: "Positive", value: positiveCount },
      { name: "Neutral", value: neutralCount },
      { name: "Negative", value: negativeCount },
    ],
    topComplaints: findFrequentPhrases(negativeReviews, 5),
  });
});

// Recommends restaurants for the logged-in user based on the restaurants
// they've favourited so far. See utils/recommendations.js for the scoring
// formula; this route just gathers the data it needs and applies it.
app.get("/api/recommendations", requireAuth, async (req, res) => {
  const { data: favourites, error: favError } = await supabase
    .from("favourites")
    .select("restaurant_id")
    .eq("user_id", req.user.id);

  if (favError) {
    return res.status(500).json({ error: favError.message });
  }

  const favouritedIds = favourites.map((f) => f.restaurant_id);

  if (favouritedIds.length === 0) {
    return res.json({
      recommendations: [],
      message: "Favourite a few restaurants to get personalized recommendations.",
    });
  }

  const [{ data: allRestaurants, error: restaurantsError }, { data: allReviews, error: reviewsError }] =
    await Promise.all([
      supabase.from("restaurants").select("*"),
      supabase.from("reviews").select("restaurant_id, rating"),
    ]);

  if (restaurantsError) return res.status(500).json({ error: restaurantsError.message });
  if (reviewsError) return res.status(500).json({ error: reviewsError.message });

  // Average rating per restaurant, computed once and reused for both the
  // user's favourites (to build their profile) and every candidate
  // restaurant (to score it).
  const ratingsByRestaurant = {};
  allReviews.forEach((review) => {
    if (!ratingsByRestaurant[review.restaurant_id]) {
      ratingsByRestaurant[review.restaurant_id] = [];
    }
    ratingsByRestaurant[review.restaurant_id].push(review.rating);
  });

  const avgRatingByRestaurantId = {};
  Object.entries(ratingsByRestaurant).forEach(([id, ratings]) => {
    avgRatingByRestaurantId[id] = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
  });

  const favouritedRestaurants = allRestaurants.filter((r) => favouritedIds.includes(r.id));
  const profile = buildPreferenceProfile(favouritedRestaurants, avgRatingByRestaurantId);

  const recommendations = allRestaurants
    .filter((r) => !favouritedIds.includes(r.id))
    .map((restaurant) => ({
      ...restaurant,
      score: scoreRestaurant(restaurant, profile, avgRatingByRestaurantId[restaurant.id] ?? null),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  res.json({ profile, recommendations });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
