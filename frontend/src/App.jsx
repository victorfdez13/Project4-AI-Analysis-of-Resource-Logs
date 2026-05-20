import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ErrorBoundary from "./ErrorBoundary";
import Login from "./pages/login";
import Register from "./pages/Register";
import SavedLogs from "./pages/SavedLogs";
import MainPage from "./pages/MainPage";
import Settings from "./pages/Settings";

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/main" element={<MainPage />} />
          <Route path="/saved-logs" element={<SavedLogs />} />
          <Route path="/analysis" element={<Navigate to="/main" />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;