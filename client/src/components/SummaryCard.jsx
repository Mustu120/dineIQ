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

  if (error) return <p>{error}</p>;
  if (!summary) return <p>Loading summary...</p>;

  if (summary.totalReviews === 0) {
    return (
      <div className="summary-card">
        <h3>Review Summary</h3>
        <p>No reviews yet.</p>
      </div>
    );
  }

  return (
    <div className="summary-card">
      <h3>Review Summary</h3>
      <p>
        {summary.positivePercent}% positive ({summary.totalReviews} review
        {summary.totalReviews === 1 ? "" : "s"})
      </p>

      <h4>Top Compliments</h4>
      {summary.topCompliments.length > 0 ? (
        <ul>
          {summary.topCompliments.map((c) => (
            <li key={c.phrase}>
              {c.phrase} ({c.count})
            </li>
          ))}
        </ul>
      ) : (
        <p>Not enough data yet.</p>
      )}

      <h4>Top Complaints</h4>
      {summary.topComplaints.length > 0 ? (
        <ul>
          {summary.topComplaints.map((c) => (
            <li key={c.phrase}>
              {c.phrase} ({c.count})
            </li>
          ))}
        </ul>
      ) : (
        <p>No recurring complaints.</p>
      )}
    </div>
  );
}

export default SummaryCard;
