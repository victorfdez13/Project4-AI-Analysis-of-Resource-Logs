import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { requestJson } from "../apiClient";

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
        const response = await requestJson("/api/logs/analyses", {
          dataset: activeDataset,
          limit: 50,
        });
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

  const filtered = analyses.filter(
    (a) =>
      String(a.logId).includes(search) ||
      (a.analysis?.summary || "").toLowerCase().includes(search.toLowerCase())
  );

  const clearFilters = () => {
    setSearch("");
    setActiveDataset(datasets[0] || "");
  };

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
    <div className="min-h-screen bg-[#f4f6f8] font-sans text-[#1f2a37]">
      <Navbar active="Saved Logs" />

      <main className="grid grid-cols-1 items-start gap-6 p-8 xl:grid-cols-[320px_1fr_360px]">

        {/* Filter Panel */}
        <aside className="overflow-hidden rounded-[18px] border border-[#d9e1e7] bg-white shadow-[0_4px_14px_rgba(14,90,116,0.08)]">
          <div className="border-b border-[#d9e1e7] bg-[#fbfcfd] px-6 py-5">
            <h2 className="text-xl font-semibold text-[#0e5a74]">Filters</h2>
          </div>
          <div className="flex flex-col gap-4 px-6 py-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-bold text-[#0e5a74]">
                Dataset
              </label>
              <div className="relative">
                <select
                  value={activeDataset}
                  onChange={(e) => setActiveDataset(e.target.value)}
                  disabled={datasets.length === 0}
                  className="w-full cursor-pointer appearance-none rounded-lg border border-[#cfd8df] bg-white px-4 py-3 pr-10 text-sm text-[#1f2a37] focus:border-[#0e5a74] focus:outline-none focus:ring-2 focus:ring-[#0e5a74]/10 disabled:opacity-50"
                >
                  {datasets.map((ds) => (
                    <option key={ds} value={ds}>{ds}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[#0e5a74]">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
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
                placeholder="Search by log ID or summary..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-[#cfd8df] bg-white px-4 py-3 text-sm text-[#1f2a37] focus:border-[#0e5a74] focus:outline-none focus:ring-2 focus:ring-[#0e5a74]/10"
              />
            </div>

            <button
              onClick={clearFilters}
              className="w-full rounded-lg border border-[#d9e1e7] bg-[#eef3f6] px-4 py-3 text-sm font-medium text-[#0e5a74] transition-colors hover:bg-[#e3ebf0]"
            >
              Clear Filters
            </button>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}
          </div>
        </aside>

        {/* Saved Analyses List */}
        <section className="overflow-hidden rounded-[18px] border border-[#d9e1e7] bg-white shadow-[0_4px_14px_rgba(14,90,116,0.08)]">
          <div className="border-b border-[#d9e1e7] bg-[#fbfcfd] px-6 py-5 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-[#0e5a74]">Saved Analyses</h2>
            {!loading && filtered.length > 0 && (
              <span className="rounded-full bg-[#eef3f6] px-3 py-1 text-xs font-semibold text-[#0e5a74]">
                {filtered.length}
              </span>
            )}
          </div>
          <div className="px-6 py-5">
            {loading && (
              <p className="text-sm text-[#1f2a37]/40 text-center py-10">Loading...</p>
            )}

            {!loading && filtered.length === 0 && !error && (
              <p className="text-sm text-[#1f2a37]/30 text-center py-10">
                {analyses.length === 0
                  ? "No saved analyses yet. Analyze a log from the Dashboard first."
                  : "No results match your filters."}
              </p>
            )}

            {!loading && (
              <div className="flex flex-col gap-2">
                {filtered.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setSelected(item)}
                    className={`cursor-pointer rounded-xl border px-4 py-3 transition-all ${
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
              </div>
            )}
          </div>
        </section>

        {/* Analysis Detail Panel */}
        <aside className="overflow-hidden rounded-[18px] border border-[#d9e1e7] bg-white shadow-[0_4px_14px_rgba(14,90,116,0.08)]">
          <div className="border-b border-[#d9e1e7] bg-[#fbfcfd] px-6 py-5 flex items-start justify-between">
            <h2 className="text-xl font-semibold text-[#0e5a74]">
              {selected ? `Log #${selected.logId}` : "Analysis Detail"}
            </h2>
            {selected && (
              <button
                onClick={() => setSelected(null)}
                className="text-[#1f2a37]/30 hover:text-[#1f2a37]/60 text-lg leading-none mt-0.5"
              >
                x
              </button>
            )}
          </div>

          <div className="px-6 py-5">
            {selected ? (
              <div className="flex flex-col gap-5">
                <p className="text-[#1f2a37]/50 text-sm">
                  {selected.dataset} | Analyzed{" "}
                  {new Date(selected.analyzedAt).toLocaleString()}
                </p>

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
                  {(selected.analysis?.related_resources || selected.analysis?.relatedResources || []).length > 0 ? (
                    <ul className="list-disc pl-5 text-sm text-[#1f2a37]/70 space-y-1">
                      {(selected.analysis?.related_resources || selected.analysis?.relatedResources || []).map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-[#1f2a37]/40">None</p>
                  )}
                </div>

                <div className="flex gap-3 pt-1">
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
            ) : (
              <p className="text-sm text-[#1f2a37]/30 text-center py-10">
                Select an analysis to view details
              </p>
            )}
          </div>
        </aside>

      </main>
    </div>
  );
}
