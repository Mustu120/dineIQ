import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import Login from "./pages/Login";
import SignUp from "./pages/SignUp";
import MapView from "./components/MapView";
import LocationSearch from "./components/LocationSearch";
import RestaurantCard from "./components/RestaurantCard";
import RestaurantDetail from "./pages/RestaurantDetail";
import FavouritesPage from "./pages/Favourites";
import AnalyticsDashboard from "./pages/AnalyticsDashboard";
import Recommendations from "./pages/Recommendations";
import { API_BASE, DEFAULT_CENTER, DEFAULT_CENTER_LABEL } from "./config";

const RADIUS_OPTIONS_KM = [1, 3, 5, 8];
const DEFAULT_RADIUS_KM = 3;

function App() {
  const [session, setSession] = useState(null);
  const [authView, setAuthView] = useState("login"); // "login" or "signup"

  const [userLocation, setUserLocation] = useState(null); // device GPS, for the "you are here" marker
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER); // where the map/search is currently focused
  const [locationLabel, setLocationLabel] = useState(null);
  const [locationError, setLocationError] = useState("");

  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [restaurants, setRestaurants] = useState([]);
  const [restaurantsLoading, setRestaurantsLoading] = useState(true);
  const [cuisineFilter, setCuisineFilter] = useState(null);

  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [page, setPage] = useState("home"); // "home" | "favourites" | "recommendations"
  const [favourites, setFavourites] = useState([]);
  const [analyticsRestaurant, setAnalyticsRestaurant] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // Ask the browser for the user's location once they're logged in. Denied
  // or unavailable -> fall back to a default city; the search bar can
  // still jump anywhere from there.
  useEffect(() => {
    if (!session) return;

    if (!navigator.geolocation) {
      setLocationLabel(DEFAULT_CENTER_LABEL);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        setUserLocation({ latitude: point.lat, longitude: point.lng });
        setMapCenter(point);
      },
      () => {
        setLocationError("Location permission denied — showing a default area instead.");
        setLocationLabel(DEFAULT_CENTER_LABEL);
      }
    );
  }, [session]);

  // The single source of truth for "what should the nearby search fetch
  // right now": re-runs whenever the search origin or radius changes. Map
  // panning and the location search bar both go through setMapCenter, so
  // both funnel into this same effect.
  useEffect(() => {
    if (!session) return;

    setRestaurantsLoading(true);
    const params = new URLSearchParams({
      latitude: mapCenter.lat,
      longitude: mapCenter.lng,
      radius: radiusKm,
    });

    const controller = new AbortController();
    fetch(`${API_BASE}/api/restaurants/nearby?${params}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => setRestaurants(Array.isArray(data) ? data : []))
      .catch((e) => {
        if (e.name !== "AbortError") setRestaurants([]);
      })
      .finally(() => setRestaurantsLoading(false));

    return () => controller.abort();
  }, [session, mapCenter, radiusKm]);

  const loadFavourites = async () => {
    const {
      data: { session: current },
    } = await supabase.auth.getSession();
    if (!current) return;

    const res = await fetch(`${API_BASE}/api/favourites`, {
      headers: { Authorization: `Bearer ${current.access_token}` },
    });
    const data = await res.json();
    setFavourites(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    if (!session) return;
    loadFavourites();
  }, [session]);

  const favouriteIdByRestaurant = Object.fromEntries(favourites.map((fav) => [fav.restaurant_id, fav.id]));

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

  const handleSelectLocation = ({ lat, lng, label }) => {
    setMapCenter({ lat, lng });
    setLocationLabel(label.split(",").slice(0, 2).join(","));
  };

  const handleSearchThisArea = ({ lat, lng, radiusKm: newRadius }) => {
    setMapCenter({ lat, lng });
    setRadiusKm(Math.round(newRadius * 10) / 10);
    setLocationLabel(null);
  };

  // "Recentre on me" map control -- re-asks for the device's current
  // position (the same lookup that runs once on login) rather than just
  // reusing whatever was captured then, so it's correct even if the user
  // has physically moved since.
  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      setLocationError("Your browser doesn't support geolocation.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        setUserLocation({ latitude: point.lat, longitude: point.lng });
        setMapCenter(point);
        setLocationLabel(null);
        setLocationError("");
      },
      () => setLocationError("Couldn't get your location — check your browser's location permission.")
    );
  };

  // Top cuisines present in the current result set, used to build the
  // filter chip row -- entirely derived from live data, never hardcoded.
  const cuisineOptions = useMemo(() => {
    const counts = {};
    restaurants.forEach((r) => {
      if (r.cuisine) counts[r.cuisine] = (counts[r.cuisine] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([cuisine]) => cuisine);
  }, [restaurants]);

  const filteredRestaurants = useMemo(
    () => (cuisineFilter ? restaurants.filter((r) => r.cuisine === cuisineFilter) : restaurants),
    [restaurants, cuisineFilter]
  );

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
        token={session.access_token}
        onToggleFavourite={handleToggleFavourite}
        onViewAnalytics={setAnalyticsRestaurant}
        onBack={() => setSelectedRestaurant(null)}
      />
    );
  }

  const renderPage = () => {
    if (page === "favourites") {
      return (
        <FavouritesPage favourites={favourites} onToggleFavourite={handleToggleFavourite} onViewDetails={setSelectedRestaurant} />
      );
    }

    if (page === "recommendations") {
      return (
        <Recommendations
          token={session.access_token}
          userLocation={userLocation}
          favouriteIdByRestaurant={favouriteIdByRestaurant}
          onToggleFavourite={handleToggleFavourite}
          onViewDetails={setSelectedRestaurant}
        />
      );
    }

    return (
      <>
        <section className="hero">
          <h2 className="hero-title">Discover great food near you</h2>
          <p className="hero-subtitle">Live restaurant data and reviews from Google, with AI-surfaced complaint trends.</p>
          <LocationSearch onSelectLocation={handleSelectLocation} />
          <div className="radius-chip-row">
            {locationLabel && <span className="location-label">📍 {locationLabel}</span>}
            {RADIUS_OPTIONS_KM.map((km) => (
              <button
                key={km}
                type="button"
                className={`chip-button${radiusKm === km ? " active" : ""}`}
                onClick={() => setRadiusKm(km)}
              >
                {km} km
              </button>
            ))}
          </div>
        </section>

        {locationError && <p className="error-text">{locationError}</p>}

        <div className="map-card">
          <MapView
            center={mapCenter}
            userLocation={userLocation}
            restaurants={filteredRestaurants}
            selectedId={selectedRestaurant?.id}
            onSelectRestaurant={setSelectedRestaurant}
            onSearchThisArea={handleSearchThisArea}
            onLocateMe={handleLocateMe}
          />
        </div>

        {cuisineOptions.length > 0 && (
          <div className="cuisine-chip-row">
            <button
              type="button"
              className={`chip-button${cuisineFilter === null ? " active" : ""}`}
              onClick={() => setCuisineFilter(null)}
            >
              All cuisines
            </button>
            {cuisineOptions.map((cuisine) => (
              <button
                key={cuisine}
                type="button"
                className={`chip-button${cuisineFilter === cuisine ? " active" : ""}`}
                onClick={() => setCuisineFilter(cuisine === cuisineFilter ? null : cuisine)}
              >
                {cuisine}
              </button>
            ))}
          </div>
        )}

        <section className="section">
          <h2>Nearby Restaurants</h2>
          {restaurantsLoading ? (
            <p className="empty-state">Finding restaurants near you…</p>
          ) : filteredRestaurants.length === 0 ? (
            <p className="empty-state">No restaurants found here yet — try a bigger radius or a different area.</p>
          ) : (
            <ul className="card-list">
              {filteredRestaurants.map((restaurant) => (
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
        <h1 className="brand" onClick={() => setPage("home")}>
          Dine<span className="brand-accent">IQ</span>
        </h1>
        <div className="app-header-actions">
          <button type="button" className={`nav-button${page === "home" ? " active" : ""}`} onClick={() => setPage("home")}>
            Discover
          </button>
          <button
            type="button"
            className={`nav-button${page === "recommendations" ? " active" : ""}`}
            onClick={() => setPage("recommendations")}
          >
            For You
          </button>
          <button
            type="button"
            className={`nav-button${page === "favourites" ? " active" : ""}`}
            onClick={() => setPage("favourites")}
          >
            Favourites
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
