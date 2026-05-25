import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import { deleteJson, getJson, postJson, putJson } from "../apiClient";
import { useAuth } from "../auth/useAuth";

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "support_agent", label: "Support Agent" },
  { value: "customer", label: "Customer" },
];

const ROLE_BADGE = {
  admin: "bg-[#e9782e] text-white",
  support_agent: "bg-[#0e5a74] text-white",
  customer: "bg-[#d9e1e7] text-[#0e5a74]",
};

const EMPTY_FORM = {
  username: "",
  password: "",
  role: "customer",
  allowedDatasets: [],
};

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const [newDatasetName, setNewDatasetName] = useState("");
  const [datasetBusy, setDatasetBusy] = useState(false);

  async function reload() {
    setBusy(true);
    setError("");
    try {
      const [userResp, dsResp] = await Promise.all([
        getJson("/api/users"),
        getJson("/api/datasets"),
      ]);
      setUsers(userResp?.users || []);
      setDatasets(dsResp?.datasets || []);
    } catch (err) {
      setError(err?.message || "Failed to load users.");
    } finally {
      setBusy(false);
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([getJson("/api/users"), getJson("/api/datasets")])
      .then(([userResp, dsResp]) => {
        if (cancelled) return;
        setUsers(userResp?.users || []);
        setDatasets(dsResp?.datasets || []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || "Failed to load users.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAddDataset(e) {
    e.preventDefault();
    const name = newDatasetName.trim();
    if (!name) {
      setError("Dataset name is required.");
      return;
    }
    try {
      setDatasetBusy(true);
      setError("");
      const resp = await postJson("/api/datasets", { name });
      if (resp?.datasets) setDatasets(resp.datasets);
      setNewDatasetName("");
      flash(`Dataset '${name}' registered.`);
    } catch (err) {
      setError(err?.message || "Failed to register dataset.");
    } finally {
      setDatasetBusy(false);
    }
  }

  function flash(msg) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 3000);
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    if (!form.username || !form.password) {
      setError("Username and password are required.");
      return;
    }
    if (form.allowedDatasets.length === 0) {
      setError("Select at least one allowed dataset.");
      return;
    }
    if (form.role === "customer" && form.allowedDatasets.length !== 1) {
      setError("A customer must have exactly one assigned dataset.");
      return;
    }
    try {
      setBusy(true);
      await postJson("/api/users", form);
      flash(`User '${form.username}' created.`);
      setForm(EMPTY_FORM);
      setShowCreate(false);
      reload();
    } catch (err) {
      setError(err?.message || "Failed to create user.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRoleChange(username, role) {
    try {
      setBusy(true);
      setError("");
      const target = users.find((u) => u.username === username);
      const desiredDatasets =
        role === "customer" && (target?.allowedDatasets?.length ?? 0) !== 1
          ? [target?.allowedDatasets?.[0] || datasets[0]].filter(Boolean)
          : target?.allowedDatasets || [];
      await putJson(`/api/users/${encodeURIComponent(username)}`, {
        role,
        allowedDatasets: desiredDatasets,
      });
      flash(`Role updated for '${username}'.`);
      reload();
    } catch (err) {
      setError(err?.message || "Failed to update role.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDatasetToggle(username, dataset, currentList, role) {
    const next = currentList.includes(dataset)
      ? currentList.filter((d) => d !== dataset)
      : [...currentList, dataset];

    if (role === "customer" && next.length !== 1) {
      setError("A customer must have exactly one assigned dataset.");
      return;
    }
    if (next.length === 0) {
      setError("Each user needs at least one allowed dataset.");
      return;
    }

    try {
      setBusy(true);
      setError("");
      await putJson(`/api/users/${encodeURIComponent(username)}`, {
        allowedDatasets: next,
      });
      reload();
    } catch (err) {
      setError(err?.message || "Failed to update datasets.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(username) {
    if (!window.confirm(`Delete user '${username}'? This cannot be undone.`)) return;
    try {
      setBusy(true);
      setError("");
      await deleteJson(`/api/users/${encodeURIComponent(username)}`);
      flash(`User '${username}' deleted.`);
      reload();
    } catch (err) {
      setError(err?.message || "Failed to delete user.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#f4f6f8] font-sans">
      <Navbar active="Users" />

      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-end justify-between mb-6">
            <div>
              <h1 className="text-[#0e5a74] text-2xl font-bold">User & role management</h1>
              <p className="text-[#1f2a37]/60 text-sm mt-1">
                Manage who can sign in, what role they have and which datasets they may access.
              </p>
            </div>
            <button
              onClick={() => {
                setForm(EMPTY_FORM);
                setShowCreate((open) => !open);
                setError("");
              }}
              className="px-4 py-2 rounded-lg bg-[#e9782e] text-white text-sm font-semibold hover:bg-[#d4691f] transition-colors"
            >
              {showCreate ? "Cancel" : "+ New user"}
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
              {successMsg}
            </div>
          )}

          {showCreate && (
            <form
              onSubmit={handleCreate}
              className="mb-6 rounded-xl border border-[#d9e1e7] bg-white p-5 shadow-sm"
            >
              <h2 className="text-[#0e5a74] font-semibold mb-3">Create user</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="Username"
                  className="rounded-lg border border-[#cfd8df] px-3 py-2 text-sm focus:border-[#0e5a74] focus:outline-none"
                />
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Password"
                  className="rounded-lg border border-[#cfd8df] px-3 py-2 text-sm focus:border-[#0e5a74] focus:outline-none"
                />
              </div>

              <div className="mb-3">
                <label className="text-[10px] uppercase tracking-widest text-[#0e5a74]/60 font-semibold block mb-1">
                  Role
                </label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value, allowedDatasets: [] })}
                  className="rounded-lg border border-[#cfd8df] px-3 py-2 text-sm focus:border-[#0e5a74] focus:outline-none"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div className="mb-3">
                <label className="text-[10px] uppercase tracking-widest text-[#0e5a74]/60 font-semibold block mb-1">
                  Allowed datasets {form.role === "customer" && "(pick exactly 1)"}
                </label>
                <div className="flex flex-wrap gap-2">
                  {datasets.map((d) => {
                    const checked = form.allowedDatasets.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => {
                          if (form.role === "customer") {
                            setForm({ ...form, allowedDatasets: [d] });
                          } else {
                            setForm({
                              ...form,
                              allowedDatasets: checked
                                ? form.allowedDatasets.filter((x) => x !== d)
                                : [...form.allowedDatasets, d],
                            });
                          }
                        }}
                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                          checked
                            ? "bg-[#0e5a74] text-white border-[#0e5a74]"
                            : "bg-white text-[#0e5a74] border-[#d9e1e7] hover:bg-[#eef3f6]"
                        }`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="mt-2 px-4 py-2 rounded-lg bg-[#0e5a74] text-white text-sm font-semibold hover:bg-[#0b4a60] disabled:opacity-50 transition-colors"
              >
                {busy ? "Saving…" : "Create user"}
              </button>
            </form>
          )}

          {/* Dataset registration */}
          <div className="mb-6 rounded-xl border border-[#d9e1e7] bg-white p-5 shadow-sm">
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-[#0e5a74] font-semibold">Datasets</h2>
                <p className="text-[#1f2a37]/60 text-xs mt-1">
                  Register an existing SQL Server database so it shows up in dataset pickers.
                  The database must already exist in SQL Server.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-4 mb-4">
              {datasets.length === 0 ? (
                <p className="text-[#1f2a37]/40 text-sm">No datasets registered yet.</p>
              ) : (
                datasets.map((d) => (
                  <span
                    key={d}
                    className="px-3 py-1 rounded-full text-xs font-semibold bg-[#eef3f6] text-[#0e5a74] border border-[#d9e1e7]"
                  >
                    {d}
                  </span>
                ))
              )}
            </div>

            <form onSubmit={handleAddDataset} className="flex gap-2 items-stretch flex-wrap">
              <input
                type="text"
                value={newDatasetName}
                onChange={(e) => setNewDatasetName(e.target.value)}
                placeholder="New dataset name (e.g. DATASET3)"
                className="flex-1 min-w-[200px] rounded-lg border border-[#cfd8df] px-3 py-2 text-sm focus:border-[#0e5a74] focus:outline-none"
                disabled={datasetBusy}
              />
              <button
                type="submit"
                disabled={datasetBusy}
                className="px-4 py-2 rounded-lg bg-[#e9782e] text-white text-sm font-semibold hover:bg-[#d4691f] disabled:opacity-50 transition-colors"
              >
                {datasetBusy ? "Adding…" : "Add dataset"}
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-[#d9e1e7] bg-white overflow-hidden shadow-sm">
            {loading ? (
              <p className="p-8 text-center text-[#1f2a37]/50 text-sm">Loading users…</p>
            ) : users.length === 0 ? (
              <p className="p-8 text-center text-[#1f2a37]/50 text-sm">No users configured.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-[#fbfcfd] text-[#0e5a74] text-xs uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">User</th>
                    <th className="text-left px-4 py-3 font-semibold">Role</th>
                    <th className="text-left px-4 py-3 font-semibold">Datasets</th>
                    <th className="text-right px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8edf1]">
                  {users.map((u) => {
                    const isSelf = u.username === currentUser?.username;
                    return (
                      <tr key={u.username} className="hover:bg-[#fbfcfd]">
                        <td className="px-4 py-3">
                          <p className="text-[#1f2a37] font-semibold">{u.username}</p>
                          {isSelf && (
                            <p className="text-[10px] text-[#0e5a74]/60 uppercase tracking-wider mt-0.5">
                              You
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={u.role}
                            onChange={(e) => handleRoleChange(u.username, e.target.value)}
                            disabled={busy || isSelf}
                            className={`text-xs font-semibold px-2 py-1 rounded-full border-0 cursor-pointer disabled:cursor-not-allowed ${
                              ROLE_BADGE[u.role] || ROLE_BADGE.customer
                            }`}
                          >
                            {ROLES.map((r) => (
                              <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {datasets.map((d) => {
                              const checked = (u.allowedDatasets || []).includes(d);
                              return (
                                <button
                                  key={d}
                                  onClick={() =>
                                    handleDatasetToggle(u.username, d, u.allowedDatasets || [], u.role)
                                  }
                                  disabled={busy}
                                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-colors disabled:opacity-50 ${
                                    checked
                                      ? "bg-[#0e5a74] text-white border-[#0e5a74]"
                                      : "bg-white text-[#0e5a74] border-[#d9e1e7] hover:bg-[#eef3f6]"
                                  }`}
                                >
                                  {d}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleDelete(u.username)}
                            disabled={busy || isSelf}
                            className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:text-red-300 disabled:cursor-not-allowed"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <p className="text-[#1f2a37]/40 text-xs mt-4">
            Customers always have exactly one dataset. Admins and support agents can have several.
          </p>
        </div>
      </main>
    </div>
  );
}
