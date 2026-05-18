import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./Login.css";

export default function Register() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();

    setError("");
    setMessage("");

    if (!username || !password) {
      setError("Please fill in all fields.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch("http://localhost:5005/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Error creating account");
        return;
      }

      setMessage("Account created successfully!");

      console.log("API KEY:", data.apiKey);

      setTimeout(() => {
        navigate("/login");
      }, 1500);

    } catch (err) {
      setError("Cannot connect to backend");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">

        <h1 className="login-title">Create Account</h1>

        <p className="login-subtitle">
          Register your Speed Admin account
        </p>

        {error && (
          <div className="error-msg show">
            {error}
          </div>
        )}

        {message && (
          <div className="success-msg">
            {message}
          </div>
        )}

        <form onSubmit={handleRegister}>

          <div className="form-group">
            <label>Username</label>

            <input
              type="text"
              placeholder="your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Password</label>

            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="primary-btn"
            disabled={loading}
          >
            {loading ? "Creating..." : "Create account"}
          </button>

          <p className="login-signup">
            Already have an account?{" "}
            <Link to="/login">Sign in</Link>
          </p>

        </form>
      </div>
    </div>
  );
}