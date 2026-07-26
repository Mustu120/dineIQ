import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Leaflet's default marker icon looks for image files at paths that don't
// exist once bundled by Vite. Pointing it at the imported files fixes that.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// userLocation: { latitude, longitude } | null
// restaurants: [{ id, name, cuisine, latitude, longitude, distance_km, ... }]
function MapView({ userLocation, restaurants = [] }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const userMarkerRef = useRef(null);
  const restaurantLayerRef = useRef(null);

  // Create the map once, when the component first mounts.
  useEffect(() => {
    const startCenter = userLocation
      ? [userLocation.latitude, userLocation.longitude]
      : [0, 0];

    const map = L.map(containerRef.current).setView(
      startCenter,
      userLocation ? 14 : 2
    );

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    restaurantLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Move the "you are here" marker whenever the location changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userLocation) return;

    const latLng = [userLocation.latitude, userLocation.longitude];

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng(latLng);
    } else {
      userMarkerRef.current = L.marker(latLng).addTo(map).bindPopup("You are here");
    }

    map.setView(latLng, 14);
  }, [userLocation]);

  // Redraw restaurant pins whenever the list changes.
  useEffect(() => {
    const layer = restaurantLayerRef.current;
    if (!layer) return;

    layer.clearLayers();

    restaurants.forEach((restaurant) => {
      L.marker([restaurant.latitude, restaurant.longitude])
        .addTo(layer)
        .bindPopup(
          `<strong>${restaurant.name}</strong><br />` +
            `${restaurant.cuisine || "Cuisine unknown"}<br />` +
            `${restaurant.distance_km?.toFixed(1)} km away`
        );
    });
  }, [restaurants]);

  return <div ref={containerRef} style={{ height: "400px", width: "100%" }} />;
}

export default MapView;
