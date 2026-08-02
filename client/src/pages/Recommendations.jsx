import { useEffect, useState } from "react";
import RestaurantCard from "../components/RestaurantCard";
import { API_BASE } from "../config";

// Fetches GET /api/recommendations (needs the logged-in user's access
// token) and renders the ranked list using the same card as everywhere
// else, with an added match-score badge. userLocation, when known, lets
// the scoring formula factor in distance decay (Phase 13.3 of the guide)
// instead of ignoring location entirely.
function Recommendations({ token, userLocation, favouriteIdByRestaurant, onToggleFavourite, onViewDetails }) {
  const [recommendations, setRecommendations] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = userLocation
      ? `?${new URLSearchParams({ latitude: userLocation.latitude, longitude: userLocation.longitude })}`
      : "";

    fetch(`${API_BASE}/api/recommendations${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setRecommendations(data.recommendations || []);
        setMessage(data.message || "");
      })
      .catch(() => setMessage("Could not load recommendations."))
      .finally(() => setLoading(false));
  }, [token, userLocation?.latitude, userLocation?.longitude]);

  return (
    <div className="page">
      <h2>Recommended for You</h2>
      <p className="muted-text">Based on the restaurants you've favourited.</p>

      {loading && <p className="empty-state">Loading recommendations...</p>}
      {!loading && recommendations.length === 0 && (
        <p className="empty-state">{message || "No recommendations yet."}</p>
      )}
      {!loading && recommendations.length > 0 && (
        <ul className="card-list">
          {recommendations.map((restaurant) => (
            <RestaurantCard
              key={restaurant.id}
              restaurant={restaurant}
              matchScore={restaurant.score}
              isFavourited={Boolean(favouriteIdByRestaurant[restaurant.id])}
              onToggleFavourite={onToggleFavourite}
              onViewDetails={onViewDetails}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export default Recommendations;
