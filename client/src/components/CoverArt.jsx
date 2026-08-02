import { useState } from "react";

// The gradient + food emoji is the fallback cover for a restaurant with no
// real photo (or whose photo hasn't loaded yet, or failed to load) --
// picked from the cuisine tag, or a stable hash of the name when there's
// no cuisine, so the same restaurant always renders the same cover
// instead of flickering between re-renders or page loads.
const CUISINE_STYLES = [
  { match: /pizza|italian/, emoji: "🍕", gradient: ["#ff7e5f", "#e23744"] },
  { match: /indian|curry|thali|biryani/, emoji: "🍛", gradient: ["#f6a93b", "#e23744"] },
  { match: /chinese|noodle|dim ?sum/, emoji: "🥡", gradient: ["#ff6a6a", "#c0242f"] },
  { match: /japanese|sushi|ramen/, emoji: "🍣", gradient: ["#ff9a8b", "#5b6ee1"] },
  { match: /mexican|taco|burrito/, emoji: "🌮", gradient: ["#ffd76a", "#3fb27f"] },
  { match: /cafe|coffee/, emoji: "☕", gradient: ["#c69c6d", "#7a4e2d"] },
  { match: /bakery|dessert|ice.?cream|patisserie/, emoji: "🍰", gradient: ["#ffb3c6", "#e23744"] },
  { match: /burger|fast.?food/, emoji: "🍔", gradient: ["#ffcf5c", "#e23744"] },
  { match: /bar|pub|beer|biergarten/, emoji: "🍺", gradient: ["#ffb85c", "#8a5a13"] },
  { match: /seafood|fish/, emoji: "🦐", gradient: ["#5fd6d0", "#2a7f8f"] },
  { match: /vegan|vegetarian|salad/, emoji: "🥗", gradient: ["#8fd694", "#2f9e44"] },
  { match: /bbq|barbecue|grill|steak/, emoji: "🍖", gradient: ["#ff9457", "#8a2e12"] },
  { match: /thai/, emoji: "🍜", gradient: ["#8fe3c0", "#e23744"] },
  { match: /breakfast|brunch/, emoji: "🥞", gradient: ["#ffe08a", "#e8833a"] },
];

const FALLBACK_GRADIENTS = [
  ["#ff9966", "#e23744"],
  ["#8fd694", "#2f9e44"],
  ["#5fd6d0", "#2a7f8f"],
  ["#ffb85c", "#8a5a13"],
  ["#a29bfe", "#6c5ce7"],
];

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getCoverArt(cuisine, name = "") {
  const needle = (cuisine || "").toLowerCase();
  const known = CUISINE_STYLES.find((style) => style.match.test(needle));
  if (known) return known;

  const gradient = FALLBACK_GRADIENTS[hashString(name) % FALLBACK_GRADIENTS.length];
  return { emoji: "🍽️", gradient };
}

// size: "sm" (card thumbnails) | "lg" (detail page hero)
// photoUrl: real photo endpoint (GET /api/restaurants/:id/photo) | null --
// omitted entirely for restaurants Google has no photo for. Loads behind
// the gradient (so there's never a blank flash) and falls back to the
// emoji placeholder if the image 404s or errors.
function CoverArt({ cuisine, name, size = "sm", photoUrl, photoAttribution, children }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const { emoji, gradient } = getCoverArt(cuisine, name);
  const style = {
    backgroundImage: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
  };
  const showPhoto = photoUrl && !photoFailed;

  return (
    <div className={`cover-art cover-art-${size}`} style={style}>
      {showPhoto ? (
        <img
          className="cover-art-photo"
          src={photoUrl}
          alt={name}
          loading="lazy"
          onError={() => setPhotoFailed(true)}
        />
      ) : (
        <span className="cover-art-emoji" aria-hidden="true">
          {emoji}
        </span>
      )}
      {showPhoto && photoAttribution && <span className="cover-art-attribution">Photo: {photoAttribution}</span>}
      {children}
    </div>
  );
}

export default CoverArt;
