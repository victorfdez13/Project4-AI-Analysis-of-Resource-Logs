import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import { requestJson } from "../apiClient";

const levelLabels = {
  0: "Trace",
  1: "Debug",
  2: "Information",
  3: "Warning",
  4: "Error",
  5: "Critical",
};

function formatLevelDisplay(level) {
  const normalizedLevel = String(level ?? "").trim();
  if (!normalizedLevel) {
    return "-";
  }

  const label = levelLabels[Number(normalizedLevel)] || `Level ${normalizedLevel}`;
  return `${label} (${normalizedLevel})`;
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function StatusBadge({ healthy, label }) {
  const toneClass =
    healthy === null || healthy === undefined
      ? "bg-slate-100 text-slate-600"
      : healthy
        ? "bg-teal-100 text-[#0e5a74]"
        : "bg-red-100 text-red-600";

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${toneClass}`}
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

function MetricTile({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-[#d9e1e7] bg-[#fbfcfd] px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#0e5a74]/60">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold text-[#1f2a37]">{value}</p>
      {hint ? <p className="mt-1 text-sm text-[#1f2a37]/60">{hint}</p> : null}
    </div>
  );
}

function getStatusLabel(healthy, healthyLabel = "Healthy", unhealthyLabel = "Attention") {
  if (healthy === null || healthy === undefined) {
    return "Unknown";
  }

  return healthy ? healthyLabel : unhealthyLabel;
}

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [appHealth, setAppHealth] = useState(null);
  const [databaseHealth, setDatabaseHealth] = useState(null);
  const [aiHealth, setAiHealth] = useState(null);
  const [datasetSummaries, setDatasetSummaries] = useState([]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSettings() {
      try {
        setLoading(true);
        setError("");

        const [appResult, databaseResult, aiResult, datasetResult] =
          await Promise.allSettled([
            requestJson("/health", {}, { signal: controller.signal }),
            requestJson("/health/database", {}, { signal: controller.signal }),
            requestJson("/health/ai", {}, { signal: controller.signal }),
            requestJson("/api/logs/datasets", {}, { signal: controller.signal }),
          ]);

        if (controller.signal.aborted) {
          return;
        }

        const nextDatasets =
          datasetResult.status === "fulfilled"
            ? datasetResult.value?.datasets || []
            : [];
        const summaryResults = await Promise.allSettled(
          nextDatasets.map((dataset) =>
            requestJson(
              "/api/logs/summary",
              { dataset },
              { signal: controller.signal }
            )
          )
        );

        if (controller.signal.aborted) {
          return;
        }

        const summaryResponses = summaryResults
          .filter((result) => result.status === "fulfilled")
          .map((result) => result.value);
        const loadIssues = [];

        if (appResult.status === "rejected") {
          loadIssues.push("Application status is unavailable.");
        }
        if (databaseResult.status === "rejected") {
          loadIssues.push("Database health is degraded.");
        }
        if (aiResult.status === "rejected") {
          loadIssues.push("Explanation service status is unavailable.");
        }
        if (datasetResult.status === "rejected") {
          loadIssues.push("Dataset availability could not be loaded.");
        }
        if (summaryResults.some((result) => result.status === "rejected")) {
          loadIssues.push("Some dataset summaries could not be loaded.");
        }

        setAppHealth(appResult.status === "fulfilled" ? appResult.value : null);
        setDatabaseHealth(
          databaseResult.status === "fulfilled" ? databaseResult.value : null
        );
        setAiHealth(aiResult.status === "fulfilled" ? aiResult.value : null);
        setDatasetSummaries(summaryResponses);
        setError(loadIssues.join(" "));
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

  const datasetHealth = databaseHealth?.sqlServer?.datasets || [];
  const totalLogs = datasetSummaries.reduce(
    (sum, summary) => sum + (summary.totalCount || 0),
    0
  );
  const observedLevels = [...new Set(
    datasetSummaries.flatMap((summary) =>
      (summary.levels || []).map((level) => String(level.level))
    )
  )]
    .sort((left, right) => Number(left) - Number(right))
    .map(formatLevelDisplay);
  const connectedServicesLabel = loading
    ? "Checking..."
    : appHealth?.status === "ok" &&
        aiHealth?.isHealthy &&
        (databaseHealth?.isHealthy ?? true)
      ? "Active"
      : "Degraded";

  return (
    <div className="min-h-screen bg-[#f4f6f8] font-sans text-[#1f2a37]">
      <Navbar active="Settings" />

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-8">
        <section className="rounded-[18px] border border-[#d9e1e7] bg-white px-6 py-6 shadow-[0_4px_14px_rgba(14,90,116,0.08)]">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#0e5a74]/60">
            Settings
          </p>
          <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-[#0e5a74]">Settings</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#1f2a37]/65">
                Use this page to see platform status, available data sources,
                and a quick summary of the activity currently available for
                review.
              </p>
            </div>
            <div className="rounded-xl border border-[#d9e1e7] bg-[#fbfcfd] px-4 py-3 text-sm text-[#1f2a37]/65">
              Connected services:{" "}
              <span className="font-semibold text-[#0e5a74]">
                {connectedServicesLabel}
              </span>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <SectionCard title="Platform Status">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-[#d9e1e7] bg-[#fbfcfd] px-4 py-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#0e5a74]">Application</p>
                  <StatusBadge
                    healthy={appHealth?.status === "ok"}
                    label={getStatusLabel(appHealth?.status === "ok")}
                  />
                </div>
                <p className="mt-3 text-sm text-[#1f2a37]/60">
                  Core service used to load and manage activity records.
                </p>
              </div>
              <div className="rounded-xl border border-[#d9e1e7] bg-[#fbfcfd] px-4 py-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#0e5a74]">Data Store</p>
                  <StatusBadge
                    healthy={databaseHealth?.isHealthy}
                    label={getStatusLabel(databaseHealth?.isHealthy)}
                  />
                </div>
                <p className="mt-3 text-sm text-[#1f2a37]/60">
                  Storage services holding the imported activity records.
                </p>
              </div>
              <div className="rounded-xl border border-[#d9e1e7] bg-[#fbfcfd] px-4 py-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#0e5a74]">Explanation Service</p>
                  <StatusBadge
                    healthy={aiHealth?.isHealthy}
                    label={getStatusLabel(aiHealth?.isHealthy)}
                  />
                </div>
                <p className="mt-3 text-sm text-[#1f2a37]/60">
                  Supports log summaries, explanations, and anomaly checks.
                </p>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Activity Snapshot">
            <div className="grid gap-4 md:grid-cols-2">
              <MetricTile
                label="Available Data Sources"
                value={loading ? "Loading..." : datasetSummaries.length}
                hint="Data sources currently available in this workspace."
              />
              <MetricTile
                label="Total Records"
                value={loading ? "Loading..." : totalLogs}
                hint="Combined number of activity records across all sources."
              />
              <MetricTile
                label="Activity Levels"
                value={loading ? "Loading..." : observedLevels.join(", ") || "-"}
                hint="Current level values used across the loaded activity records."
              />
              <MetricTile
                label="Service Status"
                value={loading ? "Loading..." : aiHealth?.status || "-"}
                hint="Shows whether the explanation service is ready to use."
              />
            </div>
          </SectionCard>
        </div>

        <SectionCard title="Data Source Overview">
          {loading ? (
            <p className="text-sm text-[#1f2a37]/50">Loading data source overview...</p>
          ) : datasetSummaries.length === 0 ? (
            <p className="text-sm text-[#1f2a37]/50">
              No data source overview is available right now.
            </p>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              {datasetSummaries.map((summary) => {
                const health = datasetHealth.find(
                  (item) => item.dataset === summary.dataset
                );
                const levelSummary = (summary.levels || [])
                  .map((level) => `${formatLevelDisplay(level.level)} x${level.count}`)
                  .join(", ");

                return (
                  <div
                    key={summary.dataset}
                    className="rounded-[18px] border border-[#d9e1e7] bg-[#fbfcfd] p-5"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#0e5a74]/60">
                          Data Source
                        </p>
                        <h3 className="mt-1 text-xl font-semibold text-[#0e5a74]">
                          {summary.dataset}
                        </h3>
                      </div>
                      <StatusBadge
                        healthy={health?.isAvailable}
                        label={getStatusLabel(
                          health?.isAvailable,
                          "Available",
                          "Missing"
                        )}
                      />
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <MetricTile
                        label="Records"
                        value={summary.totalCount}
                        hint={
                          summary.latestTime
                            ? `Latest activity: ${formatDateTime(summary.latestTime)}`
                            : "No timestamps reported."
                        }
                      />
                      <MetricTile
                        label="Business Areas"
                        value={summary.distinctCategoryCount}
                        hint={summary.topCategory ? `Most active area: ${summary.topCategory}` : "No category data."}
                      />
                      <MetricTile
                        label="Session Activity"
                        value={summary.sessionCount}
                        hint="Records linked to a user session."
                      />
                      <MetricTile
                        label="Delegated Access"
                        value={summary.impersonatedCount}
                        hint="Records involving represented or delegated access."
                      />
                    </div>

                    <div className="mt-4 rounded-xl border border-[#d9e1e7] bg-white px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#0e5a74]/60">
                        Activity Levels
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-[#1f2a37]/70">
                        {levelSummary || "No levels reported."}
                      </p>
                      {summary.levels?.length === 1 ? (
                        <p className="mt-2 text-sm text-[#1f2a37]/55">
                          This source currently uses one level only, so level
                          filtering will be limited in practice.
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </main>
    </div>
  );
}
