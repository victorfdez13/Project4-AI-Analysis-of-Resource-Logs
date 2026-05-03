import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function MainPage() {
  const [severity, setSeverity] = useState("All");
  const [resource, setResource] = useState("All Resources");
  const [keyword, setKeyword] = useState("");
  const navigate = useNavigate();

  const clearFilters = () => {
    setSeverity("All");
    setResource("All Resources");
    setKeyword("");
  };

  const navItems = [
    { label: "Dashboard", path: "/main" },
    { label: "Saved Logs", path: "/saved-logs" },
    { label: "Analysis", path: "/analysis" },
    { label: "Settings", path: "/settings" },
  ];

  return (
    <div className="min-h-screen bg-[#f4f6f8] text-[#1f2a37] font-sans">
      {/* Navbar */}
      <nav
        className="px-6 py-3 flex items-center justify-between"
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
                item.label === "Dashboard"
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

      {/* Dashboard Grid */}
      <main className="grid grid-cols-1 xl:grid-cols-[320px_1fr_360px] gap-6 p-8 items-start">

        {/* Filters Panel */}
        <aside className="bg-white border border-[#d9e1e7] rounded-[18px] overflow-hidden shadow-[0_4px_14px_rgba(14,90,116,0.08)]">
          <div className="px-6 py-5 border-b border-[#d9e1e7] bg-[#fbfcfd]">
            <h2 className="text-[#0e5a74] text-xl font-semibold">Filters</h2>
          </div>
          <div className="px-6 py-5 flex flex-col gap-4">

            {/* Severity */}
            <div>
              <label className="block text-[#0e5a74] font-bold text-sm mb-2">Severity</label>
              <div className="relative">
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                  className="w-full px-4 py-3 border border-[#cfd8df] rounded-lg text-sm text-[#1f2a37] bg-white focus:outline-none focus:border-[#0e5a74] focus:ring-2 focus:ring-[#0e5a74]/10 appearance-none cursor-pointer pr-10"
                >
                  <option>All</option>
                  <option>Error</option>
                  <option>Warning</option>
                  <option>Info</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[#0e5a74]">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Resource/System */}
            <div>
              <label className="block text-[#0e5a74] font-bold text-sm mb-2">Resource/System</label>
              <div className="relative">
                <select
                  value={resource}
                  onChange={(e) => setResource(e.target.value)}
                  className="w-full px-4 py-3 border border-[#cfd8df] rounded-lg text-sm text-[#1f2a37] bg-white focus:outline-none focus:border-[#0e5a74] focus:ring-2 focus:ring-[#0e5a74]/10 appearance-none cursor-pointer pr-10"
                >
                  <option>All Resources</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[#0e5a74]">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Keyword */}
            <div>
              <label className="block text-[#0e5a74] font-bold text-sm mb-2">Keyword</label>
              <input
                type="text"
                placeholder="Search logs..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="w-full px-4 py-3 border border-[#cfd8df] rounded-lg text-sm bg-white text-[#1f2a37] focus:outline-none focus:border-[#0e5a74] focus:ring-2 focus:ring-[#0e5a74]/10"
              />
            </div>

            <button
              onClick={clearFilters}
              className="w-full py-3 px-4 bg-[#eef3f6] text-[#0e5a74] border border-[#d9e1e7] rounded-lg text-sm font-medium hover:bg-[#e3ebf0] transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </aside>

        {/* Center Column */}
        <section className="flex flex-col gap-5">
          {/* Logs Table 1 */}
          <div className="bg-white border border-[#d9e1e7] rounded-[18px] overflow-hidden shadow-[0_4px_14px_rgba(14,90,116,0.08)]">
            <div className="px-6 py-5 border-b border-[#d9e1e7] bg-[#fbfcfd]">
              <h2 className="text-[#0e5a74] text-xl font-semibold">Logs</h2>
            </div>
            <div className="px-6 py-5">
              <div className="border border-[#d9e1e7] rounded-xl overflow-hidden">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-[#eef3f6]">
                      {["Time", "Resource", "Severity", "Message"].map((h) => (
                        <th key={h} className="text-left px-5 py-3 text-sm font-semibold text-[#0e5a74]">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={4} className="px-5 py-6 text-center text-sm text-[#1f2a37]/40">
                        No logs to display.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="flex justify-center items-center gap-2 pt-4">
                <button className="w-8 h-8 border border-[#d9e1e7] rounded-lg bg-[#f3f7fa] text-[#0e5a74] text-sm hover:bg-[#e3ebf0] transition-colors">‹</button>
                <span className="w-2.5 h-2.5 rounded-full bg-[#e9782e] inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#c6d4dd] inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#c6d4dd] inline-block" />
              </div>
            </div>
          </div>

          {/* Logs Table 2 */}
          <div className="bg-white border border-[#d9e1e7] rounded-[18px] overflow-hidden shadow-[0_4px_14px_rgba(14,90,116,0.08)]">
            <div className="px-6 py-5 border-b border-[#d9e1e7] bg-[#fbfcfd]">
              <h2 className="text-[#0e5a74] text-xl font-semibold">Logs</h2>
            </div>
            <div className="px-6 py-5">
              <div className="border border-[#d9e1e7] rounded-xl overflow-hidden">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-[#eef3f6]">
                      {["Time", "Resource", "Severity", "Message"].map((h) => (
                        <th key={h} className="text-left px-5 py-3 text-sm font-semibold text-[#0e5a74]">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={4} className="px-5 py-6 text-center text-sm text-[#1f2a37]/40">
                        No logs to display.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* Analysis Panel */}
        <aside className="bg-white border border-[#d9e1e7] rounded-[18px] overflow-hidden shadow-[0_4px_14px_rgba(14,90,116,0.08)]">
          <div className="px-6 py-5 border-b border-[#d9e1e7] bg-[#fbfcfd]">
            <h2 className="text-[#0e5a74] text-xl font-semibold">Analysis Result</h2>
          </div>
          <div className="px-6 py-5">
            <textarea
              rows={5}
              placeholder="Describe the issues found and potential causes..."
              className="w-full px-3 py-3 border border-[#cfd8df] rounded-lg text-sm bg-white text-[#1f2a37] resize-none focus:outline-none focus:border-[#0e5a74] focus:ring-2 focus:ring-[#0e5a74]/10"
            />
            <button
              className="w-full mt-3 py-3 px-4 rounded-lg text-white font-bold text-sm hover:opacity-95 transition-opacity"
              style={{ background: "linear-gradient(135deg, #0e5a74, #e9782e)" }}
            >
              Analyze Logs
            </button>
          </div>

          <div className="border-t border-[#d9e1e7]" />

          <div className="px-6 py-5 flex flex-col gap-5">
            <div>
              <h3 className="text-[#0e5a74] text-lg font-semibold mb-2">Summary:</h3>
              <p className="text-sm leading-relaxed text-[#1f2a37]/50">—</p>
            </div>
            <div>
              <h3 className="text-[#0e5a74] text-lg font-semibold mb-2">Anomalies:</h3>
              <ul className="list-disc pl-5 text-sm leading-relaxed text-[#1f2a37]/50">
                <li>—</li>
              </ul>
            </div>
            <div>
              <h3 className="text-[#0e5a74] text-lg font-semibold mb-2">Recommendation:</h3>
              <p className="text-sm leading-relaxed text-[#1f2a37]/50">—</p>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              {["Logs", "Errors", "Warnings", "Info"].map((s) => (
                <span key={s} className="text-[#1f2a37]">
                  {s}: <strong className="text-[#0e5a74]">0</strong>
                </span>
              ))}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}