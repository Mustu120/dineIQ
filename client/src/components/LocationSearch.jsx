import { useEffect, useRef, useState } from "react";
import { API_BASE } from "../config";

// A free-text "search any city or neighbourhood" bar, backed by the
// server's /api/geocode proxy (which in turn calls OpenStreetMap's free
// Nominatim geocoder). Debounced so it doesn't fire a request per
// keystroke -- the same pattern the guide uses for the map's own search
// requests, applied here to a different free API.
function LocationSearch({ onSelectLocation }) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (query.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`${API_BASE}/api/geocode?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data) => {
          setSuggestions(Array.isArray(data) ? data : []);
          setOpen(true);
        })
        .catch((e) => {
          if (e.name !== "AbortError") setSuggestions([]);
        })
        .finally(() => setLoading(false));
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (place) => {
    onSelectLocation({ lat: place.latitude, lng: place.longitude, label: place.label });
    setQuery(place.label.split(",").slice(0, 2).join(","));
    setOpen(false);
  };

  return (
    <div className="location-search" ref={containerRef}>
      <span className="location-search-icon" aria-hidden="true">
        📍
      </span>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder="Search for a city or area…"
        aria-label="Search for a location"
      />
      {loading && <span className="location-search-spinner" aria-hidden="true" />}

      {open && suggestions.length > 0 && (
        <ul className="location-suggestions">
          {suggestions.map((place, i) => (
            <li key={i}>
              <button type="button" onClick={() => handleSelect(place)}>
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default LocationSearch;
