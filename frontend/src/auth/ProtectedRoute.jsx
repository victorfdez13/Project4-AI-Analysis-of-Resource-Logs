import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./useAuth";

/**
 * Guards a route. Behaviour:
 *  - while we're still validating the stored token, render nothing
 *  - if not authenticated, redirect to /login (and remember where we came from)
 *  - if `roles` is provided, also enforce that the user's role is in that list
 */
export default function ProtectedRoute({ roles, children }) {
  const { isAuthenticated, bootstrapped, user } = useAuth();
  const location = useLocation();

  if (!bootstrapped) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#0e5a74",
        fontFamily: "system-ui, sans-serif",
      }}>
        Loading…
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (roles && roles.length > 0 && !roles.includes(user?.role)) {
    return <Navigate to="/main" replace />;
  }

  return children;
}
