import { useState } from "react";
import { useNavigate } from "react-router-dom";

const logs = [
  {
    id: "server",
    name: "server-access-14:32.log",
    type: "CPU Access Log",
    size: "2.4 MB",
    time: "May 1, 2026 · 14:32",
    category: "CPU",
    timeShort: "14:32",
    status: "Analysed",
    anomalies: "2 detected",
    anomalyText: "High CPU spike at 14:28 and unusual access pattern at 14:31.",
    showAnomaly: true,
    date: "Today — May 1, 2026",
  },
  {
    id: "memory",
    name: "memory-usage-09:15.log",
    type: "Memory Usage",
    size: "1.1 MB",
    time: "May 1, 2026 · 09:15",
    category: "Memory",
    timeShort: "09:15",
    status: "Pending",
    anomalies: "—",
    anomalyText: "",
    showAnomaly: false,
    date: "Today — May 1, 2026",
  },
  {
    id: "disk",
    name: "disk-io-23:58.log",
    type: "Disk I/O",
    size: "3.7 MB",
    time: "Apr 30, 2026 · 23:58",
    category: "Disk",
    timeShort: "23:58",
    status: "Error",
    anomalies: "Analysis failed",
    anomalyText: "Failed to process log — file may be corrupted.",
    showAnomaly: true,
    date: "Yesterday — Apr 30, 2026",
  },
  {
    id: "network",
    name: "network-traffic-18:00.log",
    type: "Network Traffic",
    size: "0.8 MB",
    time: "Apr 30, 2026 · 18:00",
    category: "Network",
    timeShort: "18:00",
    status: "Analysed",
    anomalies: "None",
    anomalyText: "",
    showAnomaly: false,
    date: "Yesterday — Apr 30, 2026",
  },
  {
    id: "cpu2",
    name: "cpu-spike-11:44.log",
    type: "CPU Spike",
    size: "1.6 MB",
    time: "Apr 29, 2026 · 11:44",
    category: "CPU",
    timeShort: "11:44",
    status: "Pending",
    anomalies: "—",
    anomalyText: "",
    showAnomaly: false,
    date: "Apr 29, 2026",
  },
];

const statusStyle = {
  Analysed: "bg-teal-100 text-[#0e5a74]",
  Pending: "bg-orange-100 text-[#e9782e]",
  Error: "bg-red-100 text-red-600",
};

const statusColor = {
  Analysed: "text-[#0e5a74]",
  Pending: "text-[#e9782e]",
  Error: "text-red-600",
};

function groupByDate(logs) {
  return logs.reduce((groups, log) => {
    if (!groups[log.date]) groups[log.date] = [];
    groups[log.date].push(log);
    return groups;
  }, {});
}

export default function SavedLogs() {
  const [selected, setSelected] = useState(logs[0]);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const filtered = logs.filter((l) =>
    l.name.toLowerCase().includes(search.toLowerCase())
  );
  const grouped = groupByDate(filtered);

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
          <h2 className="text-[#0e5a74] text-base font-semibold mb-4">Saved Logs</h2>

          {/* Search */}
          <input
            type="text"
            placeholder="🔍 Search logs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-[#cfd8df] rounded-lg px-4 py-2 text-sm text-[#1f2a37] placeholder-[#1f2a37]/40 focus:outline-none focus:border-[#0e5a74] focus:ring-2 focus:ring-[#0e5a74]/10 mb-4"
          />

          {/* Groups */}
          {Object.entries(grouped).map(([date, items]) => (
            <div key={date} className="mb-4">
              <p className="text-[#0e5a74]/60 text-[10px] uppercase tracking-widest mb-2 font-semibold">
                {date}
              </p>
              {items.map((log) => (
                <div
                  key={log.id}
                  onClick={() => setSelected(log)}
                  className={`rounded-xl px-4 py-3 mb-2 cursor-pointer border transition-all ${
                    selected?.id === log.id
                      ? "border-[#e9782e] bg-orange-50"
                      : "border-[#d9e1e7] bg-[#f9fafb] hover:bg-[#eef3f6]"
                  }`}
                >
                  <p className="text-[#1f2a37] text-sm font-semibold mb-1 truncate">
                    {log.name}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-[#1f2a37]/50 text-xs">
                      {log.category} · {log.timeShort}
                    </span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${statusStyle[log.status]}`}>
                      {log.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ))}

          {filtered.length === 0 && (
            <p className="text-[#1f2a37]/30 text-sm text-center mt-10">No logs found.</p>
          )}
        </div>

        {/* Detail Panel */}
        <div className="flex-1 p-6 overflow-y-auto">
          {selected ? (
            <div className="bg-white border border-[#d9e1e7] rounded-[18px] overflow-hidden shadow-[0_4px_14px_rgba(14,90,116,0.08)] max-w-3xl">
              {/* Header */}
              <div className="px-6 py-5 border-b border-[#d9e1e7] bg-[#fbfcfd] flex items-start justify-between">
                <div>
                  <h3 className="text-[#0e5a74] text-lg font-semibold mb-1">
                    {selected.name}
                  </h3>
                  <p className="text-[#1f2a37]/50 text-sm">
                    {selected.type} · {selected.time.split(" · ")[0]}
                  </p>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="text-[#1f2a37]/30 hover:text-[#1f2a37]/60 text-lg leading-none mt-1"
                >
                  ✕
                </button>
              </div>

              <div className="px-6 py-5">
                {/* Rows */}
                {[
                  { label: "Type", value: selected.type },
                  { label: "Size", value: selected.size },
                  { label: "Saved at", value: selected.time },
                  { label: "AI Status", value: selected.status, colored: true },
                  { label: "Anomalies", value: selected.anomalies },
                ].map(({ label, value, colored }) => (
                  <div
                    key={label}
                    className="flex justify-between items-center py-3 border-b border-[#e8edf1] text-sm last:border-none"
                  >
                    <span className="text-[#1f2a37]/50 font-medium">{label}</span>
                    <span className={`font-semibold ${colored ? statusColor[selected.status] : "text-[#1f2a37]"}`}>
                      {value}
                    </span>
                  </div>
                ))}

                {/* Anomaly box */}
                {selected.showAnomaly && (
                  <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                    <p className="text-red-600 text-sm font-semibold mb-1">
                      Anomalies detected
                    </p>
                    <p className="text-[#1f2a37]/60 text-sm leading-relaxed">
                      {selected.anomalyText}
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 mt-6">
                  <button className="px-5 py-2.5 rounded-lg bg-[#eef3f6] text-[#0e5a74] border border-[#d9e1e7] text-sm font-semibold hover:bg-[#e3ebf0] transition-colors">
                    Download
                  </button>
                  <button className="px-5 py-2.5 rounded-lg bg-[#e9782e] text-white text-sm font-bold hover:bg-[#d4691f] transition-colors">
                    View Analysis
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-[#1f2a37]/30 text-sm">
              Select a log to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
