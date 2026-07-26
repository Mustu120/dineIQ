import { useEffect, useState } from "react";
import { API_BASE } from "../config";

// restaurantId: uuid string. Fetches /api/restaurants/:id/summary and
// renders overall sentiment plus top recurring compliments/complaints.
function SummaryCard({ restaurantId }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/api/restaurants/${restaurantId}/summary`)
      .then((res) => res.json())
      .then(setSummary)
      .catch(() => setError("Could not load review summary."));
  }, [restaurantId]);

  if (error) return <p className="error-text">{error}</p>;
  if (!summary) return <p className="empty-state">Loading summary...</p>;

  if (summary.totalReviews === 0) {
    return (
      <div className="summary-card">
        <h3>Review Summary</h3>
        <p className="empty-state">No reviews yet.</p>
      </div>
    );
  }

  return (
    <div className="summary-card">
      <h3>Review Summary</h3>
      <p className="summary-stat">
        <span className="stat-badge stat-badge-good">{summary.positivePercent}% positive</span>
        <span className="muted-text">
          {" "}
          ({summary.totalReviews} review{summary.totalReviews === 1 ? "" : "s"})
        </span>
      </p>

      <h4 className="section-label">Top Compliments</h4>
      {summary.topCompliments.length > 0 ? (
        <ul className="tag-list">
          {summary.topCompliments.map((c) => (
            <li key={c.phrase} className="tag tag-good">
              {c.phrase} <span className="tag-count">{c.count}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-state">Not enough data yet.</p>
      )}

      <h4 className="section-label">Top Complaints</h4>
      {summary.topComplaints.length > 0 ? (
        <ul className="tag-list">
          {summary.topComplaints.map((c) => (
            <li key={c.phrase} className="tag tag-critical">
              {c.phrase} <span className="tag-count">{c.count}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-state">No recurring complaints.</p>
      )}
    </div>
  );
}

export default SummaryCard;
