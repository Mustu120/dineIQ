import { useState } from "react";
import SummaryCard from "../components/SummaryCard";
import ReviewForm from "../components/ReviewForm";
import ReviewList from "../components/ReviewList";
import CoverArt from "../components/CoverArt";
import RatingBadge, { getEffectiveRating } from "../components/RatingBadge";
import { getRestaurantPhotoUrl } from "../config";

// Real Google Maps functionality, no API key required for this part: a
// plain "dir/?api=1" deep link opens turn-by-turn directions in Google
// Maps itself (app on mobile, maps.google.com on desktop).
function directionsUrl(restaurant) {
  const destination =
    restaurant.latitude != null ? `${restaurant.latitude},${restaurant.longitude}` : restaurant.address || restaurant.name;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

// Google's opening_hours comes back as one semicolon-joined string
// ("Monday: 11:30 AM – 11:00 PM; Tuesday: ..."). The first colon in each
// segment is always the day/hours boundary (day names never contain a
// colon, and clock times always do further in), so splitting on just the
// first one reliably separates them for a proper two-column layout.
function parseHoursLine(line) {
  const match = line.trim().match(/^([^:]+):\s*(.+)$/);
  return match ? { day: match[1], hours: match[2] } : { day: line.trim(), hours: "" };
}

// restaurant: the object from GET /api/restaurants/nearby (id, name,
// cuisine, price_level, address, distance_km, avg_rating, review_count,
// phone, website, opening_hours, ...)
function RestaurantDetail({ restaurant, isFavourited, token, onToggleFavourite, onViewAnalytics, onBack }) {
  const [reviewsRefreshKey, setReviewsRefreshKey] = useState(0);
  const [justPosted, setJustPosted] = useState(false);
  const [googleInfo, setGoogleInfo] = useState(null);

  const handleReviewSubmitted = () => {
    setReviewsRefreshKey((k) => k + 1);
    setJustPosted(true);
    setTimeout(() => setJustPosted(false), 4000);
  };

  const { rating, reviewCount, isGoogle } = getEffectiveRating(restaurant);
  // Only show the small supplementary "G 4.4 · 123" line when the main
  // badge above is DineIQ's own rating -- if Google's rating is already
  // the one being shown (isGoogle), repeating it would be redundant.
  const showSupplementaryGoogleLine = !isGoogle && googleInfo;

  return (
    <div className="page detail-page">
      <button type="button" className="ghost-button back-button" onClick={onBack}>
        &larr; Back
      </button>

      <CoverArt
        cuisine={restaurant.cuisine}
        name={restaurant.name}
        size="lg"
        photoUrl={getRestaurantPhotoUrl(restaurant)}
        photoAttribution={restaurant.photo_attribution}
      >
        <button
          type="button"
          className={`favourite-button favourite-button-floating${isFavourited ? " is-favourited" : ""}`}
          onClick={() => onToggleFavourite(restaurant)}
          aria-label={isFavourited ? "Remove from favourites" : "Add to favourites"}
          aria-pressed={isFavourited}
        >
          {isFavourited ? "♥" : "♡"}
        </button>
      </CoverArt>

      <div className="detail-header">
        <h2>{restaurant.name}</h2>
        <div className="detail-rating-row">
          <RatingBadge rating={rating} reviewCount={reviewCount} size="lg" />
          {isGoogle && <span className="google-g" aria-hidden="true" title="Rating from Google">G</span>}
          {showSupplementaryGoogleLine && (
            <span className="google-rating-line">
              <span className="google-g" aria-hidden="true">G</span>
              {googleInfo.rating?.toFixed(1)} · {googleInfo.reviewCount} Google reviews
            </span>
          )}
        </div>
      </div>

      <div className="restaurant-card-meta detail-meta">
        {restaurant.cuisine && <span className="chip">{restaurant.cuisine}</span>}
        {restaurant.price_level != null && <span className="chip">{"₹".repeat(restaurant.price_level)}</span>}
        {restaurant.distance_km != null && <span className="muted-text">{restaurant.distance_km.toFixed(1)} km away</span>}
      </div>

      <div className="detail-facts">
        {restaurant.address && (
          <div className="detail-fact">
            <span className="detail-fact-icon" aria-hidden="true">📍</span>
            <span className="detail-fact-content">{restaurant.address}</span>
          </div>
        )}
        {restaurant.opening_hours && (
          <div className="detail-fact">
            <span className="detail-fact-icon" aria-hidden="true">🕒</span>
            <ul className="hours-list">
              {restaurant.opening_hours.split(";").map((line) => {
                const { day, hours } = parseHoursLine(line);
                return (
                  <li key={day}>
                    <span className="hours-day">{day}</span>
                    <span className="hours-time">{hours}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {restaurant.phone && (
          <div className="detail-fact">
            <span className="detail-fact-icon" aria-hidden="true">📞</span>
            <span className="detail-fact-content">
              <a href={`tel:${restaurant.phone}`}>{restaurant.phone}</a>
            </span>
          </div>
        )}
        {restaurant.website && (
          <div className="detail-fact">
            <span className="detail-fact-icon" aria-hidden="true">🔗</span>
            <span className="detail-fact-content">
              <a href={restaurant.website} target="_blank" rel="noreferrer">
                Website
              </a>
            </span>
          </div>
        )}
      </div>

      <div className="detail-actions">
        <a
          className="primary-button directions-button"
          href={directionsUrl(restaurant)}
          target="_blank"
          rel="noreferrer"
        >
          Get Directions
        </a>
        <button type="button" className="ghost-button" onClick={() => onViewAnalytics(restaurant)}>
          View Analytics Dashboard
        </button>
      </div>

      <SummaryCard restaurantId={restaurant.id} key={`summary-${reviewsRefreshKey}`} />

      <section className="section">
        <h3 className="section-heading">Reviews</h3>
        {justPosted && <p className="success-text">Thanks — your review is live, and sentiment analysis is running in the background.</p>}
        <ReviewList restaurantId={restaurant.id} refreshKey={reviewsRefreshKey} onGoogleInfo={setGoogleInfo} />
      </section>

      {token && (
        <section className="section">
          <ReviewForm restaurantId={restaurant.id} token={token} onSubmitted={handleReviewSubmitted} />
        </section>
      )}
    </div>
  );
}

export default RestaurantDetail;
