// restaurant: { id, name, cuisine, price_level, distance_km, ... }
// isFavourited: bool -- controls whether the heart is filled or outlined
// onToggleFavourite(restaurant), onViewDetails(restaurant): callbacks:
// this component doesn't know how favouriting or navigation actually work,
// it just reports the restaurant the user acted on.
function RestaurantCard({ restaurant, isFavourited, onToggleFavourite, onViewDetails }) {
  return (
    <li className="restaurant-card">
      <div>
        <strong>{restaurant.name}</strong>
        {restaurant.distance_km != null && (
          <span> ({restaurant.distance_km.toFixed(1)} km)</span>
        )}
        <div>{restaurant.cuisine || "Cuisine unknown"}</div>
      </div>
      <div>
        <button
          type="button"
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
