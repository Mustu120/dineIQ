const supabase = require("../db");

// Protects a route by requiring a valid Supabase session token.
// The frontend sends it as: Authorization: Bearer <access_token>
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: "Missing access token" });
  }

  // Asks Supabase's auth server to verify the token and return the user
  // it belongs to. We never decode or verify the JWT ourselves.
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  req.user = data.user;
  next();
}

module.exports = requireAuth;
