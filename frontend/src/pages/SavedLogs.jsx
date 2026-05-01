import { useState } from "react";

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
  Analysed: "bg-teal-900/40 text-teal-400",
  Pending: "bg-orange-900/40 text-orange-400",
  Error: "bg-red-900/40 text-red-400",
};

const statusColor = {
  Analysed: "text-teal-400",
  Pending: "text-orange-400",
  Error: "text-red-400",
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

  const filtered = logs.filter((l) =>
    l.name.toLowerCase().includes(search.toLowerCase())
  );
  const grouped = groupByDate(filtered);

  return (
    <div className="flex flex-col min-h-screen bg-[#0d4f5c] font-sans">
      {/* Navbar */}
      <nav className="bg-[#0a3d49] border-b border-white/10 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-[#e05a1e]" />
          <span className="text-[#e05a1e] font-bold text-sm">Resource</span>
          <span className="text-white text-sm">Logs</span>
        </div>
        <div className="flex gap-5">
          {["Dashboard", "Saved Logs", "Analysis", "Settings"].map((item) => (
            <span
              key={item}
              className={`text-sm cursor-pointer ${
                item === "Saved Logs" ? "text-white" : "text-white/60 hover:text-white"
              }`}
            >
              {item}
            </span>
          ))}
        </div>
        <div className="w-7 h-7 rounded-full bg-[#e05a1e] flex items-center justify-center text-white text-xs font-medium">
          VS
        </div>
      </nav>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Log List */}
        <div className="w-80 border-r border-white/10 p-5 overflow-y-auto flex-shrink-0">
          <h2 className="text-white text-base font-medium mb-4">Saved Logs</h2>

          {/* Search */}
          <input
            type="text"
            placeholder="🔍 Search logs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white/10 border border-white/10 rounded-lg px-4 py-2 text-white/50 text-sm placeholder-white/40 focus:outline-none focus:border-white/30 mb-4"
          />

          {/* Groups */}
          {Object.entries(grouped).map(([date, items]) => (
            <div key={date} className="mb-4">
              <p className="text-white/40 text-[10px] uppercase tracking-widest mb-2">
                {date}
              </p>
              {items.map((log) => (
                <div
                  key={log.id}
                  onClick={() => setSelected(log)}
                  className={`rounded-xl px-4 py-3 mb-2 cursor-pointer border transition-all ${
                    selected?.id === log.id
                      ? "border-[#e05a1e] bg-[#e05a1e]/10"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <p className="text-white text-sm font-medium mb-1 truncate">
                    {log.name}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-white/45 text-xs">
                      {log.category} · {log.timeShort}
                    </span>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${statusStyle[log.status]}`}
                    >
                      {log.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ))}

          {filtered.length === 0 && (
            <p className="text-white/30 text-sm text-center mt-10">No logs found.</p>
          )}
        </div>

        {/* Detail Panel */}
        <div className="flex-1 p-6 overflow-y-auto">
          {selected ? (
            <div className="bg-white/7 border border-white/12 rounded-xl p-6 max-w-2xl">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-white text-base font-medium mb-1">
                    {selected.name}
                  </h3>
                  <p className="text-white/40 text-sm">
                    {selected.type} · {selected.time.split(" · ")[0]}
                  </p>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="text-white/35 hover:text-white/70 text-lg leading-none"
                >
                  ✕
                </button>
              </div>

              <hr className="border-white/10 mb-4" />

              {/* Rows */}
              {[
                { label: "Type", value: selected.type },
                { label: "Size", value: selected.size },
                { label: "Saved at", value: selected.time },
                {
                  label: "AI Status",
                  value: selected.status,
                  colored: true,
                },
                { label: "Anomalies", value: selected.anomalies },
              ].map(({ label, value, colored }) => (
                <div
                  key={label}
                  className="flex justify-between items-center py-2.5 border-b border-white/8 text-sm last:border-none"
                >
                  <span className="text-white/45">{label}</span>
                  <span
                    className={`font-medium ${
                      colored ? statusColor[selected.status] : "text-white"
                    }`}
                  >
                    {value}
                  </span>
                </div>
              ))}

              {/* Anomaly box */}
              {selected.showAnomaly && (
                <div className="mt-4 bg-red-900/15 border border-red-500/25 rounded-lg px-4 py-3">
                  <p className="text-red-400 text-sm font-medium mb-1">
                    Anomalies detected
                  </p>
                  <p className="text-white/50 text-sm leading-relaxed">
                    {selected.anomalyText}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 mt-5">
                <button className="px-5 py-2.5 rounded-lg bg-white/10 text-white text-sm font-medium hover:bg-white/15 transition-colors">
                  Download
                </button>
                <button className="px-5 py-2.5 rounded-lg bg-[#e05a1e] text-white text-sm font-medium hover:bg-[#c44d18] transition-colors">
                  View Analysis
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-white/25 text-sm">
              Select a log to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}