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
    <div>
      <h1>Log In</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="email">Email</label>
          <br />
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <br />
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit">Log In</button>
      </form>
      {message && <p>{message}</p>}
      <p>
        Don't have an account?{" "}
        <button type="button" onClick={onSwitchToSignUp}>
          Sign up
        </button>
      </p>
    </div>
  );
}

export default Login;
