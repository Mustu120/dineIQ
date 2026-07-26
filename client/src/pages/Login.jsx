import { useState } from "react";
import { supabase } from "../supabaseClient";

function Login({ onSwitchToSignUp }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
    }
    // On success, the onAuthStateChange listener in App.jsx picks up the
    // new session automatically -- no need to do anything else here.
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Log In</h1>
        <div className="form-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="primary-button">
          Log In
        </button>
        {message && <p className="auth-message">{message}</p>}
        <p>
          Don't have an account?{" "}
          <button type="button" className="link-button" onClick={onSwitchToSignUp}>
            Sign up
          </button>
        </p>
      </form>
    </div>
  );
}

export default Login;
