import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";

const ROLE_LABEL = {
  admin: "Admin",
  support_agent: "Support Agent",
  customer: "Customer",
};

const ROLE_BADGE_CLASS = {
  admin: "bg-[#e9782e] text-white",
  support_agent: "bg-[#0e5a74] text-white",
  customer: "bg-[#d9e1e7] text-[#0e5a74]",
};

function initialsFor(username) {
  if (!username) return "?";
  const parts = username.replace(/[^a-zA-Z0-9]+/g, " ").trim().split(" ");
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Navbar({ active }) {
  const navigate = useNavigate();
  const { user, logout, isAdmin } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function onClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const navItems = [
    { label: "Dashboard", path: "/main" },
    { label: "Saved Logs", path: "/saved-logs" },
    { label: "Settings", path: "/settings" },
  ];

  if (isAdmin) {
    navItems.push({ label: "Users", path: "/admin/users" });
  }

  const role = user?.role || "customer";
  const roleLabel = ROLE_LABEL[role] || role;
  const badgeClass = ROLE_BADGE_CLASS[role] || ROLE_BADGE_CLASS.customer;

  return (
    <nav
      className="px-6 py-3 flex items-center justify-between flex-shrink-0"
      style={{ background: "linear-gradient(135deg, #0e5a74, #0b4a60)" }}
    >
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-full bg-[#e9782e]" />
        <span className="text-white font-bold text-sm">SpeedAdmin</span>
        <span className="text-white/60 text-xs hidden md:inline">
          | Internal Staff Portal
        </span>
      </div>

      <div className="flex gap-6">
        {navItems.map((item) => (
          <span
            key={item.label}
            onClick={() => navigate(item.path)}
            className={`text-sm cursor-pointer font-medium transition-colors ${
              active === item.label
                ? "text-white border-b-2 border-[#e9782e] pb-0.5"
                : "text-white/70 hover:text-white"
            }`}
          >
            {item.label}
          </span>
        ))}
      </div>

      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((open) => !open)}
          className="flex items-center gap-2 group"
          aria-haspopup="true"
          aria-expanded={menuOpen}
        >
          <div className="hidden sm:flex flex-col items-end leading-tight">
            <span className="text-white text-sm font-semibold">
              {user?.username || "-"}
            </span>
            <span
              className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-bold ${badgeClass}`}
            >
              {roleLabel}
            </span>
          </div>
          <div className="w-9 h-9 rounded-full bg-[#e9782e] flex items-center justify-center text-white text-xs font-bold group-hover:bg-[#d4691f] transition-colors">
            {initialsFor(user?.username)}
          </div>
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-[#d9e1e7] rounded-xl shadow-lg overflow-hidden z-50">
            <div className="px-4 py-3 border-b border-[#e8edf1] bg-[#fbfcfd]">
              <p className="text-[#1f2a37] font-semibold text-sm">
                {user?.username}
              </p>
              <p className="text-[#1f2a37]/50 text-xs mt-0.5">{roleLabel}</p>
            </div>
            <div className="px-4 py-3 border-b border-[#e8edf1]">
              <p className="text-[10px] uppercase tracking-widest text-[#0e5a74]/60 font-semibold mb-2">
                Permissions
              </p>
              <ul className="text-xs text-[#1f2a37]/80 space-y-1">
                <li>
                  <strong>Datasets:</strong>{" "}
                  {(user?.allowedDatasets || []).join(", ") || "none"}
                </li>
                <li>
                  {role === "admin"
                    ? "Full access, can manage users and dataset assignments"
                    : role === "support_agent"
                      ? "Read and analyze logs in assigned customer datasets"
                      : "Can view, prompt, and save analyses within the assigned dataset"}
                </li>
              </ul>
            </div>
            <button
              onClick={() => {
                setMenuOpen(false);
                logout();
                navigate("/login");
              }}
              className="w-full text-left px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
