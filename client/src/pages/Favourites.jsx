import RestaurantCard from "../components/RestaurantCard";

// favourites: [{ id (favourite row id), restaurant_id, restaurant: {...} }]
function Favourites({ favourites, onToggleFavourite, onViewDetails }) {
  return (
    <div className="page">
      <h2>My Favourites</h2>

      {favourites.length === 0 ? (
        <p className="empty-state">You haven't favourited any restaurants yet.</p>
      ) : (
        <ul className="card-list">
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
