import { useState } from "react";
import { API_BASE } from "../config";

const STAR_LABELS = ["Poor", "Fair", "Good", "Very good", "Excellent"];

// Posts to POST /api/reviews. Sentiment analysis happens server-side and
// isn't sent by this form -- see Phase 7 of the build guide: the user's
// own rating and words are the only input, the sentiment score is
// computed, never typed in.
function ReviewForm({ restaurantId, token, onSubmitted }) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (rating < 1) {
      setError("Pick a star rating.");
      return;
    }
    if (text.trim().length < 10) {
      setError("Write a few more words (at least 10 characters).");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/reviews`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ restaurant_id: restaurantId, rating, review_text: text.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Could not submit review.");
        return;
      }

      setRating(0);
      setText("");
      onSubmitted(data);
    } catch {
      setError("Could not submit review. Check your connection.");
    } finally {
      setSubmitting(false);
    }
  };

  const displayRating = hoverRating || rating;

  return (
    <form className="review-form" onSubmit={handleSubmit}>
      <h4 className="section-label">Write a review</h4>

      <div className="star-picker" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            className={`star-picker-button${star <= displayRating ? " is-filled" : ""}`}
            onMouseEnter={() => setHoverRating(star)}
            onMouseLeave={() => setHoverRating(0)}
            onClick={() => setRating(star)}
            role="radio"
            aria-checked={rating === star}
            aria-label={`${star} star${star > 1 ? "s" : ""} - ${STAR_LABELS[star - 1]}`}
          >
            ★
          </button>
        ))}
        {displayRating > 0 && <span className="star-picker-label">{STAR_LABELS[displayRating - 1]}</span>}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="How was the food, service, and vibe?"
        rows={3}
        maxLength={1000}
      />

      {error && <p className="error-text">{error}</p>}

      <button type="submit" className="primary-button" disabled={submitting}>
        {submitting ? "Posting…" : "Post Review"}
      </button>
    </form>
  );
}

export default ReviewForm;
