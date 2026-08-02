import CoverArt from "./CoverArt";
import RatingBadge, { getEffectiveRating } from "./RatingBadge";
import { getRestaurantPhotoUrl } from "../config";

// restaurant: { id, name, cuisine, price_level, distance_km, avg_rating,
// review_count, ... }
// isFavourited: bool -- controls whether the heart is filled or outlined
// matchScore: optional 0-1 recommendation score -- only Recommendations
// passes this, so the badge only appears there.
// onToggleFavourite(restaurant), onViewDetails(restaurant): callbacks:
// this component doesn't know how favouriting or navigation actually work,
// it just reports the restaurant the user acted on.
function RestaurantCard({ restaurant, isFavourited, matchScore, onToggleFavourite, onViewDetails }) {
  const { rating, reviewCount } = getEffectiveRating(restaurant);

  return (
    <li className="restaurant-card" onClick={() => onViewDetails(restaurant)}>
      <div className="restaurant-card-cover-wrap">
        <CoverArt cuisine={restaurant.cuisine} name={restaurant.name} size="sm" photoUrl={getRestaurantPhotoUrl(restaurant)}>
          <div className="restaurant-card-badge-row">
            <RatingBadge rating={rating} reviewCount={reviewCount} />
            {matchScore != null && <span className="match-badge">{Math.round(matchScore * 100)}% match</span>}
          </div>
          <button
            type="button"
            className={`favourite-button favourite-button-floating${isFavourited ? " is-favourited" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavourite(restaurant);
            }}
            aria-label={isFavourited ? "Remove from favourites" : "Add to favourites"}
            aria-pressed={isFavourited}
          >
            {isFavourited ? "♥" : "♡"}
          </button>
        </CoverArt>
      </div>

      <div className="restaurant-card-body">
        <strong className="restaurant-card-name">{restaurant.name}</strong>
        <div className="restaurant-card-meta">
          {restaurant.cuisine && <span className="chip">{restaurant.cuisine}</span>}
          {restaurant.price_level != null && <span className="chip">{"₹".repeat(restaurant.price_level)}</span>}
        </div>
        <div className="restaurant-card-footer">
          {restaurant.address && <span className="muted-text restaurant-card-address">{restaurant.address}</span>}
          {restaurant.distance_km != null && <span className="muted-text restaurant-card-distance">{restaurant.distance_km.toFixed(1)} km</span>}
        </div>
      </div>
    </li>
  );
}

export default RestaurantCard;
