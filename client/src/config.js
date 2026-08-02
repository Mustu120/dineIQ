// The backend's base URL. Set VITE_API_BASE in .env for local dev
// (http://localhost:5000) and to your deployed Render URL in production.
export const API_BASE = import.meta.env.VITE_API_BASE;

// Google Maps JavaScript API key -- get a free one at
// https://console.cloud.google.com/google/maps-apis/credentials (Google's
// free monthly credit covers ordinary personal/dev use). Restrict it by
// HTTP referrer once you have a real domain -- see client/.env.example.
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

// Ahmedabad, India -- used only as a starting point when geolocation is
// denied or unavailable. The location search bar (powered by the free
// OpenStreetMap Nominatim geocoder) can jump anywhere in the world from
// there.
export const DEFAULT_CENTER = { lat: 23.0225, lng: 72.5714 };
export const DEFAULT_CENTER_LABEL = "Ahmedabad, India";

// Only build the photo URL when the restaurant actually has a
// photo_reference -- otherwise every restaurant would fire a request the
// server can only answer with a 404 (see GET /api/restaurants/:id/photo).
export function getRestaurantPhotoUrl(restaurant) {
  return restaurant.photo_reference || restaurant.photo_url ? `${API_BASE}/api/restaurants/${restaurant.id}/photo` : null;
}
