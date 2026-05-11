import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:5005"
).replace(/\/+$/, "");

function buildUrl(path) {
  return `${API_BASE_URL}${path}`;
}

function tryParseJson(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function requestJson(path, options = {}) {
  const response = await fetch(buildUrl(path), {
    headers: {
      Accept: "application/json",
      ...options.headers,
    },
    ...options,
  });

  const responseText = await response.text();
  const payload = tryParseJson(responseText);

  if (!response.ok) {
    throw new Error(
      payload?.message ||
        payload?.detail ||
        payload?.title ||
        responseText ||
        `Request failed with HTTP ${response.status}.`
    );
  }

  return payload;
}

function StatusBadge({ healthy, label }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
        healthy
          ? "bg-teal-100 text-[#0e5a74]"
          : "bg-red-100 text-red-600"
      }`}
    >
      {label}
    </span>
  );
}

function SectionCard({ title, children }) {
  return (
    <section className="overflow-hidden rounded-[18px] border border-[#d9e1e7] bg-white shadow-[0_4px_14px_rgba(14,90,116,0.08)]">
      <div className="border-b border-[#d9e1e7] bg-[#fbfcfd] px-6 py-5">
        <h2 className="text-xl font-semibold text-[#0e5a74]">{title}</h2>
      </div>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [appHealth, setAppHealth] = useState(null);
  const [databaseHealth, setDatabaseHealth] = useState(null);
  const [aiHealth, setAiHealth] = useState(null);

  const navItems = [
    { label: "Dashboard", path: "/main" },
    { label: "Saved Logs", path: "/saved-logs" },
    { label: "Analysis", path: "/analysis" },
    { label: "Settings", path: "/settings" },
  ];

  useEffect(() => {
    const controller = new AbortController();

    async function loadSettings() {
      try {
        setLoading(true);
        setError("");

        const [appResponse, databaseResponse, aiResponse] = await Promise.all([
          requestJson("/health", { signal: controller.signal }),
          requestJson("/health/database", { signal: controller.signal }),
          requestJson("/health/ai", { signal: controller.signal }),
        ]);

        if (controller.signal.aborted) {
          return;
        }

        setAppHealth(appResponse);
        setDatabaseHealth(databaseResponse);
        setAiHealth(aiResponse);
      } catch (nextError) {
        if (!controller.signal.aborted) {
          setError(nextError.message || "Unable to load settings.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadSettings();

    return () => controller.abort();
  }, []);

  const sqlDatasets = databaseHealth?.sqlServer?.datasets || [];
  const expectedCollections = databaseHealth?.mongoDb?.expectedCollections || [];
  const availableCollections = databaseHealth?.mongoDb?.availableCollections || [];
  const missingCollections = databaseHealth?.mongoDb?.missingCollections || [];

  return (
    <div className="min-h-screen bg-[#f4f6f8] font-sans text-[#1f2a37]">
      <nav
        className="flex items-center justify-between px-6 py-3"
        style={{ background: "linear-gradient(135deg, #0e5a74, #0b4a60)" }}
      >
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded-full bg-[#e9782e]" />
          <span className="text-sm font-bold text-white">Resource</span>
          <span className="text-sm text-white/80">Logs</span>
        </div>
        <div className="flex gap-6">
          {navItems.map((item) => (
            <span
              key={item.label}
              onClick={() => navigate(item.path)}
              className={`cursor-pointer text-sm font-medium transition-colors ${
                item.label === "Settings"
                  ? "border-b-2 border-[#e9782e] pb-0.5 text-white"
                  : "text-white/70 hover:text-white"
              }`}
            >
              {item.label}
            </span>
          ))}
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e9782e] text-xs font-bold text-white">
          VS
        </div>
      </nav>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-8">
        <section className="rounded-[18px] border border-[#d9e1e7] bg-white px-6 py-6 shadow-[0_4px_14px_rgba(14,90,116,0.08)]">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#0e5a74]/60">
            System Settings
          </p>
          <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-[#0e5a74]">Settings</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#1f2a37]/65">
                A minimal overview of system access, service status, and dataset
                configuration for the current log analysis environment.
              </p>
            </div>
            <div className="rounded-xl border border-[#d9e1e7] bg-[#fbfcfd] px-4 py-3 text-sm text-[#1f2a37]/65">
              Backend endpoint:{" "}
              <span className="font-semibold text-[#0e5a74]">{API_BASE_URL}</span>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <SectionCard title="Account & Access">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-[#d9e1e7] bg-[#fbfcfd] px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#0e5a74]/60">
                  Role
                </p>
                <p className="mt-2 text-lg font-semibold text-[#1f2a37]">
                  Support / Demo User
                </p>
                <p className="mt-1 text-sm text-[#1f2a37]/60">
                  Current frontend flow is read-only and focused on log access and analysis.
                </p>
              </div>
              <div className="rounded-xl border border-[#d9e1e7] bg-[#fbfcfd] px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#0e5a74]/60">
                  Available datasets
                </p>
                <p className="mt-2 text-lg font-semibold text-[#1f2a37]">
                  {appHealth?.datasets?.length || 0}
                </p>
                <p className="mt-1 text-sm text-[#1f2a37]/60">
                  {(appHealth?.datasets || []).join(", ") || "No datasets reported yet."}
                </p>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Service Status">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-[#d9e1e7] bg-[#fbfcfd] px-4 py-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#0e5a74]">Backend</p>
                  <StatusBadge
                    healthy={appHealth?.status === "ok"}
                    label={appHealth?.status === "ok" ? "Healthy" : "Unknown"}
                  />
                </div>
                <p className="mt-3 text-sm text-[#1f2a37]/60">
                  Core API availability and route access.
                </p>
              </div>
              <div className="rounded-xl border border-[#d9e1e7] bg-[#fbfcfd] px-4 py-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#0e5a74]">Database</p>
                  <StatusBadge
                    healthy={databaseHealth?.isHealthy}
                    label={databaseHealth?.isHealthy ? "Healthy" : "Attention"}
                  />
                </div>
                <p className="mt-3 text-sm text-[#1f2a37]/60">
                  SQL Server and MongoDB availability for dataset access.
                </p>
              </div>
              <div className="rounded-xl border border-[#d9e1e7] bg-[#fbfcfd] px-4 py-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#0e5a74]">AI Service</p>
                  <StatusBadge
                    healthy={aiHealth?.isHealthy}
                    label={aiHealth?.isHealthy ? "Healthy" : "Attention"}
                  />
                </div>
                <p className="mt-3 text-sm text-[#1f2a37]/60">
                  Rule-based analysis pipeline and model integration endpoint.
                </p>
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1fr]">
          <SectionCard title="Data Sources">
            <div className="space-y-4">
              <div className="rounded-xl border border-[#d9e1e7] bg-[#fbfcfd] px-4 py-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#0e5a74]">SQL datasets</p>
                  <span className="text-sm font-semibold text-[#1f2a37]/65">
                    {sqlDatasets.length} configured
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {sqlDatasets.length > 0 ? (
                    sqlDatasets.map((dataset) => (
                      <span
                        key={dataset.dataset}
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                          dataset.isAvailable
                            ? "bg-teal-100 text-[#0e5a74]"
                            : "bg-red-100 text-red-600"
                        }`}
                      >
                        {dataset.dataset}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-[#1f2a37]/50">
                      {loading ? "Loading datasets..." : "No dataset details available."}
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-[#d9e1e7] bg-[#fbfcfd] px-4 py-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#0e5a74]">Mongo collections</p>
                  <span className="text-sm font-semibold text-[#1f2a37]/65">
                    {availableCollections.length} available
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {expectedCollections.length > 0 ? (
                    expectedCollections.map((collectionName) => {
                      const isAvailable = availableCollections.some(
                        (availableCollection) =>
                          availableCollection.toLowerCase() === collectionName.toLowerCase()
                      );

                      return (
                        <span
                          key={collectionName}
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            isAvailable
                              ? "bg-teal-100 text-[#0e5a74]"
                              : "bg-red-100 text-red-600"
                          }`}
                        >
                          {collectionName}
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-sm text-[#1f2a37]/50">
                      {loading ? "Loading collections..." : "No Mongo collection details available."}
                    </span>
                  )}
                </div>
                {missingCollections.length > 0 && (
                  <p className="mt-3 text-sm text-red-600">
                    Missing collections: {missingCollections.join(", ")}
                  </p>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="AI & Environment">
            <div className="rounded-xl border border-[#d9e1e7] bg-[#fbfcfd] px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#0e5a74]/60">
                AI service base URL
              </p>
              <p className="mt-2 text-lg font-semibold text-[#1f2a37]">
                {aiHealth?.baseUrl || "Not available"}
              </p>
              <p className="mt-1 text-sm text-[#1f2a37]/60">
                The backend calls the AI pipeline through a stable service interface.
              </p>
            </div>
          </SectionCard>
        </div>
      </main>
    </div>
  );
}
