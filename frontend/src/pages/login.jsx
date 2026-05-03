import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Login.css";

export default function Login() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    email: "",
    password: "",
    remember: false,
  });

  const handleChange = (e) => {
    const { id, value, type, checked } = e.target;
    setForm({
      ...form,
      [id]: type === "checkbox" ? checked : value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.email || !form.password) {
      setError("Please fill in all fields.");
      return;
    }
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1200));
    setLoading(false);
    if (form.email === "admin@test.com" && form.password === "password123") {
      navigate("/main");
    } else {
      setError("Incorrect email or password.");
    }
  };

  return (
    <div className="login-container">
      <div className="card">

        <h1>Welcome</h1>
        <p className="subtitle">Sign in to your account</p>

        {error && <div className="error-msg">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              placeholder="you@email.com"
              value={form.email}
              onChange={handleChange}
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="pw-wrap">
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                placeholder="••••••••"
                value={form.password}
                onChange={handleChange}
              />
              <button
                type="button"
                className="toggle-pw"
                onClick={() => setShowPassword(!showPassword)}
              >
                👁
              </button>
            </div>
          </div>

          <div className="row-extras">
            <label className="remember">
              <input
                type="checkbox"
                id="remember"
                checked={form.remember}
                onChange={handleChange}
              />
              Remember me
            </label>

            <a href="#" className="forgot">Forgot password?</a>
          </div>

          <button
            type="submit"
            className={`btn-signin ${loading ? "loading" : ""}`}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}