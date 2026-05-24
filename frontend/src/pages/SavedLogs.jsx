import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:5005"
).replace(/\/+$/, "");

const API_KEY = "key-admin-full";

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Accept: "application/json",
      "X-Api-Key": API_KEY,
      ...options.headers,
    },
    ...options,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      payload?.message || payload?.title || `HTTP ${response.status}`
    );
  }

  return payload;
}

export default function SavedLogs() {
  const navigate = useNavigate();

  const [datasets, setDatasets] = useState([]);
  const [activeDataset, setActiveDataset] = useState("");
  const [analyses, setAnalyses] = useState([]);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Load datasets
  useEffect(() => {
    async function loadDatasets() {
      try {
        const response = await requestJson("/api/logs/datasets");
        const list = response?.datasets || [];
        setDatasets(list);
        setActiveDataset(list[0] || "");
      } catch (err) {
        setError(`Failed to load datasets: ${err.message}`);
      }
    }
    loadDatasets();
  }, []);

  // Load analyses when dataset changes
  useEffect(() => {
    if (!activeDataset) return;

    async function loadAnalyses() {
      try {
        setLoading(true);
        setError("");
        const response = await requestJson(
          `/api/logs/analyses?dataset=${encodeURIComponent(activeDataset)}&limit=50`
        );
        const list = response?.analyses || [];
        setAnalyses(list);
        setSelected(list[0] || null);
      } catch (err) {
        setError(`Failed to load analyses: ${err.message}`);
        setAnalyses([]);
        setSelected(null);
      } finally {
        setLoading(false);
      }
    }

    loadAnalyses();
  }, [activeDataset]);

  const filtered = analyses.filter((a) =>
    String(a.logId).includes(search) ||
    a.analysis?.summary?.toLowerCase().includes(search.toLowerCase())
  );

  function handleDownload() {
    if (!selected) return;
    const content = JSON.stringify(selected.analysis, null, 2);
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `log-${selected.logId}-analysis.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#f4f6f8] font-sans">
      <Navbar active="Saved Logs" />

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-80 border-r border-[#d9e1e7] p-5 overflow-y-auto flex-shrink-0 bg-white">
          <h2 className="text-[#0e5a74] text-base font-semibold mb-4">Saved Logs</h2>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Dataset selector */}
          <select
            value={activeDataset}
            onChange={(e) => setActiveDataset(e.target.value)}
            disabled={datasets.length === 0}
            className="w-full mb-3 rounded-lg border border-[#cfd8df] bg-white px-3 py-2 text-sm text-[#1f2a37] focus:border-[#0e5a74] focus:outline-none disabled:opacity-50"
          >
            {datasets.map((ds) => (
              <option key={ds} value={ds}>{ds}</option>
            ))}
          </select>

          {/* Search */}
          <input
            type="text"
            placeholder="🔍 Search by id, category, message..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-[#cfd8df] rounded-lg px-4 py-2 text-sm text-[#1f2a37] placeholder-[#1f2a37]/40 focus:outline-none focus:border-[#0e5a74] focus:ring-2 focus:ring-[#0e5a74]/10 mb-4"
          />

          {loading && (
            <p className="text-sm text-[#1f2a37]/40 text-center mt-6">Loading...</p>
          )}

          {!loading && filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelected(item)}
              className={`rounded-xl px-4 py-3 mb-2 cursor-pointer border transition-all ${
                selected?.id === item.id
                  ? "border-[#e9782e] bg-orange-50"
                  : "border-[#d9e1e7] bg-[#f9fafb] hover:bg-[#eef3f6]"
              }`}
            >
              <p className="text-[#1f2a37] text-sm font-semibold mb-1">
                Log #{item.logId}
              </p>
              <p className="text-[#1f2a37]/50 text-xs truncate">
                {item.analysis?.summary || "No summary"}
              </p>
              <p className="text-[#0e5a74]/50 text-[10px] mt-1">
                {new Date(item.analyzedAt).toLocaleString()}
              </p>
            </div>
          ))}

          {!loading && filtered.length === 0 && !error && (
            <p className="text-[#1f2a37]/30 text-sm text-center mt-10">
              {analyses.length === 0
                ? "No saved analyses yet. Analyze a log from the Dashboard first."
                : "No results found."}
            </p>
          )}
        </div>

        {/* Detail Panel */}
        <div className="flex-1 p-6 overflow-y-auto">
          {selected ? (
            <div className="bg-white border border-[#d9e1e7] rounded-[18px] overflow-hidden shadow-[0_4px_14px_rgba(14,90,116,0.08)] max-w-3xl">
              <div className="px-6 py-5 border-b border-[#d9e1e7] bg-[#fbfcfd] flex items-start justify-between">
                <div>
                  <h3 className="text-[#0e5a74] text-lg font-semibold mb-1">
                    Log #{selected.logId}
                  </h3>
                  <p className="text-[#1f2a37]/50 text-sm">
                    {selected.dataset} · Analyzed{" "}
                    {new Date(selected.analyzedAt).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="text-[#1f2a37]/30 hover:text-[#1f2a37]/60 text-lg leading-none mt-1"
                >
                  ✕
                </button>
              </div>

              <div className="px-6 py-5 flex flex-col gap-5">
                {selected.prompt && (
                  <div className="rounded-lg border border-[#d9e1e7] bg-[#f4f6f8] px-4 py-3">
                    <h4 className="text-xs font-semibold text-[#0e5a74]/70 uppercase tracking-wide mb-1">Prompt used</h4>
                    <p className="text-sm text-[#1f2a37]/70 italic">{selected.prompt}</p>
                  </div>
                )}
                <div>
                  <h4 className="text-sm font-semibold text-[#0e5a74] mb-1">Summary</h4>
                  <p className="text-sm text-[#1f2a37]/70 leading-relaxed">
                    {selected.analysis?.summary || "-"}
                  </p>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-[#0e5a74] mb-1">Explanation</h4>
                  <p className="text-sm text-[#1f2a37]/70 leading-relaxed">
                    {selected.analysis?.explanation || "-"}
                  </p>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-[#0e5a74] mb-2">Anomalies</h4>
                  {selected.analysis?.anomalies?.length > 0 ? (
                    <ul className="list-disc pl-5 text-sm text-[#1f2a37]/70 space-y-1">
                      {selected.analysis.anomalies.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-[#1f2a37]/40">None detected</p>
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-[#0e5a74] mb-2">Related Resources</h4>
                  {selected.analysis?.relatedResources?.length > 0 ? (
                    <ul className="list-disc pl-5 text-sm text-[#1f2a37]/70 space-y-1">
                      {selected.analysis.relatedResources.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-[#1f2a37]/40">None</p>
                  )}
                </div>

                <div className="flex gap-3 mt-2">
                  <button
                    onClick={handleDownload}
                    className="px-5 py-2.5 rounded-lg bg-[#eef3f6] text-[#0e5a74] border border-[#d9e1e7] text-sm font-semibold hover:bg-[#e3ebf0] transition-colors"
                  >
                    Download
                  </button>
                  <button
                    onClick={() => navigate("/analysis")}
                    className="px-5 py-2.5 rounded-lg bg-[#e9782e] text-white text-sm font-bold hover:bg-[#d4691f] transition-colors"
                  >
                    View Analysis
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-[#1f2a37]/30 text-sm">
              Select a log to view its analysis
            </div>
          )}
        </div>
      </div>
    </div>
  );
}