import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Login from "./pages/Login";
import SignUp from "./pages/SignUp";
import MapView from "./components/MapView";
import RestaurantCard from "./components/RestaurantCard";
import RestaurantDetail from "./pages/RestaurantDetail";
import FavouritesPage from "./pages/Favourites";
import AnalyticsDashboard from "./pages/AnalyticsDashboard";
import Recommendations from "./pages/Recommendations";
import { API_BASE } from "./config";

// Wide enough to cover a whole city (so "nearby" reads as "in my city"),
// not just a tight walking-distance radius.
const NEARBY_RADIUS_KM = 20;

function App() {
  const [status, setStatus] = useState("Checking server...");
  const [session, setSession] = useState(null);
  const [authView, setAuthView] = useState("login"); // "login" or "signup"
  const [userLocation, setUserLocation] = useState(null);
  const [restaurants, setRestaurants] = useState([]);
  const [locationError, setLocationError] = useState("");
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [page, setPage] = useState("home"); // "home" | "favourites" | "recommendations"
  const [favourites, setFavourites] = useState([]);
  const [analyticsRestaurant, setAnalyticsRestaurant] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/health`)
      .then((res) => res.json())
      .then((data) => setStatus(data.status))
      .catch(() => setStatus("Server unreachable"));
  }, []);

  useEffect(() => {
    // Check if a session already exists (e.g. page was refreshed)
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    // Keep session state in sync whenever the user logs in/out or
    // their token gets refreshed. Supabase handles all of that for us.
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  // Ask the browser for the user's location once they're logged in.
  useEffect(() => {
    if (!session || !navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => setLocationError("Location permission denied.")
    );
  }, [session]);

  // Once we have a location, ask the backend for nearby restaurants.
  useEffect(() => {
    if (!userLocation) return;

    const params = new URLSearchParams({
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
      radius: NEARBY_RADIUS_KM,
    });

    fetch(`${API_BASE}/api/restaurants/nearby?${params}`)
      .then((res) => res.json())
      .then((data) => setRestaurants(Array.isArray(data) ? data : []))
      .catch(() => setRestaurants([]));
  }, [userLocation]);

  const loadFavourites = async () => {
    const { data: { session: current } } = await supabase.auth.getSession();
    if (!current) return;

    const res = await fetch(`${API_BASE}/api/favourites`, {
      headers: { Authorization: `Bearer ${current.access_token}` },
    });
    const data = await res.json();
    setFavourites(Array.isArray(data) ? data : []);
  };

  // Load the user's favourites once they're logged in.
  useEffect(() => {
    if (!session) return;
    loadFavourites();
  }, [session]);

  const favouriteIdByRestaurant = Object.fromEntries(
    favourites.map((fav) => [fav.restaurant_id, fav.id])
  );

  const handleToggleFavourite = async (restaurant) => {
    const existingFavouriteId = favouriteIdByRestaurant[restaurant.id];

    if (existingFavouriteId) {
      await fetch(`${API_BASE}/api/favourites/${existingFavouriteId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      setFavourites((prev) => prev.filter((fav) => fav.id !== existingFavouriteId));
    } else {
      const res = await fetch(`${API_BASE}/api/favourites`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ restaurant_id: restaurant.id }),
      });
      const newFavourite = await res.json();
      setFavourites((prev) => [...prev, newFavourite]);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (!session) {
    return authView === "login" ? (
      <Login onSwitchToSignUp={() => setAuthView("signup")} />
    ) : (
      <SignUp onSwitchToLogin={() => setAuthView("login")} />
    );
  }

  if (analyticsRestaurant) {
    return (
      <AnalyticsDashboard
        restaurant={analyticsRestaurant}
        token={session.access_token}
        onBack={() => setAnalyticsRestaurant(null)}
      />
    );
  }

  if (selectedRestaurant) {
    return (
      <RestaurantDetail
        restaurant={selectedRestaurant}
        isFavourited={Boolean(favouriteIdByRestaurant[selectedRestaurant.id])}
        onToggleFavourite={handleToggleFavourite}
        onViewAnalytics={setAnalyticsRestaurant}
        onBack={() => setSelectedRestaurant(null)}
      />
    );
  }

  const renderPage = () => {
    if (page === "favourites") {
      return (
        <FavouritesPage
          favourites={favourites}
          onToggleFavourite={handleToggleFavourite}
          onViewDetails={setSelectedRestaurant}
        />
      );
    }

    if (page === "recommendations") {
      return (
        <Recommendations
          token={session.access_token}
          favouriteIdByRestaurant={favouriteIdByRestaurant}
          onToggleFavourite={handleToggleFavourite}
          onViewDetails={setSelectedRestaurant}
        />
      );
    }

    return (
      <>
        <p className="muted-text">
          Server: {status} · Logged in as {session.user.email}
        </p>

        {locationError && <p className="error-text">{locationError}</p>}
        <div className="map-card">
          <MapView userLocation={userLocation} restaurants={restaurants} />
        </div>

        <section className="section">
          <h2>Nearby Restaurants</h2>
          {restaurants.length === 0 ? (
            <p className="empty-state">No restaurants found nearby yet.</p>
          ) : (
            <ul className="card-list">
              {restaurants.map((restaurant) => (
                <RestaurantCard
                  key={restaurant.id}
                  restaurant={restaurant}
                  isFavourited={Boolean(favouriteIdByRestaurant[restaurant.id])}
                  onToggleFavourite={handleToggleFavourite}
                  onViewDetails={setSelectedRestaurant}
                />
              ))}
            </ul>
          )}
        </section>
      </>
    );
  };

  return (
    <div>
      <header className="app-header">
        <h1 onClick={() => setPage("home")}>DineIQ</h1>
        <div className="app-header-actions">
          <button
            type="button"
            className={`nav-button${page === "home" ? " active" : ""}`}
            onClick={() => setPage("home")}
          >
            Home
          </button>
          <button
            type="button"
            className={`nav-button${page === "recommendations" ? " active" : ""}`}
            onClick={() => setPage("recommendations")}
          >
            Recommended
          </button>
          <button
            type="button"
            className={`nav-button${page === "favourites" ? " active" : ""}`}
            onClick={() => setPage("favourites")}
          >
            My Favourites
          </button>
          <button type="button" className="ghost-button" onClick={handleLogout}>
            Log Out
          </button>
        </div>
      </header>
      {renderPage()}
    </div>
  );
}

export default App;
