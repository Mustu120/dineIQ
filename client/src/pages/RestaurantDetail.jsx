import SummaryCard from "../components/SummaryCard";

// restaurant: the object from GET /api/restaurants/nearby (id, name,
// cuisine, price_level, address, distance_km, ...)
function RestaurantDetail({ restaurant, isFavourited, onToggleFavourite, onViewAnalytics, onBack }) {
  return (
    <div>
      <button type="button" onClick={onBack}>
        &larr; Back
      </button>
      <h2>
        {restaurant.name}{" "}
        <button
          type="button"
          onClick={() => onToggleFavourite(restaurant)}
          aria-label={isFavourited ? "Remove from favourites" : "Add to favourites"}
          aria-pressed={isFavourited}
        >
          {isFavourited ? "♥" : "♡"}
        </button>
      </h2>
      <p>
        {restaurant.cuisine || "Cuisine unknown"}
        {restaurant.price_level ? ` · ${"$".repeat(restaurant.price_level)}` : ""}
      </p>
      {restaurant.address && <p>{restaurant.address}</p>}

      <SummaryCard restaurantId={restaurant.id} />

      <p>
        <button type="button" onClick={() => onViewAnalytics(restaurant)}>
          View Analytics Dashboard
        </button>
      </p>
    </div>
  );
}

export default RestaurantDetail;
