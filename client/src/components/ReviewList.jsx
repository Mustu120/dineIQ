import { useEffect, useState } from "react";
import { API_BASE } from "../config";

function timeAgo(isoDate) {
  const seconds = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  const units = [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [name, secondsInUnit] of units) {
    const value = Math.floor(seconds / secondsInUnit);
    if (value >= 1) return `${value} ${name}${value > 1 ? "s" : ""} ago`;
  }
  return "just now";
}

// restaurantId: uuid. refreshKey: bump this from the parent (e.g. after a
// new review is posted) to force a re-fetch without lifting review state
// up. onGoogleInfo(google | null): the same request that lists reviews
// also lazily imports the restaurant's real Google reviews the first time
// it's opened (see GET /api/restaurants/:id/reviews in server/index.js),
// so this is the only place that learns whether Google data exists for
// this restaurant -- the parent gets it via callback to show a rating line.
//
// DineIQ-native reviews stay anonymous (reviews.user_id points at
// Supabase's private auth.users table, which the server has no reason to
// expose). Google-sourced reviews carry their author's real name and a
// "Google" badge, because Google's terms require attributing reviews
// pulled from their data.
const INITIAL_VISIBLE = 3;
const LOAD_MORE_STEP = 5;

function ReviewList({ restaurantId, refreshKey, onGoogleInfo }) {
  const [reviews, setReviews] = useState(null);
  const [error, setError] = useState("");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
    fetch(`${API_BASE}/api/restaurants/${restaurantId}/reviews`)
      .then((res) => res.json())
      .then((data) => {
        setReviews(Array.isArray(data.reviews) ? data.reviews : []);
        onGoogleInfo?.(data.google || null);
      })
      .catch(() => setError("Could not load reviews."));
    // onGoogleInfo is a setState function from the parent -- stable across renders, safe to omit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, refreshKey]);

  if (error) return <p className="error-text">{error}</p>;
  if (!reviews) return <p className="empty-state">Loading reviews…</p>;
  if (reviews.length === 0) {
    return <p className="empty-state">No reviews yet — be the first to write one.</p>;
  }

  const visibleReviews = reviews.slice(0, visibleCount);
  const remaining = reviews.length - visibleReviews.length;

  return (
    <>
      <ul className="review-list">
        {visibleReviews.map((review) => (
          <li key={review.id} className="review-item">
            <div className="review-item-header">
              <span className="review-stars" aria-label={`${review.rating} out of 5 stars`}>
                {"★".repeat(review.rating)}
                <span className="review-stars-empty">{"★".repeat(5 - review.rating)}</span>
              </span>
              <span
                className={`tag tag-${review.sentiment_label === "positive" ? "good" : review.sentiment_label === "negative" ? "critical" : "neutral"}`}
              >
                {review.sentiment_label}
              </span>
              {review.source === "google" && <span className="tag google-tag">Google</span>}
              <span className="muted-text review-item-date">{timeAgo(review.created_at)}</span>
            </div>
            {review.author_name && <p className="review-item-author">{review.author_name}</p>}
            <p className="review-item-text">{review.review_text}</p>
          </li>
        ))}
      </ul>

      {remaining > 0 && (
        <button
          type="button"
          className="ghost-button load-more-button"
          onClick={() => setVisibleCount((count) => count + LOAD_MORE_STEP)}
        >
          Load {Math.min(remaining, LOAD_MORE_STEP)} more review{Math.min(remaining, LOAD_MORE_STEP) === 1 ? "" : "s"} ({remaining} left)
        </button>
      )}
    </>
  );
}

export default ReviewList;
