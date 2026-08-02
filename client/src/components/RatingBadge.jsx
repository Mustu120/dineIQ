// A restaurant with zero reviews gets an honest "New" badge instead of a
// fabricated number -- see Phase 23 of the build guide ("render an
// explicit empty state rather than an empty box"). Once there are
// reviews, the pill's color tracks the rating the same way Zomato's does:
// glance at the color, know roughly how good it is, before reading the
// number.
function ratingTier(rating) {
  if (rating >= 4.2) return "excellent";
  if (rating >= 3.5) return "good";
  if (rating >= 2.5) return "average";
  return "poor";
}

// Prefers Google's rating (comes free with every Nearby Search result, so
// it's usually a much larger, more established sample) over DineIQ's own
// avg_rating/review_count, falling back to the latter for restaurants
// Google has no rating for yet.
export function getEffectiveRating(restaurant) {
  if (restaurant.google_rating != null && restaurant.google_review_count > 0) {
    return { rating: restaurant.google_rating, reviewCount: restaurant.google_review_count, isGoogle: true };
  }
  return { rating: restaurant.avg_rating, reviewCount: restaurant.review_count, isGoogle: false };
}

// rating: number | null. reviewCount: number. size: "sm" | "lg"
function RatingBadge({ rating, reviewCount = 0, size = "sm" }) {
  if (rating == null || reviewCount === 0) {
    return <span className={`rating-badge rating-new rating-${size}`}>New</span>;
  }

  return (
    <span className={`rating-badge rating-${ratingTier(rating)} rating-${size}`}>
      {rating.toFixed(1)} <span className="rating-star" aria-hidden="true">★</span>
    </span>
  );
}

export default RatingBadge;
