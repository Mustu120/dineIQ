// restaurant: { id, name, cuisine, price_level, distance_km, ... }
// isFavourited: bool -- controls whether the heart is filled or outlined
// matchScore: optional 0-1 recommendation score -- only Recommendations
// passes this, so the badge only appears there.
// onToggleFavourite(restaurant), onViewDetails(restaurant): callbacks:
// this component doesn't know how favouriting or navigation actually work,
// it just reports the restaurant the user acted on.
function RestaurantCard({ restaurant, isFavourited, matchScore, onToggleFavourite, onViewDetails }) {
  return (
    <li className="restaurant-card">
      <div>
        <div className="restaurant-card-title">
          <strong>{restaurant.name}</strong>
          {matchScore != null && (
            <span className="match-badge">{Math.round(matchScore * 100)}% match</span>
          )}
        </div>
        <div className="restaurant-card-meta">
          {restaurant.cuisine && <span className="chip">{restaurant.cuisine}</span>}
          {restaurant.price_level != null && (
            <span className="chip">{"$".repeat(restaurant.price_level)}</span>
          )}
          {restaurant.distance_km != null && (
            <span className="muted-text">{restaurant.distance_km.toFixed(1)} km</span>
          )}
        </div>
      </div>
      <div className="restaurant-card-actions">
        <button
          type="button"
          className={`favourite-button${isFavourited ? " is-favourited" : ""}`}
          onClick={() => onToggleFavourite(restaurant)}
          aria-label={isFavourited ? "Remove from favourites" : "Add to favourites"}
          aria-pressed={isFavourited}
        >
          {isFavourited ? "♥" : "♡"}
        </button>
        <button type="button" onClick={() => onViewDetails(restaurant)}>
          View Details
        </button>
      </div>
    </li>
  );
}

export default RestaurantCard;
