import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ErrorBoundary from "./ErrorBoundary";
import { AuthProvider } from "./auth/AuthContext";
import ProtectedRoute from "./auth/ProtectedRoute";
import Login from "./pages/login";
import Register from "./pages/Register";
import SavedLogs from "./pages/SavedLogs";
import MainPage from "./pages/MainPage";
import Settings from "./pages/Settings";
import AdminUsers from "./pages/AdminUsers";

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/login" />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            <Route
              path="/main"
              element={<ProtectedRoute><MainPage /></ProtectedRoute>}
            />
            <Route
              path="/saved-logs"
              element={<ProtectedRoute><SavedLogs /></ProtectedRoute>}
            />
            <Route
              path="/settings"
              element={<ProtectedRoute><Settings /></ProtectedRoute>}
            />
            <Route
              path="/admin/users"
              element={
                <ProtectedRoute roles={["admin"]}>
                  <AdminUsers />
                </ProtectedRoute>
              }
            />
            <Route path="/analysis" element={<Navigate to="/main" />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
