import { useCallback, useMemo, useRef, useState } from "react";
import { GoogleMap, MarkerF, MarkerClustererF, InfoWindowF, useJsApiLoader } from "@react-google-maps/api";
import { GOOGLE_MAPS_API_KEY } from "../config";
import { radiusForBounds } from "../geoUtils";
import RatingBadge from "./RatingBadge";
import { getCoverArt } from "./CoverArt";

const CONTAINER_STYLE = { width: "100%", height: "100%" };

// A muted, low-saturation base map (Zomato/Airbnb-style) so the app's own
// red pins are the only strong color on screen. Business POI icons and
// transit clutter are turned off -- this is a restaurant-discovery map,
// not a general-purpose one.
const MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#f5f3f0" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#6b6b6b" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f5f3f0" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#fdfaf7" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8a8a8a" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#cfe8f0" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#dfdad2" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#f0ece5" }] },
];

const MAP_OPTIONS = {
  styles: MAP_STYLE,
  disableDefaultUI: true,
  zoomControl: true,
  clickableIcons: false,
  gestureHandling: "greedy",
};

function pinDataUri(color, scale = 1) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${34 * scale}" height="${44 * scale}" viewBox="0 0 34 44">
    <path d="M17 0C7.6 0 0 7.6 0 17c0 12.75 17 27 17 27s17-14.25 17-27C34 7.6 26.4 0 17 0z" fill="${color}"/>
    <circle cx="17" cy="17" r="7" fill="#fff"/>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function userDotDataUri() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
    <circle cx="11" cy="11" r="10" fill="#2a78d6" fill-opacity="0.25"/>
    <circle cx="11" cy="11" r="6" fill="#2a78d6" stroke="#fff" stroke-width="2.5"/>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function clusterDataUri(size) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="#e23744" fill-opacity="0.92" stroke="#fff" stroke-width="3"/>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

// Brand-red circle badges instead of the clusterer's default yellow
// balloons, at three size tiers for small/medium/large groups.
const CLUSTER_STYLES = [
  { url: clusterDataUri(44), height: 44, width: 44, textColor: "#fff", textSize: 13, fontWeight: "700" },
  { url: clusterDataUri(54), height: 54, width: 54, textColor: "#fff", textSize: 14, fontWeight: "700" },
  { url: clusterDataUri(64), height: 64, width: 64, textColor: "#fff", textSize: 15, fontWeight: "700" },
];

// center: {lat,lng} -- where the map should be centred (controlled by the
// parent: geolocation, a searched location, or unchanged after a pan).
// userLocation: {latitude,longitude} | null.
// restaurants: live results from GET /api/restaurants/nearby.
// onSearchThisArea({lat,lng,radiusKm}): called when the user explicitly
// asks to re-search after panning -- see the guide's note on debouncing:
// an explicit button, rather than firing a request on every frame of a
// drag, is what keeps a free/shared Overpass mirror usable.
// onLocateMe(): called when the user taps the "recentre on me" control --
// the actual geolocation lookup lives in App.jsx (it owns userLocation/
// mapCenter state), this just reports the request.
function MapView({ center, userLocation, restaurants = [], selectedId, onSelectRestaurant, onSearchThisArea, onLocateMe }) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: "dineiq-google-maps",
    googleMapsApiKey: GOOGLE_MAPS_API_KEY || "",
  });

  const mapRef = useRef(null);
  const hasUserPannedRef = useRef(false);
  const lastSearchedCenterRef = useRef(center);
  const [activeMarkerId, setActiveMarkerId] = useState(null);
  const [showSearchButton, setShowSearchButton] = useState(false);
  const [pendingSearch, setPendingSearch] = useState(null);

  const onLoad = useCallback((map) => {
    mapRef.current = map;
  }, []);

  const onUnmount = useCallback(() => {
    mapRef.current = null;
  }, []);

  const markUserPanned = useCallback(() => {
    hasUserPannedRef.current = true;
  }, []);

  const handleIdle = useCallback(() => {
    const map = mapRef.current;
    if (!map || !hasUserPannedRef.current) return;

    const newCenter = map.getCenter();
    const bounds = map.getBounds();
    if (!newCenter || !bounds) return;

    const lat = newCenter.lat();
    const lng = newCenter.lng();
    const last = lastSearchedCenterRef.current;
    const movedFar = Math.abs(lat - last.lat) > 0.003 || Math.abs(lng - last.lng) > 0.003;

    if (movedFar) {
      setPendingSearch({ lat, lng, radiusKm: radiusForBounds({ lat, lng }, bounds) });
      setShowSearchButton(true);
    }
  }, []);

  const handleSearchThisArea = () => {
    if (!pendingSearch) return;
    lastSearchedCenterRef.current = { lat: pendingSearch.lat, lng: pendingSearch.lng };
    hasUserPannedRef.current = false;
    setShowSearchButton(false);
    onSearchThisArea(pendingSearch);
  };

  const restaurantIcon = useMemo(
    () => (isLoaded ? { url: pinDataUri("#e23744"), scaledSize: new window.google.maps.Size(30, 39), anchor: new window.google.maps.Point(15, 39) } : null),
    [isLoaded]
  );
  const selectedIcon = useMemo(
    () => (isLoaded ? { url: pinDataUri("#e23744", 1.25), scaledSize: new window.google.maps.Size(38, 49), anchor: new window.google.maps.Point(19, 49) } : null),
    [isLoaded]
  );
  const userIcon = useMemo(
    () => (isLoaded ? { url: userDotDataUri(), scaledSize: new window.google.maps.Size(22, 22), anchor: new window.google.maps.Point(11, 11) } : null),
    [isLoaded]
  );

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="map-fallback">
        <p>
          <strong>Google Maps key missing.</strong> Add <code>VITE_GOOGLE_MAPS_API_KEY</code> to{" "}
          <code>client/.env</code> to see the live map (see client/.env.example).
        </p>
      </div>
    );
  }

  if (loadError) {
    return <div className="map-fallback">Couldn't load Google Maps. Check your API key and network.</div>;
  }

  if (!isLoaded) {
    return <div className="map-fallback map-fallback-loading">Loading map…</div>;
  }

  const activeRestaurant = restaurants.find((r) => r.id === activeMarkerId);

  return (
    <div className="map-shell">
      <GoogleMap
        mapContainerStyle={CONTAINER_STYLE}
        center={center}
        zoom={14}
        options={MAP_OPTIONS}
        onLoad={onLoad}
        onUnmount={onUnmount}
        onDragStart={markUserPanned}
        onZoomChanged={markUserPanned}
        onIdle={handleIdle}
      >
        {userLocation && (
          <MarkerF
            position={{ lat: userLocation.latitude, lng: userLocation.longitude }}
            icon={userIcon}
            zIndex={999}
            title="You are here"
          />
        )}

        <MarkerClustererF options={{ styles: CLUSTER_STYLES }} minimumClusterSize={4}>
          {(clusterer) => (
            <>
              {restaurants.map((restaurant) => (
                <MarkerF
                  key={restaurant.id}
                  position={{ lat: restaurant.latitude, lng: restaurant.longitude }}
                  icon={restaurant.id === selectedId ? selectedIcon : restaurantIcon}
                  clusterer={clusterer}
                  onClick={() => setActiveMarkerId(restaurant.id)}
                />
              ))}
            </>
          )}
        </MarkerClustererF>

        {activeRestaurant && (
          <InfoWindowF
            position={{ lat: activeRestaurant.latitude, lng: activeRestaurant.longitude }}
            onCloseClick={() => setActiveMarkerId(null)}
          >
            <div className="map-info-window">
              <div className="map-info-header">
                <span className="map-info-emoji">{getCoverArt(activeRestaurant.cuisine, activeRestaurant.name).emoji}</span>
                <div>
                  <strong>{activeRestaurant.name}</strong>
                  <div className="map-info-meta">
                    {activeRestaurant.cuisine || "Cuisine unknown"}
                    {activeRestaurant.distance_km != null && ` · ${activeRestaurant.distance_km.toFixed(1)} km`}
                  </div>
                </div>
              </div>
              <RatingBadge rating={activeRestaurant.avg_rating} reviewCount={activeRestaurant.review_count} />
              <button type="button" className="map-info-button" onClick={() => onSelectRestaurant(activeRestaurant)}>
                View details
              </button>
            </div>
          </InfoWindowF>
        )}
      </GoogleMap>

      {showSearchButton && (
        <button type="button" className="search-area-button" onClick={handleSearchThisArea}>
          ⟳ Search this area
        </button>
      )}

      {onLocateMe && (
        <button
          type="button"
          className="locate-me-button"
          onClick={onLocateMe}
          aria-label="Recentre map on my location"
          title="Recentre on my location"
        >
          ⌖
        </button>
      )}
    </div>
  );
}

export default MapView;
