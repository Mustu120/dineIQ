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

// Chart colors mirror the CSS custom properties in index.css, but Recharts
// needs real color values (not CSS vars), so light/dark variants are picked
// in JS based on the same OS-level signal the CSS media query uses.
const PALETTE = {
  light: { seriesBlue: "#e23744", grid: "#ece6e1", axis: "#ddd4cd", mutedText: "#948b86", surface: "#ffffff" },
  dark: { seriesBlue: "#ff5a68", grid: "#2c2624", axis: "#3a332f", mutedText: "#948b86", surface: "#1e1b19" },
};

// Sentiment is a status, not a series: positive/negative map to the fixed
// good/critical status colors (same in both themes), neutral gets a plain
// muted gray.
const SENTIMENT_COLORS = { Positive: "#0c8a3e", Neutral: "#948b86", Negative: "#d03b3b" };

function usePrefersDarkMode() {
  const [isDark, setIsDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = (e) => setIsDark(e.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  return isDark;
}

// restaurant: { id, name }. token: the logged-in user's Supabase access
// token, needed because this route requires auth.
function AnalyticsDashboard({ restaurant, token, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const isDark = usePrefersDarkMode();
  const colors = isDark ? PALETTE.dark : PALETTE.light;
  const axisTick = { fill: colors.mutedText, fontSize: 12 };

  useEffect(() => {
    fetch(`${API_BASE}/api/restaurants/${restaurant.id}/analytics`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then(setData)
      .catch(() => setError("Could not load analytics."));
  }, [restaurant.id, token]);

  return (
    <div className="page">
      <button type="button" className="ghost-button" onClick={onBack}>
        &larr; Back
      </button>
      <h2>Analytics: {restaurant.name}</h2>

      {error && <p className="error-text">{error}</p>}
      {!data && !error && <p className="empty-state">Loading analytics...</p>}

      {data && (
        <>
          <section className="chart-card">
            <h3>Reviews Over Time</h3>
            {data.reviewsOverTime.length === 0 ? (
              <p className="empty-state">No reviews yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.reviewsOverTime}>
                  <CartesianGrid stroke={colors.grid} vertical={false} />
                  <XAxis dataKey="date" stroke={colors.axis} tick={axisTick} />
                  <YAxis allowDecimals={false} stroke={colors.axis} tick={axisTick} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="count"
                    name="Reviews"
                    stroke={colors.seriesBlue}
                    strokeWidth={2}
                    dot={{ r: 4, fill: colors.seriesBlue, stroke: colors.surface, strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </section>

          <section className="chart-card">
            <h3>Sentiment Breakdown</h3>
            {data.sentimentBreakdown.every((s) => s.value === 0) ? (
              <p className="empty-state">No reviews yet.</p>
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
              <p className="empty-state">No recurring complaints.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.topComplaints}>
                  <CartesianGrid stroke={colors.grid} vertical={false} />
                  <XAxis dataKey="phrase" stroke={colors.axis} tick={axisTick} />
                  <YAxis allowDecimals={false} stroke={colors.axis} tick={axisTick} />
                  <Tooltip />
                  <Bar dataKey="count" name="Mentions" fill={colors.seriesBlue} radius={[4, 4, 0, 0]} barSize={32}>
                    <LabelList dataKey="count" position="top" fill={colors.mutedText} fontSize={12} />
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
