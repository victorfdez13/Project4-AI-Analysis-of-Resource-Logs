import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../auth/useAuth';
import './Login.css';

const EyeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const LogoIcon = () => (
  <svg width="52" height="40" viewBox="0 0 52 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="20" cy="20" rx="16" ry="20" fill="#1a6e7e" />
    <clipPath id="rightHalf">
      <rect x="20" y="0" width="32" height="40" />
    </clipPath>
    <ellipse cx="28" cy="20" rx="16" ry="20" fill="#e9782e" clipPath="url(#rightHalf)" />
    <path d="M20 0 C24 8, 24 32, 20 40" stroke="white" strokeWidth="2.5" fill="none" />
  </svg>
);

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [username, setUsername]   = useState('');
  const [password, setPassword]   = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    try {
      await login(username.trim(), password);
      const next = location.state?.from || '/main';
      navigate(next, { replace: true });
    } catch (err) {
      setError(err?.message || 'Sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">

        {/* Logo */}
        <div className="login-logo">
          <LogoIcon />
          <div className="login-logo-text">
            <span className="speed">Speed</span>
            <span className="admin">Admin</span>
          </div>
        </div>

        <h1 className="login-title">Internal Staff Portal</h1>
        <p className="login-subtitle">Sign in with your work credentials</p>

        {/* Error message */}
        {error && (
          <div className="error-msg show">{error}</div>
        )}

        <form onSubmit={handleSubmit} noValidate>

          {/* Username */}
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              placeholder="e.g. admin"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          {/* Password */}
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="pw-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                placeholder="••••••••"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="toggle-pw"
                onClick={() => setShowPassword(!showPassword)}
                aria-label="Show/hide password"
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          {/* Remember me */}
          <div className="login-row">
            <label className="login-remember">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              Keep me signed in on this device
            </label>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            className="primary-btn"
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          {/* Sign up link */}
          <p className="login-signup">
            Don't have an account?{' '}
            <Link to="/register">Request access</Link>
          </p>

        </form>
      </div>

      <p className="login-footer">
        For authorised SpeedAdmin staff only. &copy; 2026 SpeedAdmin.
      </p>
    </div>
  );
}
