const express = require("express");
const cors = require("cors");
const supabase = require("./db");
const requireAuth = require("./middleware/auth");
const { analyzeSentiment, classifySentiment } = require("./utils/sentiment");
const findFrequentPhrases = require("./utils/phraseFrequency");
const { summarise } = require("./utils/extractiveSummary");
const { buildPreferenceProfile, scoreRestaurant } = require("./utils/recommendations");
const { fetchNearbyFromOverpass } = require("./utils/overpass");
const { searchPlaces } = require("./utils/geocode");
const { attachRatingAggregates } = require("./utils/ratings");
const { searchNearbyPlaces, findPlaceId, getPlaceReviews, fetchPhotoBytes } = require("./utils/googlePlaces");

const GOOGLE_SYNC_MAX_AGE_DAYS = 30; // Google's Places API caching policy caps how long review data may be cached

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

// Live-syncs restaurants near (lat, lng) from Google Places Nearby Search
// (New) into Supabase, keyed on google_place_id so the same place found
// again updates its existing row instead of duplicating it. This is a
// billed call on every search -- deliberate, per the product decision to
// show real Google data (and real Google ratings) at browse time, not
// just on a restaurant's own detail page.
//
// Also imports each result's Google reviews immediately (via
// syncGoogleReviews, the same function GET /api/restaurants/:id/reviews
// uses lazily) rather than waiting for someone to open its detail page --
// product decision: reviews should be visible without clicking in. This
// is a real, meaningful cost step up from the lazy version: a 20-result
// search now makes up to 20 additional billed Place Details calls
// alongside the Nearby Search call itself. syncGoogleReviews' own 30-day
// cache still applies per restaurant, so re-searching an already-covered
// area doesn't re-bill for places already synced recently -- the cost is
// concentrated on genuinely new restaurants. Fetched in parallel since
// each one is an independent network call; one restaurant's failure
// (syncGoogleReviews catches its own errors) never blocks the rest.
//
// Falls back to the free OpenStreetMap Overpass API (server/utils/overpass.js)
// if Google's Nearby Search itself throws (down, over quota, misconfigured
// key) -- non-fatal either way, so one bad call doesn't take the whole
// search feature down. The nearby_restaurants query right after this runs
// against whatever's already cached in Supabase regardless of which path
// (or neither) succeeded.
async function syncNearbyFromGooglePlaces(lat, lng, radiusKm) {
  try {
    const live = await searchNearbyPlaces(lat, lng, Math.round(radiusKm * 1000));
    if (live.length > 0) {
      // Deliberately NOT setting google_synced_at here -- that column is
      // syncGoogleReviews' own cache marker (see below), and stamping it
      // at discovery time would make every restaurant look "already
      // synced" before syncGoogleReviews ever got a chance to run,
      // silently skipping every review import.
      const rows = live.map((restaurant) => ({
        ...restaurant,
        source: "google",
        last_synced_at: new Date().toISOString(),
      }));

      const { data: upserted, error } = await supabase
        .from("restaurants")
        .upsert(rows, { onConflict: "google_place_id" })
        .select("id, name, latitude, longitude, google_place_id, google_synced_at, google_rating, google_review_count");

      if (error) {
        console.error("Google nearby sync failed to upsert:", error.message);
      } else {
        await Promise.all(upserted.map((restaurant) => syncGoogleReviews(restaurant)));
      }
      return;
    }
  } catch (err) {
    console.error("Google nearby sync failed, falling back to Overpass:", err.message);
  }

  try {
    const live = await fetchNearbyFromOverpass(lat, lng, Math.round(radiusKm * 1000));
    if (live.length === 0) return;

    const rows = live.map((restaurant) => ({
      ...restaurant,
      source: "osm",
      last_synced_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from("restaurants").upsert(rows, { onConflict: "osm_id" });
    if (error) console.error("Overpass fallback sync failed to upsert:", error.message);
  } catch (err) {
    console.error("Overpass fallback sync failed:", err.message);
  }
}

// Finds restaurants within `radius` km of (latitude, longitude), optionally
// narrowed down by cuisine and/or price_level. Live restaurant data is
// synced in from Google Places first (see above), then all the geospatial
// math -- the actual nearest-neighbour search, including the GiST index --
// happens in Postgres via the nearby_restaurants RPC function (see
// supabase/schema.sql).
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

  await syncNearbyFromGooglePlaces(lat, lng, radiusKm);

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

// Fetches one restaurant by id, with the same live avg_rating/review_count
// shape the nearby search returns. Mainly useful for deep links / refreshes
// where the frontend doesn't already have the restaurant object in memory.
app.get("/api/restaurants/:id", async (req, res) => {
  const { data, error } = await supabase
    .from("restaurants")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error) {
    return res.status(404).json({ error: "Restaurant not found" });
  }

  const [withRating] = await attachRatingAggregates(supabase, [data]);
  res.json(withRating);
});

// Free-text location search ("koramangala bangalore") for the map's search
// bar, proxied through the server so the client never talks to Nominatim
// directly (keeps the required User-Agent centralised and avoids CORS).
app.get("/api/geocode", async (req, res) => {
  const query = (req.query.q || "").trim();
  if (query.length < 2) {
    return res.status(400).json({ error: "q must be at least 2 characters" });
  }

  try {
    const results = await searchPlaces(query);
    res.json(results);
  } catch {
    res.status(502).json({ error: "Location search is temporarily unavailable" });
  }
});

// Serves a restaurant's real photo. First request for a given restaurant
// resolves photo_reference into actual image bytes via a billed Google
// call and re-hosts them in Supabase Storage (see the "restaurant-photos"
// bucket) -- every request after that is a 302 to the stored copy, so
// Google is never billed twice for the same restaurant's photo, and the
// image is served from Supabase's own CDN rather than proxied through
// this server on every view.
app.get("/api/restaurants/:id/photo", async (req, res) => {
  const { data: restaurant, error } = await supabase
    .from("restaurants")
    .select("id, photo_reference, photo_url")
    .eq("id", req.params.id)
    .single();

  if (error) {
    return res.status(404).end();
  }

  if (restaurant.photo_url) {
    return res.redirect(302, restaurant.photo_url);
  }

  if (!restaurant.photo_reference) {
    return res.status(404).end();
  }

  try {
    const { buffer, contentType } = await fetchPhotoBytes(restaurant.photo_reference);
    const extension = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const path = `${restaurant.id}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("restaurant-photos")
      .upload(path, buffer, { contentType, upsert: true });

    if (uploadError) {
      console.error("Photo upload to Storage failed:", uploadError.message);
      // Still got the bytes from Google even though caching failed -- serve
      // them directly this once rather than showing nothing.
      res.set("Content-Type", contentType);
      return res.send(buffer);
    }

    const { data: publicUrl } = supabase.storage.from("restaurant-photos").getPublicUrl(path);

    await supabase.from("restaurants").update({ photo_url: publicUrl.publicUrl }).eq("id", restaurant.id);

    return res.redirect(302, publicUrl.publicUrl);
  } catch (err) {
    console.error("Photo fetch failed:", err.message);
    return res.status(502).end();
  }
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

  if (!restaurant_id || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "restaurant_id is required and rating must be 1-5" });
  }

  if (!review_text || review_text.trim().length < 10) {
    return res.status(400).json({ error: "Review must be at least 10 characters" });
  }

  const { score, label } = analyzeSentiment(review_text, rating);

  const { data, error } = await supabase
    .from("reviews")
    .insert({
      restaurant_id,
      user_id: req.user.id,
      rating,
      review_text: review_text.trim(),
      sentiment_score: score,
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.status(201).json({ ...data, sentiment_label: label });
});

// Imports a restaurant's real Google reviews into `reviews` (source =
// 'google'), once, the first time someone opens its detail page --
// discovery/search never calls Google's billed Places API, only this
// per-restaurant path does (see server/utils/googlePlaces.js).
//
// google_synced_at is the cache: skip entirely if we synced within
// GOOGLE_SYNC_MAX_AGE_DAYS, both to respect Google's caching policy and to
// stop a restaurant from spending another billed call every time its page
// is opened. Non-fatal like the Overpass sync -- Google being unreachable,
// rate-limited, or simply not finding a match just means DineIQ's own
// reviews are shown instead.
// Returns { rating, reviewCount } | null -- null means "nothing to show
// from Google" (no match found, or the sync was skipped/failed), which the
// caller treats as "just show DineIQ's own reviews."
async function syncGoogleReviews(restaurant) {
  if (restaurant.google_synced_at) {
    const ageDays = (Date.now() - new Date(restaurant.google_synced_at).getTime()) / 86400000;
    if (ageDays < GOOGLE_SYNC_MAX_AGE_DAYS) {
      return restaurant.google_rating != null ? { rating: restaurant.google_rating, reviewCount: restaurant.google_review_count } : null;
    }
  }

  try {
    let placeId = restaurant.google_place_id;
    if (!placeId) {
      placeId = await findPlaceId(restaurant.name, restaurant.latitude, restaurant.longitude);
    }

    if (!placeId) {
      await supabase.from("restaurants").update({ google_synced_at: new Date().toISOString() }).eq("id", restaurant.id);
      return null;
    }

    const { rating, reviewCount, reviews } = await getPlaceReviews(placeId);

    let importFailed = false;
    if (reviews.length > 0) {
      const rows = reviews.map((review) => ({
        restaurant_id: restaurant.id,
        user_id: null,
        rating: review.rating,
        review_text: review.text,
        sentiment_score: analyzeSentiment(review.text).score,
        source: "google",
        external_id: review.externalId,
        author_name: review.authorName,
        created_at: review.publishTime || new Date().toISOString(),
      }));

      const { error } = await supabase.from("reviews").upsert(rows, { onConflict: "external_id" });
      if (error) {
        console.error("Google review import failed to upsert:", error.message);
        importFailed = true;
      }
    }

    await supabase
      .from("restaurants")
      .update({
        google_place_id: placeId,
        google_rating: rating,
        google_review_count: reviewCount,
        // Only stamp the cache marker if the import actually succeeded (or
        // Google genuinely had zero reviews) -- if the upsert failed, this
        // restaurant must stay eligible for a retry next time, not get
        // stuck looking "already checked" for 30 days despite having
        // imported nothing.
        ...(importFailed ? {} : { google_synced_at: new Date().toISOString() }),
      })
      .eq("id", restaurant.id);

    return rating != null ? { rating, reviewCount } : null;
  } catch (err) {
    console.error("Google review sync failed:", err.message);
    return null;
  }
}

// Lists individual reviews for a restaurant, newest first, importing real
// Google reviews first (see above). DineIQ-native reviews stay
// anonymous -- reviews.user_id points at Supabase's private auth.users
// table, which this route has no reason to expose -- but Google's own
// reviews carry their author's display name, because Google's terms
// require attributing reviews shown from their data.
app.get("/api/restaurants/:id/reviews", async (req, res) => {
  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select("id, name, latitude, longitude, google_place_id, google_rating, google_review_count, google_synced_at")
    .eq("id", req.params.id)
    .single();

  if (restaurantError) {
    return res.status(404).json({ error: "Restaurant not found" });
  }

  const google = await syncGoogleReviews(restaurant);

  const { data, error } = await supabase
    .from("reviews")
    .select("id, rating, review_text, sentiment_score, source, author_name, created_at")
    .eq("restaurant_id", req.params.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({
    reviews: data.map((review) => ({ ...review, sentiment_label: classifySentiment(review.sentiment_score, review.rating) })),
    google,
  });
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

  const rated = await attachRatingAggregates(supabase, data.map((fav) => fav.restaurant));
  const withRatings = data.map((fav, i) => ({ ...fav, restaurant: rated[i] }));

  res.json(withRatings);
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
// as a percentage, plus real extractive highlight sentences and any
// recurring compliment/complaint phrases.
//
// Two different techniques for two different jobs. findFrequentPhrases
// (exact bigram repeats) works well once a restaurant has dozens of
// reviews, but Google caps each place at 5, and real people rarely reuse
// the exact same two words -- at that sample size it almost always comes
// back empty. summarise() (extractive sentence selection, Phase 12 of the
// build guide) doesn't need a repeat: it picks whichever real sentences
// already in the reviews are most representative of what's being said,
// so it produces something meaningful even from a handful of reviews.
// Compliments come from positive reviews, complaints from negative ones.
//
// Capped to the most recent 30 reviews (order by created_at desc, then
// limit) rather than the whole history: a restaurant's food/service
// drifts over time, so a review from three years ago shouldn't carry the
// same weight as one from last week, and bounding the input also keeps
// the summarisation work cheap regardless of how many reviews pile up.
const SUMMARY_REVIEW_LIMIT = 30;

app.get("/api/restaurants/:id/summary", async (req, res) => {
  const { data, error } = await supabase
    .from("reviews")
    .select("review_text, sentiment_score, rating")
    .eq("restaurant_id", req.params.id)
    .order("created_at", { ascending: false })
    .limit(SUMMARY_REVIEW_LIMIT);

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
      positiveHighlights: [],
      negativeHighlights: [],
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
    const label = classifySentiment(review.sentiment_score, review.rating);
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
    positiveHighlights: summarise(positiveReviews, 2),
    negativeHighlights: summarise(negativeReviews, 2),
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
    .select("review_text, sentiment_score, rating, created_at")
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

    const label = classifySentiment(review.sentiment_score, review.rating);
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
  const { latitude, longitude } = req.query;
  const userLocation =
    latitude !== undefined && longitude !== undefined
      ? { lat: parseFloat(latitude), lng: parseFloat(longitude) }
      : null;

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
    .map((restaurant) => {
      const avgRating = avgRatingByRestaurantId[restaurant.id] ?? null;
      const { score, distanceKm } = scoreRestaurant(restaurant, profile, avgRating, userLocation);
      const ratings = ratingsByRestaurant[restaurant.id];
      return {
        ...restaurant,
        score,
        distance_km: distanceKm,
        avg_rating: ratings ? Math.round(avgRating * 10) / 10 : null,
        review_count: ratings ? ratings.length : 0,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  res.json({ profile, recommendations });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
