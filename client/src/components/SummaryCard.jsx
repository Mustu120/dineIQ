import { useState } from "react";
import { API_BASE } from "../config";

// restaurantId: uuid string. Deliberately lazy -- GET /api/restaurants/:id/summary
// isn't fetched until the user actually asks for it, since most people
// opening a restaurant just want to browse reviews, not read a summary of
// them. Fetched once and kept, so re-toggling collapsed/expanded doesn't
// re-fetch.
function SummaryCard({ restaurantId }) {
  const [summary, setSummary] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleToggle = () => {
    if (expanded) {
      setExpanded(false);
      return;
    }

    setExpanded(true);
    if (summary) return; // already fetched, just revealing it again

    setLoading(true);
    setError("");
    fetch(`${API_BASE}/api/restaurants/${restaurantId}/summary`)
      .then((res) => res.json())
      .then(setSummary)
      .catch(() => setError("Could not load review summary."))
      .finally(() => setLoading(false));
  };

  return (
    <div className="summary-card">
      <div className="summary-card-header">
        <h3>Review Summary</h3>
        <button type="button" className="ghost-button summary-toggle" onClick={handleToggle}>
          {expanded ? "Hide summary" : "View summary"}
        </button>
      </div>

      {expanded && (
        <>
          {loading && <p className="empty-state">Summarising reviews…</p>}
          {error && <p className="error-text">{error}</p>}
          {summary && <SummaryBody summary={summary} />}
        </>
      )}
    </div>
  );
}

function SummaryBody({ summary }) {
  if (summary.totalReviews === 0) {
    return <p className="empty-state">No reviews yet.</p>;
  }

  const hasCompliments = summary.topCompliments.length > 0;
  const hasComplaints = summary.topComplaints.length > 0;

  return (
    <>
      <p className="summary-stat">
        <span className="stat-badge stat-badge-good">{summary.positivePercent}% positive</span>
        <span className="muted-text">
          {" "}
          ({summary.totalReviews} review{summary.totalReviews === 1 ? "" : "s"})
        </span>
      </p>

      {summary.positiveHighlights.length > 0 && (
        <div className="highlight-block highlight-good">
          <h4 className="section-label">What people love</h4>
          {summary.positiveHighlights.map((sentence) => (
            <p key={sentence} className="highlight-quote">
              “{sentence}”
            </p>
          ))}
        </div>
      )}

      {summary.negativeHighlights.length > 0 && (
        <div className="highlight-block highlight-critical">
          <h4 className="section-label">Common complaints</h4>
          {summary.negativeHighlights.map((sentence) => (
            <p key={sentence} className="highlight-quote">
              “{sentence}”
            </p>
          ))}
        </div>
      )}

      {(hasCompliments || hasComplaints) && (
        <>
          <h4 className="section-label">Recurring themes</h4>
          <ul className="tag-list">
            {summary.topCompliments.map((c) => (
              <li key={`good-${c.phrase}`} className="tag tag-good">
                {c.phrase} <span className="tag-count">{c.count}</span>
              </li>
            ))}
            {summary.topComplaints.map((c) => (
              <li key={`bad-${c.phrase}`} className="tag tag-critical">
                {c.phrase} <span className="tag-count">{c.count}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {summary.positiveHighlights.length === 0 && summary.negativeHighlights.length === 0 && (
        <p className="empty-state">Reviews are too short to summarise yet.</p>
      )}
    </>
  );
}

export default SummaryCard;
