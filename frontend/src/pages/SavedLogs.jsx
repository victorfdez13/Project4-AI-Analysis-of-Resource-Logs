import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_BACKEND_URL || "http://localhost:5005";

function formatDateGroup(iso) {
  if (!iso) return "Unknown date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown date";
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const long = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  if (sameDay(d, today)) return `Today — ${long}`;
  if (sameDay(d, yest)) return `Yesterday — ${long}`;
  return long;
}

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function logTitle(item) {
  const cat = item?.originalLog?.category || "Log";
  return `${cat} #${item.logId ?? "?"}`;
}

function groupByDate(items) {
  return items.reduce((groups, item) => {
    const key = formatDateGroup(item.analyzedAt);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {});
}

export default function SavedLogs() {
  const navigate = useNavigate();
  const [datasets, setDatasets] = useState([]);
  const [dataset, setDataset] = useState(null);
  const [datasetsError, setDatasetsError] = useState(null);
  const [items, setItems] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);

  const [selectedKey, setSelectedKey] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  const [search, setSearch] = useState("");

  const pickDataset = (d) => {
    if (d === dataset) return;
    setItems([]);
    setSelectedKey(null);
    setDetail(null);
    setDetailError(null);
    setListError(null);
    setListLoading(true);
    setDataset(d);
  };

  const pickLog = (logId) => {
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    setSelectedKey(logId);
  };

  const closeDetail = () => {
    setSelectedKey(null);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(false);
  };

  // Load configured datasets from the backend (FR1)
  useEffect(() => {
    const controller = new AbortController();

    fetch(`${API_BASE}/api/logs/datasets`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} — ${await r.text()}`);
        return r.json();
      })
      .then((data) => {
        const list = Array.isArray(data?.datasets) ? data.datasets : [];
        setDatasets(list);
        setDataset((current) => current ?? list[0] ?? null);
      })
      .catch((err) => {
        if (err.name !== "AbortError")
          setDatasetsError(err.message || String(err));
      });

    return () => controller.abort();
  }, []);

  // SCRUM-36 — load list from /api/saved-logs whenever dataset changes
  useEffect(() => {
    if (!dataset) return;
    const controller = new AbortController();

    fetch(`${API_BASE}/api/saved-logs?dataset=${encodeURIComponent(dataset)}&limit=100`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} — ${await r.text()}`);
        return r.json();
      })
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch((err) => {
        if (err.name !== "AbortError") setListError(err.message || String(err));
      })
      .finally(() => setListLoading(false));

    return () => controller.abort();
  }, [dataset]);

  // SCRUM-37 — load one analysis from /api/saved-logs/{log_id} on click
  useEffect(() => {
    if (selectedKey == null || !dataset) return;
    const controller = new AbortController();

    fetch(
      `${API_BASE}/api/saved-logs/${selectedKey}?dataset=${encodeURIComponent(dataset)}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} — ${await r.text()}`);
        return r.json();
      })
      .then((data) => setDetail(data))
      .catch((err) => {
        if (err.name !== "AbortError") setDetailError(err.message || String(err));
      })
      .finally(() => setDetailLoading(false));

    return () => controller.abort();
  }, [selectedKey, dataset]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((it) => {
      const haystack = [
        String(it.logId ?? ""),
        it.originalLog?.category,
        it.originalLog?.message,
        it.analysis?.summary,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, search]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  const navItems = [
    { label: "Dashboard", path: "/main" },
    { label: "Saved Logs", path: "/saved-logs" },
    { label: "Analysis", path: "/analysis" },
    { label: "Settings", path: "/settings" },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-[#f4f6f8] font-sans">
      {/* Navbar */}
      <nav
        className="px-6 py-3 flex items-center justify-between flex-shrink-0"
        style={{ background: "linear-gradient(135deg, #0e5a74, #0b4a60)" }}
      >
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-[#e9782e]" />
          <span className="text-white font-bold text-sm">Resource</span>
          <span className="text-white/80 text-sm">Logs</span>
        </div>
        <div className="flex gap-6">
          {navItems.map((item) => (
            <span
              key={item.label}
              onClick={() => navigate(item.path)}
              className={`text-sm cursor-pointer font-medium transition-colors ${
                item.label === "Saved Logs"
                  ? "text-white border-b-2 border-[#e9782e] pb-0.5"
                  : "text-white/70 hover:text-white"
              }`}
            >
              {item.label}
            </span>
          ))}
        </div>
        <div className="w-8 h-8 rounded-full bg-[#e9782e] flex items-center justify-center text-white text-xs font-bold">
          VS
        </div>
      </nav>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Log List */}
        <div className="w-80 border-r border-[#d9e1e7] p-5 overflow-y-auto flex-shrink-0 bg-white">
          <h2 className="text-[#0e5a74] text-base font-semibold mb-3">Saved Logs</h2>

          {/* Dataset toggle — populated from GET /api/logs/datasets */}
          {datasetsError ? (
            <div className="text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
              Failed to load datasets: {datasetsError}
            </div>
          ) : datasets.length === 0 ? (
            <p className="text-[#1f2a37]/40 text-xs mb-4">Loading datasets…</p>
          ) : (
            <div className="inline-flex flex-wrap rounded-lg border border-[#d9e1e7] bg-[#f9fafb] p-0.5 mb-4 gap-0.5">
              {datasets.map((d) => (
                <button
                  key={d}
                  onClick={() => pickDataset(d)}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                    dataset === d
                      ? "bg-[#0e5a74] text-white"
                      : "text-[#0e5a74] hover:bg-[#eef3f6]"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          )}

          {/* Search */}
          <input
            type="text"
            placeholder="🔍 Search by id, category, message..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-[#cfd8df] rounded-lg px-4 py-2 text-sm text-[#1f2a37] placeholder-[#1f2a37]/40 focus:outline-none focus:border-[#0e5a74] focus:ring-2 focus:ring-[#0e5a74]/10 mb-4"
          />

          {listLoading && (
            <p className="text-[#1f2a37]/40 text-sm text-center mt-6">Loading…</p>
          )}
          {listError && !listLoading && (
            <div className="text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
              Failed to load: {listError}
            </div>
          )}

          {/* Groups */}
          {!listLoading &&
            !listError &&
            Object.entries(grouped).map(([date, group]) => (
              <div key={date} className="mb-4">
                <p className="text-[#0e5a74]/60 text-[10px] uppercase tracking-widest mb-2 font-semibold">
                  {date}
                </p>
                {group.map((item) => {
                  const isSelected = selectedKey === item.logId;
                  const anomalyCount = item.analysis?.anomalies?.length ?? 0;
                  return (
                    <div
                      key={item._id ?? `${item.dataset}-${item.logId}`}
                      onClick={() => pickLog(item.logId)}
                      className={`rounded-xl px-4 py-3 mb-2 cursor-pointer border transition-all ${
                        isSelected
                          ? "border-[#e9782e] bg-orange-50"
                          : "border-[#d9e1e7] bg-[#f9fafb] hover:bg-[#eef3f6]"
                      }`}
                    >
                      <p className="text-[#1f2a37] text-sm font-semibold mb-1 truncate">
                        {logTitle(item)}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-[#1f2a37]/50 text-xs">
                          {item.dataset} · {shortTime(item.analyzedAt)}
                        </span>
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                            anomalyCount > 0
                              ? "bg-red-100 text-red-600"
                              : "bg-teal-100 text-[#0e5a74]"
                          }`}
                        >
                          {anomalyCount > 0
                            ? `${anomalyCount} anomal${anomalyCount === 1 ? "y" : "ies"}`
                            : "Clean"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

          {!listLoading && !listError && filtered.length === 0 && (
            <p className="text-[#1f2a37]/30 text-sm text-center mt-10">
              No saved logs found.
            </p>
          )}
        </div>

        {/* Detail Panel */}
        <div className="flex-1 p-6 overflow-y-auto">
          {selectedKey == null ? (
            <div className="flex items-center justify-center h-full text-[#1f2a37]/30 text-sm">
              Select a log to view its analysis
            </div>
          ) : detailLoading ? (
            <div className="flex items-center justify-center h-full text-[#1f2a37]/40 text-sm">
              Loading analysis…
            </div>
          ) : detailError ? (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 max-w-3xl">
              <p className="text-red-600 text-sm font-semibold mb-1">
                Could not load analysis
              </p>
              <p className="text-[#1f2a37]/70 text-sm">{detailError}</p>
            </div>
          ) : detail ? (
            <DetailView detail={detail} onClose={closeDetail} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// SCRUM-38 — render summary, explanation, anomalies, related_resources
function DetailView({ detail, onClose }) {
  const original = detail.originalLog || {};
  const analysis = detail.analysis || {};
  const anomalies = analysis.anomalies || [];
  const related = analysis.related_resources || [];

  const rows = [
    { label: "Dataset", value: detail.dataset },
    { label: "Log ID", value: detail.logId },
    { label: "Category", value: original.category || "—" },
    { label: "Level", value: original.level ?? "—" },
    { label: "Logged at", value: formatDateTime(original.time) },
    { label: "Analyzed at", value: formatDateTime(detail.analyzedAt) },
  ];

  return (
    <div className="bg-white border border-[#d9e1e7] rounded-[18px] overflow-hidden shadow-[0_4px_14px_rgba(14,90,116,0.08)] max-w-3xl">
      {/* Header */}
      <div className="px-6 py-5 border-b border-[#d9e1e7] bg-[#fbfcfd] flex items-start justify-between">
        <div>
          <h3 className="text-[#0e5a74] text-lg font-semibold mb-1">
            {(original.category || "Log") + " #" + detail.logId}
          </h3>
          <p className="text-[#1f2a37]/50 text-sm">
            {detail.dataset} · {formatDateTime(detail.analyzedAt)}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-[#1f2a37]/30 hover:text-[#1f2a37]/60 text-lg leading-none mt-1"
        >
          ✕
        </button>
      </div>

      <div className="px-6 py-5">
        {/* Prompt that produced this analysis (US5 / FR5) */}
        <div className="mb-5">
          <p className="text-[10px] uppercase tracking-widest text-[#0e5a74]/60 font-semibold mb-1">
            Prompt
          </p>
          {detail.prompt ? (
            <p className="text-[#1f2a37] text-sm leading-relaxed bg-[#fbfcfd] border border-[#e8edf1] rounded-lg px-4 py-3">
              {detail.prompt}
            </p>
          ) : (
            <p className="text-[#1f2a37]/40 text-sm italic">
              No prompt recorded for this analysis.
            </p>
          )}
        </div>

        {/* Summary */}
        {analysis.summary && (
          <div className="mb-5">
            <p className="text-[10px] uppercase tracking-widest text-[#0e5a74]/60 font-semibold mb-1">
              Summary
            </p>
            <p className="text-[#1f2a37] text-sm leading-relaxed">
              {analysis.summary}
            </p>
          </div>
        )}

        {/* Explanation */}
        {analysis.explanation && (
          <div className="mb-5">
            <p className="text-[10px] uppercase tracking-widest text-[#0e5a74]/60 font-semibold mb-1">
              Explanation
            </p>
            <p className="text-[#1f2a37]/80 text-sm leading-relaxed">
              {analysis.explanation}
            </p>
          </div>
        )}

        {/* Metadata rows */}
        <div className="border-t border-[#e8edf1]">
          {rows.map(({ label, value }) => (
            <div
              key={label}
              className="flex justify-between items-center py-2.5 border-b border-[#e8edf1] text-sm last:border-none"
            >
              <span className="text-[#1f2a37]/50 font-medium">{label}</span>
              <span className="font-semibold text-[#1f2a37]">{String(value)}</span>
            </div>
          ))}
        </div>

        {/* Anomalies */}
        <div className="mt-5">
          <p className="text-[10px] uppercase tracking-widest text-[#0e5a74]/60 font-semibold mb-2">
            Anomalies ({anomalies.length})
          </p>
          {anomalies.length === 0 ? (
            <p className="text-[#1f2a37]/60 text-sm">No anomalies detected.</p>
          ) : (
            <ul className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 space-y-1.5">
              {anomalies.map((a, i) => (
                <li
                  key={i}
                  className="text-red-700 text-sm leading-relaxed flex gap-2"
                >
                  <span className="text-red-500">•</span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Related resources */}
        <div className="mt-5">
          <p className="text-[10px] uppercase tracking-widest text-[#0e5a74]/60 font-semibold mb-2">
            Related resources ({related.length})
          </p>
          {related.length === 0 ? (
            <p className="text-[#1f2a37]/60 text-sm">None.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {related.map((r, i) => (
                <li
                  key={i}
                  className="text-[#0e5a74] bg-[#eef3f6] border border-[#d9e1e7] rounded-full px-3 py-1 text-xs font-mono"
                >
                  {r}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Original log message */}
        {original.message && (
          <div className="mt-5">
            <p className="text-[10px] uppercase tracking-widest text-[#0e5a74]/60 font-semibold mb-2">
              Original message
            </p>
            <pre className="bg-[#f9fafb] border border-[#e8edf1] rounded-lg px-4 py-3 text-xs text-[#1f2a37] whitespace-pre-wrap break-words">
              {original.message}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
