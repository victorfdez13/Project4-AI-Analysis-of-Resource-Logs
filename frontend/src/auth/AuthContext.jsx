import { useCallback, useEffect, useMemo, useState } from "react";
import { postJson, getJson } from "../apiClient";
import { AuthContext } from "./authContextValue";

const STORAGE_KEY = "auth_api_key";
const PROFILE_KEY = "auth_profile";

function readStoredProfile() {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStoredProfile(profile) {
  try {
    if (profile) {
      window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } else {
      window.localStorage.removeItem(PROFILE_KEY);
    }
  } catch {
    // best-effort
  }
}

function writeApiKey(apiKey) {
  try {
    if (apiKey) {
      window.localStorage.setItem(STORAGE_KEY, apiKey);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // best-effort
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readStoredProfile());
  const [bootstrapped, setBootstrapped] = useState(false);

  // On first mount, if we have a stored key, validate it against /me.
  // If invalid, clear the session.
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (!stored) {
          if (!cancelled) setBootstrapped(true);
          return;
        }
        const profile = await getJson("/me");
        if (cancelled) return;
        setUser(profile);
        writeStoredProfile(profile);
      } catch {
        if (cancelled) return;
        writeApiKey(null);
        writeStoredProfile(null);
        setUser(null);
      } finally {
        if (!cancelled) setBootstrapped(true);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username, password) => {
    const result = await postJson("/login", { username, password });
    writeApiKey(result.apiKey);
    const profile = {
      username: result.username,
      role: result.role,
      allowedDatasets: result.allowedDatasets ?? [],
    };
    writeStoredProfile(profile);
    setUser(profile);
    return profile;
  }, []);

  const logout = useCallback(() => {
    writeApiKey(null);
    writeStoredProfile(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === "admin",
      isSupportAgent: user?.role === "support_agent",
      isCustomer: user?.role === "customer",
      bootstrapped,
      login,
      logout,
    }),
    [user, bootstrapped, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
