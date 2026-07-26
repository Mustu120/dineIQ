import RestaurantCard from "../components/RestaurantCard";

// favourites: [{ id (favourite row id), restaurant_id, restaurant: {...} }]
function Favourites({ favourites, onToggleFavourite, onViewDetails, onBack }) {
  return (
    <div>
      <button type="button" onClick={onBack}>
        &larr; Back
      </button>
      <h2>My Favourites</h2>

      {favourites.length === 0 ? (
        <p>You haven't favourited any restaurants yet.</p>
      ) : (
        <ul>
          {favourites.map((fav) => (
            <RestaurantCard
              key={fav.id}
              restaurant={fav.restaurant}
              isFavourited
              onToggleFavourite={onToggleFavourite}
              onViewDetails={onViewDetails}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export default Favourites;
