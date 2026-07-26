import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LabelList,
} from "recharts";
import { API_BASE } from "../config";

// Single hue for single-series charts (reviews-over-time line, complaint
// bars) -- these aren't "identity" charts, so every mark gets the same slot.
const SERIES_BLUE = "#2a78d6";

// Sentiment is a status, not a series: positive/negative map to the fixed
// good/critical status colors, neutral gets a plain muted gray.
const SENTIMENT_COLORS = { Positive: "#0ca30c", Neutral: "#898781", Negative: "#d03b3b" };

const GRID_COLOR = "#e1e0d9";
const AXIS_COLOR = "#c3c2b7";
const MUTED_TEXT = "#898781";
const SURFACE = "#fcfcfb";

const axisTick = { fill: MUTED_TEXT, fontSize: 12 };

// restaurant: { id, name }. token: the logged-in user's Supabase access
// token, needed because this route requires auth.
function AnalyticsDashboard({ restaurant, token, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/api/restaurants/${restaurant.id}/analytics`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then(setData)
      .catch(() => setError("Could not load analytics."));
  }, [restaurant.id, token]);

  return (
    <div>
      <button type="button" onClick={onBack}>
        &larr; Back
      </button>
      <h2>Analytics: {restaurant.name}</h2>

      {error && <p>{error}</p>}
      {!data && !error && <p>Loading analytics...</p>}

      {data && (
        <>
          <section className="chart-card">
            <h3>Reviews Over Time</h3>
            {data.reviewsOverTime.length === 0 ? (
              <p>No reviews yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.reviewsOverTime}>
                  <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                  <XAxis dataKey="date" stroke={AXIS_COLOR} tick={axisTick} />
                  <YAxis allowDecimals={false} stroke={AXIS_COLOR} tick={axisTick} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="count"
                    name="Reviews"
                    stroke={SERIES_BLUE}
                    strokeWidth={2}
                    dot={{ r: 4, fill: SERIES_BLUE, stroke: SURFACE, strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </section>

          <section className="chart-card">
            <h3>Sentiment Breakdown</h3>
            {data.sentimentBreakdown.every((s) => s.value === 0) ? (
              <p>No reviews yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={data.sentimentBreakdown}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={90}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {data.sentimentBreakdown.map((entry) => (
                      <Cell key={entry.name} fill={SENTIMENT_COLORS[entry.name]} />
                    ))}
                  </Pie>
                  <Legend />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </section>

          <section className="chart-card">
            <h3>Top Complaint Keywords</h3>
            {data.topComplaints.length === 0 ? (
              <p>No recurring complaints.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.topComplaints}>
                  <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                  <XAxis dataKey="phrase" stroke={AXIS_COLOR} tick={axisTick} />
                  <YAxis allowDecimals={false} stroke={AXIS_COLOR} tick={axisTick} />
                  <Tooltip />
                  <Bar dataKey="count" name="Mentions" fill={SERIES_BLUE} radius={[4, 4, 0, 0]} barSize={32}>
                    <LabelList dataKey="count" position="top" fill={MUTED_TEXT} fontSize={12} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default AnalyticsDashboard;
