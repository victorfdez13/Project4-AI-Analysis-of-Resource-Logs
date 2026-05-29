import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import { requestJson } from "../apiClient";

// Parse "log:DATASET1:5" → { dataset: "DATASET1", logId: 5 } or null
function parseLogResource(resource) {
  const match = resource?.match(/^log:([^:]+):(\d+)$/);
  if (!match) return null;
  return { dataset: match[1], logId: Number(match[2]) };
}

const severityOptions = [
  { label: "All", value: "" },
  { label: "Critical (5)", value: "5" },
  { label: "Error (4)", value: "4" },
  { label: "Warning (3)", value: "3" },
  { label: "Information (2)", value: "2" },
  { label: "Debug (1)", value: "1" },
  { label: "Trace (0)", value: "0" },
];

export default function SavedLogs() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [datasets, setDatasets] = useState([]);
  const [activeDataset, setActiveDataset] = useState("");
  const [analyses, setAnalyses] = useState([]);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("");
  const [resource, setResource] = useState("");
  const [resourceOptions, setResourceOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatSessionId, setChatSessionId] = useState("");
  const [chatting, setChatting] = useState(false);
  const [chatError, setChatError] = useState("");

  function buildChatPrompt(item, prompt) {
    const anchorLog = item?.selectedLogs?.[0];
    const anomalies = item?.analysis?.anomalies || [];
    const relatedResources =
      item?.analysis?.relatedResources || item?.analysis?.related_resources || [];

    return [
      `You are helping with saved log ${item?.logId} from dataset ${item?.dataset}.`,
      anchorLog?.category ? `Category: ${anchorLog.category}` : null,
      anchorLog?.message ? `Log message: ${anchorLog.message}` : null,
      item?.analysis?.summary ? `Saved summary: ${item.analysis.summary}` : null,
      item?.analysis?.explanation ? `Saved explanation: ${item.analysis.explanation}` : null,
      anomalies.length > 0 ? `Detected anomalies: ${anomalies.join("; ")}` : null,
      relatedResources.length > 0 ? `Related resources: ${relatedResources.join(", ")}` : null,
      item?.prompt ? `Previous prompt: ${item.prompt}` : null,
      `User question: ${prompt.trim()}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  async function loadAnalysesForDataset(
    datasetToLoad,
    preferredId,
    preferredLogId = null,
    preferredPrompt = null
  ) {
    if (!datasetToLoad) return [];

    try {
      setLoading(true);
      setError("");
      const response = await requestJson("/api/logs/analyses", {
        dataset: datasetToLoad,
        limit: 50,
      });
      const list = response?.analyses || [];
      setAnalyses(list);

      const categories = [...new Set(
        list.map((a) => a.selectedLogs?.[0]?.category).filter(Boolean)
      )].sort();
      setResourceOptions(categories);

      const idFromUrl = preferredId === undefined ? searchParams.get("id") : preferredId;
      let nextSelected = null;

      if (idFromUrl) {
        nextSelected = list.find(
          (a) => a.analysisId === idFromUrl || a.id === idFromUrl
        ) || null;
      }

      if (!nextSelected && preferredLogId !== null) {
        nextSelected = list.find((a) => (
          a.logId === preferredLogId &&
          (preferredPrompt === null || (a.prompt || "") === preferredPrompt)
        )) || null;
      }

      nextSelected = nextSelected || list[0] || null;
      setSelected(nextSelected);

      const nextId = nextSelected?.analysisId || nextSelected?.id;
      if (nextId) {
        setSearchParams({ id: nextId });
      } else {
        setSearchParams({});
      }

      return list;
    } catch (err) {
      setError(`Failed to load analyses: ${err.message}`);
      setAnalyses([]);
      setSelected(null);
      return [];
    } finally {
      setLoading(false);
    }
  }

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
    loadAnalysesForDataset(activeDataset);
  }, [activeDataset]);

  useEffect(() => {
    setChatInput("");
    setChatMessages([]);
    setChatSessionId("");
    setChatError("");
    setShowChatModal(false);
  }, [selected?.analysisId, selected?.id, selected?.prompt]);

  // Update URL when selected changes
  function selectAnalysis(item) {
    setSelected(item);
    const id = item?.analysisId || item?.id;
    if (id) {
      setSearchParams({ id });
    } else {
      setSearchParams({});
    }
  }

  const filtered = analyses.filter((a) => {
    const anchorLog = a.selectedLogs?.[0];
    const matchesSeverity = !severity || String(anchorLog?.level) === severity;
    const matchesResource = !resource || anchorLog?.category === resource;
    const matchesSearch =
      String(a.logId).includes(search) ||
      (a.analysis?.summary || "").toLowerCase().includes(search.toLowerCase());
    return matchesSeverity && matchesResource && matchesSearch;
  });

  const clearFilters = () => {
    setSearch("");
    setSeverity("");
    setResource("");
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

  function handleCopyLink() {
    const id = selected?.analysisId || selected?.id;
    if (!id) return;
    const url = `${window.location.origin}/saved-logs?id=${id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }).catch(() => {
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  }

  async function handleChatSubmit() {
    if (!selected || !chatInput.trim()) return;

    const userText = chatInput.trim();
    const outgoingPrompt = chatSessionId
      ? userText
      : buildChatPrompt(selected, userText);

    try {
      setChatting(true);
      setChatError("");
      setChatMessages((current) => [
        ...current,
        { role: "user", content: userText },
      ]);
      setChatInput("");

      const response = await requestJson(
        "/api/logs/chat",
        {},
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: chatSessionId || null,
            prompt: outgoingPrompt,
          }),
        }
      );

      setChatSessionId(response.session_id || response.sessionId || "");
      setChatMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: response.response || "No response was returned.",
        },
      ]);
    } catch (err) {
      setChatMessages((current) => current.slice(0, Math.max(0, current.length - 1)));
      setChatInput(userText);
      setChatError(err.message || "Unable to get a response right now.");
    } finally {
      setChatting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f4f6f8] font-sans text-[#1f2a37]">
      <Navbar active="Saved Logs" />

      {showChatModal && selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4"
          onClick={() => setShowChatModal(false)}
        >
          <div
            className="relative flex w-full max-w-3xl flex-col overflow-hidden rounded-[20px] bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-[#d9e1e7] bg-[#fbfcfd] px-6 py-5">
              <div>
                <h2 className="text-xl font-semibold text-[#0e5a74]">Ollama Chat</h2>
                <p className="mt-1 text-sm text-[#1f2a37]/55">
                  Chat about log #{selected.logId} in {selected.dataset}.
                </p>
              </div>
              <button
                onClick={() => setShowChatModal(false)}
                className="text-2xl leading-none text-[#1f2a37]/30 hover:text-[#1f2a37]/70"
              >
                ×
              </button>
            </div>

            <div className="border-b border-[#d9e1e7] bg-[#fff7f2] px-6 py-4 text-sm text-[#1f2a37]/70">
              Follow-up questions stay tied to the selected saved log while this chat is open.
            </div>

            <div className="flex max-h-[55vh] flex-col gap-4 overflow-y-auto bg-[#f8fafb] px-6 py-5">
              {chatMessages.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#d9e1e7] bg-white px-4 py-5 text-sm text-[#1f2a37]/55">
                  Start the conversation with a follow-up question about this saved log.
                </div>
              ) : (
                chatMessages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                      message.role === "user"
                        ? "ml-auto bg-[#0e5a74] text-white"
                        : "border border-[#d9e1e7] bg-white text-[#1f2a37]/80"
                    }`}
                  >
                    {message.content}
                  </div>
                ))
              )}

              {chatting && (
                <div className="max-w-[85%] rounded-2xl border border-[#d9e1e7] bg-white px-4 py-3 text-sm text-[#1f2a37]/55 shadow-sm">
                  Getting Ollama response...
                </div>
              )}
            </div>

            <div className="border-t border-[#d9e1e7] bg-white px-6 py-5">
              {chatError && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                  {chatError}
                </div>
              )}
              <div className="flex gap-3">
                <textarea
                  rows={3}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleChatSubmit();
                    }
                  }}
                  placeholder="Ask a follow-up about this log..."
                  className="flex-1 resize-none rounded-xl border border-[#cfd8df] bg-[#fbfcfd] px-4 py-3 text-sm text-[#1f2a37] placeholder-[#1f2a37]/40 focus:border-[#e9782e] focus:outline-none focus:ring-2 focus:ring-[#e9782e]/10"
                />
                <button
                  onClick={() => void handleChatSubmit()}
                  disabled={chatting || !chatInput.trim()}
                  className="self-end rounded-xl bg-[#e9782e] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#d4691f] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full Analysis Modal */}
      {showModal && selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-[18px] bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#d9e1e7] bg-[#fbfcfd] px-6 py-5">
              <div>
                <h2 className="text-xl font-semibold text-[#0e5a74]">Full Analysis</h2>
                <p className="mt-0.5 text-sm text-[#1f2a37]/50">
                  Log #{selected.logId} · {selected.dataset} · {new Date(selected.analyzedAt).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-2xl leading-none text-[#1f2a37]/30 hover:text-[#1f2a37]/70"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-col gap-6 px-6 py-6">
              {selected.prompt && (
                <div>
                  <h3 className="mb-1 text-sm font-semibold text-[#0e5a74]">Prompt Used</h3>
                  <p className="text-sm text-[#1f2a37]/60 italic">"{selected.prompt}"</p>
                </div>
              )}
              <div>
                <h3 className="mb-2 text-base font-semibold text-[#0e5a74]">Summary</h3>
                <p className="text-sm leading-relaxed text-[#1f2a37]/70">{selected.analysis?.summary || "-"}</p>
              </div>
              <div>
                <h3 className="mb-2 text-base font-semibold text-[#0e5a74]">Explanation</h3>
                <p className="text-sm leading-relaxed text-[#1f2a37]/70">{selected.analysis?.explanation || "-"}</p>
              </div>
              <div>
                <h3 className="mb-2 text-base font-semibold text-[#0e5a74]">Anomalies</h3>
                {selected.analysis?.anomalies?.length > 0 ? (
                  <ul className="list-disc pl-5 space-y-1 text-sm text-[#1f2a37]/70">
                    {selected.analysis.anomalies.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                ) : (
                  <p className="text-sm text-[#1f2a37]/40">None detected</p>
                )}
              </div>
              {(selected.analysis?.pointsOfInterest || selected.analysis?.points_of_interest || []).length > 0 && (
                <div>
                  <h3 className="mb-2 text-base font-semibold text-[#0e5a74]">Points of Interest</h3>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-[#1f2a37]/70">
                    {(selected.analysis?.pointsOfInterest || selected.analysis?.points_of_interest || []).map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                </div>
              )}
              {(selected.analysis?.relatedResources || selected.analysis?.related_resources || []).length > 0 && (
                <div>
                  <h3 className="mb-2 text-base font-semibold text-[#0e5a74]">Related Resources</h3>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-[#1f2a37]/70">
                    {(selected.analysis?.relatedResources || selected.analysis?.related_resources || []).map((item, i) => {
                      const parsed = parseLogResource(item);
                      return (
                        <li key={i}>
                          {parsed ? (
                            <button
                              onClick={() => {
                                setShowModal(false);
                                navigate(`/main?dataset=${parsed.dataset}&logId=${parsed.logId}`);
                              }}
                              className="text-[#0e5a74] underline underline-offset-2 hover:text-[#e9782e] transition-colors"
                            >
                              {item}
                            </button>
                          ) : (
                            item
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
            <div className="sticky bottom-0 flex justify-end border-t border-[#d9e1e7] bg-[#fbfcfd] px-6 py-4">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg border border-[#d9e1e7] bg-white px-5 py-2.5 text-sm font-semibold text-[#0e5a74] transition-colors hover:bg-[#eef3f6]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="grid grid-cols-1 items-start gap-6 p-8 xl:grid-cols-[320px_1fr_360px]">

        {/* Filter Panel */}
        <aside className="overflow-hidden rounded-[18px] border border-[#d9e1e7] bg-white shadow-[0_4px_14px_rgba(14,90,116,0.08)]">
          <div className="border-b border-[#d9e1e7] bg-[#fbfcfd] px-6 py-5">
            <h2 className="text-xl font-semibold text-[#0e5a74]">Filters</h2>
          </div>
          <div className="flex flex-col gap-4 px-6 py-5">

            {/* Severity */}
            <div>
              <label className="mb-2 block text-sm font-bold text-[#0e5a74]">Severity / Level</label>
              <div className="relative">
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                  className="w-full cursor-pointer appearance-none rounded-lg border border-[#cfd8df] bg-white px-4 py-3 pr-10 text-sm text-[#1f2a37] focus:border-[#0e5a74] focus:outline-none focus:ring-2 focus:ring-[#0e5a74]/10"
                >
                  {severityOptions.map((option) => (
                    <option key={option.label} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[#0e5a74]">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Resource */}
            <div>
              <label className="mb-2 block text-sm font-bold text-[#0e5a74]">Resource/System</label>
              <div className="relative">
                <select
                  value={resource}
                  onChange={(e) => setResource(e.target.value)}
                  className="w-full cursor-pointer appearance-none rounded-lg border border-[#cfd8df] bg-white px-4 py-3 pr-10 text-sm text-[#1f2a37] focus:border-[#0e5a74] focus:outline-none focus:ring-2 focus:ring-[#0e5a74]/10"
                >
                  <option value="">All Resources</option>
                  {resourceOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[#0e5a74]">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Keyword */}
            <div>
              <label className="mb-2 block text-sm font-bold text-[#0e5a74]">Keyword</label>
              <input
                type="text"
                placeholder="Search by log ID or summary..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-[#cfd8df] bg-white px-4 py-3 text-sm text-[#1f2a37] focus:border-[#0e5a74] focus:outline-none focus:ring-2 focus:ring-[#0e5a74]/10"
              />
            </div>

            {/* Dataset */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-bold text-[#0e5a74]">Dataset</label>
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
                    key={item.analysisId || item.id}
                    onClick={() => selectAnalysis(item)}
                    className={`cursor-pointer rounded-xl border px-4 py-3 transition-all ${
                      (selected?.analysisId || selected?.id) === (item.analysisId || item.id)
                        ? "border-[#e9782e] bg-orange-50"
                        : "border-[#d9e1e7] bg-[#f9fafb] hover:bg-[#eef3f6]"
                    }`}
                  >
                    <p className="text-[#1f2a37] text-sm font-semibold mb-1">Log #{item.logId}</p>
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
                onClick={() => { setSelected(null); setSearchParams({}); }}
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
                  {selected.dataset} | Analyzed {new Date(selected.analyzedAt).toLocaleString()}
                </p>

                {selected.prompt && (
                  <div className="rounded-lg border border-[#d9e1e7] bg-[#f4f6f8] px-4 py-3">
                    <h4 className="text-xs font-semibold text-[#0e5a74]/70 uppercase tracking-wide mb-1">Prompt used</h4>
                    <p className="text-sm text-[#1f2a37]/70 italic">{selected.prompt}</p>
                  </div>
                )}

                <div className="rounded-xl border border-[#f3d3bc] bg-[#fff7f2] px-4 py-4">
                  <div className="flex flex-col gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-[#b95d1d]">Open Ollama chat</h4>
                      <p className="mt-1 text-xs leading-relaxed text-[#1f2a37]/60">
                        Open a popup chat to ask follow-up questions about this saved log.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setShowChatModal(true);
                        setChatError("");
                      }}
                      className="rounded-lg bg-[#e9782e] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#d4691f] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Open Ollama chat
                    </button>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-[#0e5a74] mb-1">Summary</h4>
                  <p className="text-sm text-[#1f2a37]/70 leading-relaxed">{selected.analysis?.summary || "-"}</p>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-[#0e5a74] mb-1">Explanation</h4>
                  <p className="text-sm text-[#1f2a37]/70 leading-relaxed">{selected.analysis?.explanation || "-"}</p>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-[#0e5a74] mb-2">Anomalies</h4>
                  {selected.analysis?.anomalies?.length > 0 ? (
                    <ul className="list-disc pl-5 text-sm text-[#1f2a37]/70 space-y-1">
                      {selected.analysis.anomalies.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  ) : (
                    <p className="text-sm text-[#1f2a37]/40">None detected</p>
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-[#0e5a74] mb-2">Related Resources</h4>
                  {(selected.analysis?.relatedResources || selected.analysis?.related_resources || []).length > 0 ? (
                    <ul className="list-disc pl-5 text-sm text-[#1f2a37]/70 space-y-1">
                      {(selected.analysis?.relatedResources || selected.analysis?.related_resources || []).map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  ) : (
                    <p className="text-sm text-[#1f2a37]/40">None</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-3 pt-1">
                  <button
                    onClick={handleDownload}
                    className="px-5 py-2.5 rounded-lg bg-[#eef3f6] text-[#0e5a74] border border-[#d9e1e7] text-sm font-semibold hover:bg-[#e3ebf0] transition-colors"
                  >
                    Download
                  </button>
                  <button
                    onClick={() => setShowModal(true)}
                    className="px-5 py-2.5 rounded-lg bg-[#e9782e] text-white text-sm font-bold hover:bg-[#d4691f] transition-colors"
                  >
                    View Analysis
                  </button>
                  <button
                    onClick={handleCopyLink}
                    className="px-5 py-2.5 rounded-lg bg-[#eef3f6] text-[#0e5a74] border border-[#d9e1e7] text-sm font-semibold hover:bg-[#e3ebf0] transition-colors"
                  >
                    {copySuccess ? "✓ Copied!" : "Copy Link"}
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
