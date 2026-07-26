import SummaryCard from "../components/SummaryCard";

// restaurant: the object from GET /api/restaurants/nearby (id, name,
// cuisine, price_level, address, distance_km, ...)
function RestaurantDetail({ restaurant, isFavourited, onToggleFavourite, onViewAnalytics, onBack }) {
  return (
    <div className="page">
      <button type="button" className="ghost-button" onClick={onBack}>
        &larr; Back
      </button>

      <div className="page-title-row">
        <h2>{restaurant.name}</h2>
        <button
          type="button"
          className={`favourite-button${isFavourited ? " is-favourited" : ""}`}
          onClick={() => onToggleFavourite(restaurant)}
          aria-label={isFavourited ? "Remove from favourites" : "Add to favourites"}
          aria-pressed={isFavourited}
        >
          {isFavourited ? "♥" : "♡"}
        </button>
      </div>

      <p className="muted-text">
        {restaurant.cuisine || "Cuisine unknown"}
        {restaurant.price_level ? ` · ${"$".repeat(restaurant.price_level)}` : ""}
      </p>
      {restaurant.address && <p className="muted-text">{restaurant.address}</p>}

      <SummaryCard restaurantId={restaurant.id} />

      <div className="detail-actions">
        <button type="button" className="primary-button" onClick={() => onViewAnalytics(restaurant)}>
          View Analytics Dashboard
        </button>
      </div>
    </div>
  );
}

export default RestaurantDetail;
