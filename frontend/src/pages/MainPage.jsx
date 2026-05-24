import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://127.0.0.1:5005"
).replace(/\/+$/, "");
const API_KEY = import.meta.env.VITE_API_KEY?.trim() || "key-admin-full";
const PAGE_SIZE = 20;

const severityOptions = [
  { label: "All", value: "" },
  { label: "Critical (5)", value: "5" },
  { label: "Error (4)", value: "4" },
  { label: "Warning (3)", value: "3" },
  { label: "Information (2)", value: "2" },
  { label: "Debug (1)", value: "1" },
  { label: "Trace (0)", value: "0" },
];

const levelLabels = {
  0: "Trace",
  1: "Debug",
  2: "Information",
  3: "Warning",
  4: "Error",
  5: "Critical",
};

function buildUrl(path, query = {}) {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  });

  const queryString = params.toString();
  return `${API_BASE_URL}${path}${queryString ? `?${queryString}` : ""}`;
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

async function requestJson(path, query = {}, options = {}) {
  const headers = {
    Accept: "application/json",
    ...options.headers,
  };

  if (API_KEY && !headers["X-Api-Key"]) {
    headers["X-Api-Key"] = API_KEY;
  }

  const response = await fetch(buildUrl(path, query), {
    ...options,
    headers,
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

function getLevelLabel(level) {
  return levelLabels[Number(level)] || `Level ${level}`;
}

function getLevelDisplay(level) {
  const normalizedLevel = String(level ?? "").trim();
  if (!normalizedLevel) {
    return "-";
  }

  return `${getLevelLabel(normalizedLevel)} (${normalizedLevel})`;
}

function getSeverityBadgeClass(level) {
  switch (Number(level)) {
    case 5:
    case 4:
      return "bg-red-100 text-red-600";
    case 3:
      return "bg-orange-100 text-[#e9782e]";
    default:
      return "bg-teal-100 text-[#0e5a74]";
  }
}

function summarizeCategories(items) {
  return [...new Set(items.map((item) => item.category).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right)
  );
}

function countByLevel(items, targetLevel) {
  return items.filter((item) => Number(item.level) === targetLevel).length;
}

export default function MainPage() {
  const [severity, setSeverity] = useState("");
  const [resource, setResource] = useState("");
  const [keyword, setKeyword] = useState("");
  const [datasets, setDatasets] = useState([]);
  const [activeDataset, setActiveDataset] = useState("");
  const [resourceOptions, setResourceOptions] = useState([]);
  const [logs, setLogs] = useState([]);
  const [selectedLogId, setSelectedLogId] = useState(null);
  const [selectedLog, setSelectedLog] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [analysisError, setAnalysisError] = useState("");
  const [userPrompt, setUserPrompt] = useState("");
  const [selectedLogIds, setSelectedLogIds] = useState(new Set());
  const [bulkAnalysis, setBulkAnalysis] = useState(null);
  const [bulkAnalyzing, setBulkAnalyzing] = useState(false);
  const [bulkAnalysisError, setBulkAnalysisError] = useState("");
  const [pageInfo, setPageInfo] = useState({
    skip: 0,
    take: PAGE_SIZE,
    totalCount: 0,
  });
  const [loadingPage, setLoadingPage] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [pageError, setPageError] = useState("");
  const [logsError, setLogsError] = useState("");
  const [detailError, setDetailError] = useState("");
  const selectedLogIdRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    selectedLogIdRef.current = selectedLogId;
  }, [selectedLogId]);

  const clearFilters = () => {
    setSeverity("");
    setResource("");
    setKeyword("");
    setAnalysis(null);
    setAnalysisError("");
    setPageInfo((current) => ({
      ...current,
      skip: 0,
    }));
  };

  const navItems = [
    { label: "Dashboard", path: "/main" },
    { label: "Saved Logs", path: "/saved-logs" },
    { label: "Analysis", path: "/analysis" },
    { label: "Settings", path: "/settings" },
  ];

  useEffect(() => {
    const controller = new AbortController();

    async function loadDatasets() {
      try {
        setLoadingPage(true);
        setPageError("");

        const response = await requestJson("/api/logs/datasets", {}, {
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          return;
        }

        const nextDatasets = response?.datasets || [];
        setDatasets(nextDatasets);
        setActiveDataset(nextDatasets[0] || "");
      } catch (error) {
        if (!controller.signal.aborted) {
          setPageError(error.message || "Unable to connect to the backend.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingPage(false);
        }
      }
    }

    loadDatasets();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!activeDataset) {
      return undefined;
    }

    const controller = new AbortController();

    async function loadLogs() {
      try {
        setLoadingLogs(true);
        setLogsError("");

        const response = await requestJson(
          "/api/logs",
          {
            dataset: activeDataset,
            level: severity,
            category: resource,
            search: keyword.trim(),
            skip: pageInfo.skip,
            take: pageInfo.take,
          },
          { signal: controller.signal }
        );

        if (controller.signal.aborted) {
          return;
        }

        const items = response?.items || [];
        const nextSelectedId = items.some(
          (item) => item.logId === selectedLogIdRef.current
        )
          ? selectedLogIdRef.current
          : items[0]?.logId || null;

        setLogs(items);
        setResourceOptions(summarizeCategories(items));
        setPageInfo((current) => ({
          ...current,
          totalCount: response?.totalCount || 0,
        }));
        selectedLogIdRef.current = nextSelectedId;
        setSelectedLogId(nextSelectedId);
        setSelectedLog((current) =>
          current && current.logId === nextSelectedId
            ? current
            : items.find((item) => item.logId === nextSelectedId) || null
        );
        setDetailError("");
      } catch (error) {
        if (!controller.signal.aborted) {
          setLogsError(error.message || "Unable to load logs.");
          setLogs([]);
          setResourceOptions([]);
          setSelectedLogId(null);
          setSelectedLog(null);
          setPageInfo((current) => ({
            ...current,
            totalCount: 0,
          }));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingLogs(false);
        }
      }
    }

    loadLogs();

    return () => controller.abort();
  }, [activeDataset, severity, resource, keyword, pageInfo.skip, pageInfo.take]);

  useEffect(() => {
    if (!activeDataset || !selectedLogId) {
      return undefined;
    }

    const controller = new AbortController();

    async function loadDetail() {
      try {
        setLoadingDetail(true);
        setDetailError("");

        const response = await requestJson(
          `/api/logs/${selectedLogId}`,
          { dataset: activeDataset },
          { signal: controller.signal }
        );

        if (!controller.signal.aborted) {
          setSelectedLog(response);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setDetailError(error.message || "Unable to load log details.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingDetail(false);
        }
      }
    }

    loadDetail();

    return () => controller.abort();
  }, [activeDataset, selectedLogId]);

  const handleAnalyze = async () => {
    if (!activeDataset || !selectedLogId) {
      return;
    }

    try {
      setAnalyzing(true);
      setAnalysisError("");

      const params = { dataset: activeDataset };
      if (userPrompt.trim()) params.prompt = userPrompt.trim();

      const response = await requestJson(
        `/api/logs/${selectedLogId}/analyze`,
        params,
        { method: "POST" }
      );

      setAnalysis({
        ...response.analysis,
        anomalies: response.analysis?.anomalies || [],
      });
      setSelectedLog(response.log || selectedLog);
    } catch (error) {
      setAnalysis(null);
      setAnalysisError(error.message || "Unable to analyze the selected log.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleBulkAnalyze = async () => {
    if (!activeDataset || selectedLogIds.size === 0) return;
    try {
      setBulkAnalyzing(true);
      setBulkAnalysisError("");
      setBulkAnalysis(null);
      const body = {
        dataset: activeDataset,
        logIds: [...selectedLogIds],
        ...(userPrompt.trim() ? { prompt: userPrompt.trim() } : {}),
      };
      const result = await requestJson(
        "/api/logs/analyze-batch",
        {},
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      );
      setBulkAnalysis(result);
    } catch (error) {
      setBulkAnalysisError(error.message || "Unable to analyze selected logs.");
    } finally {
      setBulkAnalyzing(false);
    }
  };

  const pageCount = Math.max(1, Math.ceil(pageInfo.totalCount / pageInfo.take));
  const currentPage = Math.floor(pageInfo.skip / pageInfo.take) + 1;
  const infoCount = countByLevel(logs, 2);
  const warningCount = countByLevel(logs, 3);
  const errorCount = countByLevel(logs, 4) + countByLevel(logs, 5);
  const hasActiveFilters = severity !== "" || resource.trim() !== "" || keyword.trim() !== "";

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
                item.label === "Dashboard"
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

      <main className="grid grid-cols-1 items-start gap-6 p-8 xl:grid-cols-[320px_1fr_360px]">
        <aside className="overflow-hidden rounded-[18px] border border-[#d9e1e7] bg-white shadow-[0_4px_14px_rgba(14,90,116,0.08)]">
          <div className="border-b border-[#d9e1e7] bg-[#fbfcfd] px-6 py-5">
            <h2 className="text-xl font-semibold text-[#0e5a74]">Filters</h2>
          </div>
          <div className="flex flex-col gap-4 px-6 py-5">
            <div>
              <label className="mb-2 block text-sm font-bold text-[#0e5a74]">
                Severity / Level
              </label>
              <div className="relative">
                <select
                  value={severity}
                  onChange={(event) => {
                    setSeverity(event.target.value);
                    setPageInfo((current) => ({
                      ...current,
                      skip: 0,
                    }));
                  }}
                  className="w-full cursor-pointer appearance-none rounded-lg border border-[#cfd8df] bg-white px-4 py-3 pr-10 text-sm text-[#1f2a37] focus:border-[#0e5a74] focus:outline-none focus:ring-2 focus:ring-[#0e5a74]/10"
                >
                  {severityOptions.map((option) => (
                    <option key={option.label} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[#0e5a74]">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#0e5a74]">
                Resource/System
              </label>
              <div className="relative">
                <select
                  value={resource}
                  onChange={(event) => {
                    setResource(event.target.value);
                    setPageInfo((current) => ({
                      ...current,
                      skip: 0,
                    }));
                  }}
                  className="w-full cursor-pointer appearance-none rounded-lg border border-[#cfd8df] bg-white px-4 py-3 pr-10 text-sm text-[#1f2a37] focus:border-[#0e5a74] focus:outline-none focus:ring-2 focus:ring-[#0e5a74]/10"
                >
                  <option value="">All Resources</option>
                  {resourceOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[#0e5a74]">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#0e5a74]">
                Keyword
              </label>
              <input
                type="text"
                placeholder="Search logs..."
                value={keyword}
                onChange={(event) => {
                  setKeyword(event.target.value);
                  setPageInfo((current) => ({
                    ...current,
                    skip: 0,
                  }));
                }}
                className="w-full rounded-lg border border-[#cfd8df] bg-white px-4 py-3 text-sm text-[#1f2a37] focus:border-[#0e5a74] focus:outline-none focus:ring-2 focus:ring-[#0e5a74]/10"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#0e5a74]">
                Dataset
              </label>
              <select
                value={activeDataset}
                onChange={(e) => {
                  setActiveDataset(e.target.value);
                  setPageInfo((current) => ({ ...current, skip: 0 }));
                }}
                disabled={loadingPage || datasets.length === 0}
                className="w-full rounded-lg border border-[#cfd8df] bg-white px-4 py-3 text-sm text-[#1f2a37] focus:border-[#0e5a74] focus:outline-none focus:ring-2 focus:ring-[#0e5a74]/10 disabled:opacity-50"
              >
                {datasets.map((ds) => (
                  <option key={ds} value={ds}>{ds}</option>
                ))}
              </select>
            </div>

            <button
              onClick={clearFilters}
              className="w-full rounded-lg border border-[#d9e1e7] bg-[#eef3f6] px-4 py-3 text-sm font-medium text-[#0e5a74] transition-colors hover:bg-[#e3ebf0]"
            >
              Clear Filters
            </button>

            {pageError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {pageError}
              </div>
            )}
          </div>
        </aside>

        <section className="flex flex-col gap-5">
          <div className="overflow-hidden rounded-[18px] border border-[#d9e1e7] bg-white shadow-[0_4px_14px_rgba(14,90,116,0.08)]">
            <div className="border-b border-[#d9e1e7] bg-[#fbfcfd] px-6 py-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-[#0e5a74]">Logs</h2>
              {selectedLogIds.size > 0 && (
                <button
                  onClick={handleBulkAnalyze}
                  disabled={bulkAnalyzing}
                  className="rounded-lg px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg, #0e5a74, #e9782e)" }}
                >
                  {bulkAnalyzing ? "Analyzing..." : `Analyze Selected (${selectedLogIds.size})`}
                </button>
              )}
            </div>
            <div className="px-6 py-5">
              <div className="overflow-hidden rounded-xl border border-[#d9e1e7]">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-[#eef3f6]">
                      <th className="w-10 px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          title="Select all visible logs"
                          checked={logs.length > 0 && selectedLogIds.size === logs.length}
                          ref={(el) => {
                            if (el) el.indeterminate = selectedLogIds.size > 0 && selectedLogIds.size < logs.length;
                          }}
                          onChange={(e) =>
                            setSelectedLogIds(e.target.checked ? new Set(logs.map((l) => l.logId)) : new Set())
                          }
                          className="accent-[#0e5a74]"
                        />
                      </th>
                      {["Time", "Resource", "Severity", "Message"].map((header) => (
                        <th
                          key={header}
                          className="px-5 py-3 text-left text-sm font-semibold text-[#0e5a74]"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr
                        key={log.logId}
                        onClick={() => {
                          setSelectedLogId(log.logId);
                          setSelectedLog(log);
                          setAnalysis(null);
                          setAnalysisError("");
                          setBulkAnalysis(null);
                          setBulkAnalysisError("");
                        }}
                        className={`cursor-pointer border-t border-[#e8edf1] transition-colors ${
                          selectedLogId === log.logId
                            ? "bg-orange-50"
                            : "hover:bg-[#f7fafc]"
                        }`}
                      >
                        <td className="w-10 px-3 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedLogIds.has(log.logId)}
                            onChange={(e) =>
                              setSelectedLogIds((prev) => {
                                const next = new Set(prev);
                                e.target.checked ? next.add(log.logId) : next.delete(log.logId);
                                return next;
                              })
                            }
                            className="accent-[#0e5a74]"
                          />
                        </td>
                        <td className="px-5 py-4 text-sm text-[#1f2a37]/75">
                          {formatDateTime(log.time)}
                        </td>
                        <td className="px-5 py-4 text-sm font-medium text-[#1f2a37]">
                          {log.category}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getSeverityBadgeClass(log.level)}`}
                          >
                            {getLevelDisplay(log.level)}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-sm text-[#1f2a37]/75">
                          {log.message}
                        </td>
                      </tr>
                    ))}

                    {!loadingLogs && logs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-5 py-6 text-center text-sm text-[#1f2a37]/40" data-testid="empty-logs">
                          {hasActiveFilters ? (
                            <>
                              No logs match your current filters.{" "}
                              <button onClick={clearFilters} className="underline text-[#0e5a74]">
                                Clear filters
                              </button>
                            </>
                          ) : (
                            "No logs found in this dataset."
                          )}
                        </td>
                      </tr>
                    )}

                    {loadingLogs && (
                      <tr>
                        <td colSpan={4} className="px-5 py-6 text-center text-sm text-[#1f2a37]/40">
                          Loading logs...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {logsError && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {logsError}
                </div>
              )}

              <div className="flex items-center justify-between pt-4 text-sm text-[#1f2a37]/55">
                <button
                  type="button"
                  onClick={() =>
                    setPageInfo((current) => ({
                      ...current,
                      skip: Math.max(0, current.skip - current.take),
                    }))
                  }
                  disabled={pageInfo.skip === 0 || loadingLogs}
                  className="rounded-lg border border-[#d9e1e7] bg-[#f3f7fa] px-3 py-2 text-[#0e5a74] transition-colors hover:bg-[#e3ebf0] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Prev
                </button>
                <span>
                  Page {currentPage} of {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPageInfo((current) => ({
                      ...current,
                      skip: current.skip + current.take,
                    }))
                  }
                  disabled={currentPage >= pageCount || loadingLogs}
                  className="rounded-lg border border-[#d9e1e7] bg-[#f3f7fa] px-3 py-2 text-[#0e5a74] transition-colors hover:bg-[#e3ebf0] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-[18px] border border-[#d9e1e7] bg-white shadow-[0_4px_14px_rgba(14,90,116,0.08)]">
            <div className="border-b border-[#d9e1e7] bg-[#fbfcfd] px-6 py-5">
              <h2 className="text-xl font-semibold text-[#0e5a74]">Selected Log</h2>
            </div>
            <div className="px-6 py-5">
              <div className="overflow-hidden rounded-xl border border-[#d9e1e7]">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-[#eef3f6]">
                      {["Dataset", "Severity", "Main Entity", "Session", "Changes"].map((header) => (
                        <th
                          key={header}
                          className="px-5 py-3 text-left text-sm font-semibold text-[#0e5a74]"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedLog ? (
                      <tr className="border-t border-[#e8edf1]">
                        <td className="px-5 py-4 text-sm text-[#1f2a37]/75">
                          {selectedLog.dataset || activeDataset}
                        </td>
                        <td className="px-5 py-4 text-sm text-[#1f2a37]/75">
                          {getLevelDisplay(selectedLog.level)}
                        </td>
                        <td className="px-5 py-4 text-sm text-[#1f2a37]/75">
                          {selectedLog.mainEntityId || "-"}
                        </td>
                        <td className="px-5 py-4 text-sm text-[#1f2a37]/75">
                          {selectedLog.sessionId || "-"}
                        </td>
                        <td className="px-5 py-4 text-sm text-[#1f2a37]/75">
                          {selectedLog.changes ? selectedLog.changes.length : "-"}
                        </td>
                      </tr>
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-5 py-6 text-center text-sm text-[#1f2a37]/40" data-testid="no-log-selected">
                          Select a log above to view details.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 rounded-xl border border-[#d9e1e7] bg-[#fbfcfd] px-4 py-4">
                <p className="mb-2 text-sm font-semibold text-[#0e5a74]">Message</p>
                <p className="text-sm leading-relaxed text-[#1f2a37]/70">
                  {selectedLog?.message || "No log selected."}
                </p>
              </div>

              {detailError && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {detailError}
                </div>
              )}

              {loadingDetail && (
                <p className="mt-4 text-sm text-[#1f2a37]/45">Loading log details...</p>
              )}
            </div>
          </div>
        </section>

        <aside className="overflow-hidden rounded-[18px] border border-[#d9e1e7] bg-white shadow-[0_4px_14px_rgba(14,90,116,0.08)]">
          <div className="border-b border-[#d9e1e7] bg-[#fbfcfd] px-6 py-5">
            <h2 className="text-xl font-semibold text-[#0e5a74]">Analysis Result</h2>
          </div>
          <div className="px-6 py-5">
            <textarea
              rows={4}
              readOnly
              value={selectedLog?.message || ""}
              placeholder="Select a log to analyze..."
              className="w-full resize-none rounded-lg border border-[#cfd8df] bg-white px-3 py-3 text-sm text-[#1f2a37] focus:border-[#0e5a74] focus:outline-none focus:ring-2 focus:ring-[#0e5a74]/10"
            />
            <textarea
              rows={2}
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              placeholder="Optional: ask a specific question about this log..."
              className="mt-2 w-full resize-none rounded-lg border border-[#cfd8df] bg-[#f9fafb] px-3 py-2 text-sm text-[#1f2a37] placeholder-[#1f2a37]/40 focus:border-[#0e5a74] focus:outline-none focus:ring-2 focus:ring-[#0e5a74]/10"
            />
            <button
              type="button"
              data-testid="analyze-button"
              onClick={handleAnalyze}
              disabled={!selectedLogId || analyzing}
              className="mt-3 w-full rounded-lg px-4 py-3 text-sm font-bold text-white transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #0e5a74, #e9782e)" }}
            >
              {analyzing ? "Analyzing..." : "Analyze Logs"}
            </button>
          </div>

          <div className="border-t border-[#d9e1e7]" />

          <div className="flex flex-col gap-5 px-6 py-5">
            {bulkAnalysisError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {bulkAnalysisError}
              </div>
            )}

            {bulkAnalysis && (
              <div className="rounded-lg border border-[#d9e1e7] bg-[#f4f6f8] px-4 py-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#0e5a74]">
                    Bulk Analysis — {bulkAnalysis.logCount} log(s)
                  </span>
                  <button
                    onClick={() => { setBulkAnalysis(null); setBulkAnalysisError(""); }}
                    className="text-[#1f2a37]/30 hover:text-[#1f2a37]/60 text-sm"
                  >
                    ✕
                  </button>
                </div>
                <p className="text-sm text-[#1f2a37]/80 leading-relaxed">{bulkAnalysis.summary}</p>
                {bulkAnalysis.anomalies?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-[#0e5a74] mb-1">Anomalies</p>
                    <ul className="list-disc pl-4 text-sm text-[#1f2a37]/70 space-y-0.5">
                      {bulkAnalysis.anomalies.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  </div>
                )}
                {bulkAnalysis.pointsOfInterest?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-[#0e5a74] mb-1">Points of Interest</p>
                    <ul className="list-disc pl-4 text-sm text-[#1f2a37]/70 space-y-0.5">
                      {bulkAnalysis.pointsOfInterest.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {analysisError && (
              <div
                data-testid="analysis-error"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
              >
                {analysisError}
              </div>
            )}
            <div>
              <h3 className="mb-2 text-lg font-semibold text-[#0e5a74]">Summary:</h3>
              <p data-testid="analysis-summary" className="text-sm leading-relaxed text-[#1f2a37]/50">
                {analysis?.summary || "-"}
              </p>
            </div>
            <div>
              <h3 className="mb-2 text-lg font-semibold text-[#0e5a74]">Anomalies:</h3>
              <ul className="list-disc pl-5 text-sm leading-relaxed text-[#1f2a37]/50">
                {(analysis?.anomalies?.length
                  ? analysis.anomalies
                  : ["-"]
                ).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            {analysis?.points_of_interest?.length > 0 && (
              <div>
                <h3 className="mb-2 text-lg font-semibold text-[#0e5a74]">Points of Interest:</h3>
                <ul className="list-disc pl-5 text-sm leading-relaxed text-[#1f2a37]/50">
                  {analysis.points_of_interest.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <h3 className="mb-2 text-lg font-semibold text-[#0e5a74]">
                Recommendation:
              </h3>
              <p className="text-sm leading-relaxed text-[#1f2a37]/50">
                {analysis?.explanation || "-"}
              </p>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="text-[#1f2a37]">
                Logs: <strong className="text-[#0e5a74]">{pageInfo.totalCount}</strong>
              </span>
              <span className="text-[#1f2a37]">
                Errors (4-5): <strong className="text-[#0e5a74]">{errorCount}</strong>
              </span>
              <span className="text-[#1f2a37]">
                Warnings (3): <strong className="text-[#0e5a74]">{warningCount}</strong>
              </span>
              <span className="text-[#1f2a37]">
                Information (2): <strong className="text-[#0e5a74]">{infoCount}</strong>
              </span>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
