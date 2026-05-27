import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import TopNav from "../components/TopNav";

// --- helpers ---
function pad2(n) {
  return String(n).padStart(2, "0");
}
function toISODate(d) {
  return d.toISOString().slice(0, 10);
}
function formatDateDisplay(iso) {
  // iso: YYYY-MM-DD -> DD-Mon-YY (e.g., 20-May-26)
  if (!iso) return "-";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return iso;
  const mon = new Intl.DateTimeFormat(undefined, { month: "short" }).format(dt);
  const yy = String(y).slice(-2);
  return `${pad2(d)}-${mon}-${yy}`;
}
function withinRange(iso, from, to) {
  if (!iso) return false;
  if (from && iso < from) return false;
  if (to && iso > to) return false;
  return true;
}
function normalizeTimeToHHMM(t) {
  // Accepts "6:00" / "06:00" / "6:0" (best effort) -> "06:00"
  if (!t) return "";
  const parts = String(t).split(":");
  const h = parts[0] ?? "";
  const m = parts[1] ?? "00";
  const hh = pad2(parseInt(h, 10) || 0);
  const mm = pad2(parseInt(m, 10) || 0);
  return `${hh}:${mm}`;
}
function displayTime(t) {
  // Display without leading zero hour (optional)
  if (!t) return "-";
  const hhmm = normalizeTimeToHHMM(t);
  const [hh, mm] = hhmm.split(":");
  const hour = String(parseInt(hh, 10));
  return `${hour}:${mm}`;
}
function timeToMinutes(t) {
  const hhmm = normalizeTimeToHHMM(t);
  const [hh, mm] = hhmm.split(":").map((x) => parseInt(x, 10) || 0);
  return hh * 60 + mm;
}

// Work pattern similar to screenshot sample (repeats weekly):
// SL, Regular, Regular, RD, RD, Regular, AL
const WORK_PATTERN = ["SL", "Regular", "Regular", "RD", "RD", "Regular", "AL"];

function generateSampleRoster({ days = 30, endISO } = {}) {
  // Generates sample rows for the last N days ending at endISO (inclusive)
  const end = endISO ? new Date(endISO) : new Date();
  const rows = [];
  // Two sample ticketers matching the screenshot
  const ticketers = [
    {
      ticketerId: "001",
      fullName: "John Smith",
      shiftStart: "06:00",
      shiftEnd: "14:00",
    },
    {
      ticketerId: "002",
      fullName: "Jane Smith",
      shiftStart: "14:00",
      shiftEnd: "22:00",
    },
  ];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const dateISO = toISODate(d);
    // pattern index anchored to the date (so it stays stable)
    const patternIdx = (d.getTime() / 86400000) % WORK_PATTERN.length;
    const work = WORK_PATTERN[((patternIdx % 7) + 7) % 7];
    for (const t of ticketers) {
      rows.push({
        ticketerId: t.ticketerId,
        fullName: t.fullName,
        dateISO,
        shiftStart: t.shiftStart,
        shiftEnd: t.shiftEnd,
        work,
      });
    }
  }
  return rows;
}

function makeRowKey(ticketerId, dateISO) {
  return `${ticketerId}__${dateISO}`;
}

export default function AdminPage() {
  const router = useRouter();

  // Same style of preset ranges as ReportsModule (Daily/Weekly/Monthly) 【1-ebe447】
  const presets = {
    DAILY: "daily",
    WEEKLY: "weekly",
    MONTHLY: "monthly",
    CUSTOM: "custom",
  };

  const [preset, setPreset] = useState(presets.WEEKLY);

  const now = new Date();
  const [from, setFrom] = useState(() => {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return toISODate(d);
  });
  const [to, setTo] = useState(() => toISODate(now));

  function setPresetRange(p) {
    setPreset(p);
    const dTo = new Date();
    const dFrom = new Date(dTo);
    if (p === presets.DAILY) dFrom.setDate(dTo.getDate() - 0);
    if (p === presets.WEEKLY) dFrom.setDate(dTo.getDate() - 6);
    if (p === presets.MONTHLY) dFrom.setDate(dTo.getDate() - 29);
    setFrom(toISODate(dFrom));
    setTo(toISODate(dTo));
  }

  // Generate base sample data aligned to selected "to" (retains prior behavior)
  const baseRows = useMemo(() => {
    return generateSampleRoster({ days: 30, endISO: to });
  }, [to]);

  // Store edits as overrides keyed by ticketerId+dateISO (so edits survive filter changes)
  const [editsByKey, setEditsByKey] = useState({});

  // When "to" changes, we keep editsByKey (overrides) as-is.
  // Any overrides not present in the new 30-day window simply won't show.

  const mergedRows = useMemo(() => {
    return baseRows.map((r) => {
      const k = makeRowKey(r.ticketerId, r.dateISO);
      return editsByKey[k] ? { ...r, ...editsByKey[k] } : r;
    });
  }, [baseRows, editsByKey]);

  // --- Search (Full Name) ---
  const [searchName, setSearchName] = useState("");

  // --- Sorting ---
  const [sortConfig, setSortConfig] = useState({
    key: "dateISO",
    direction: "asc", // "asc" | "desc"
  });

  function toggleSort(key) {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: "asc" };
    });
  }

  function sortIndicator(key) {
    const isActive = sortConfig.key === key;

    // Default (not active) icon = gray up/down
    if (!isActive) {
      return <span className="text-[14px] text-black/30">⇅</span>;
    }

    // Active sort icon
    return sortConfig.direction === "asc" ? (
      <span className="text-[9px] text-black">▲</span>
    ) : (
      <span className="text-[9px] text-black">▼</span>
    );
  }

  // Date-filtered rows
  const dateFilteredRows = useMemo(() => {
    return mergedRows
      .filter((r) => withinRange(r.dateISO, from, to))
      .map((r) => ({
        id: makeRowKey(r.ticketerId, r.dateISO),
        ...r,
        dateDisplay: formatDateDisplay(r.dateISO),
      }));
  }, [mergedRows, from, to]);

  // Search-filtered rows (by Full Name)
  const searchedRows = useMemo(() => {
    const q = searchName.trim().toLowerCase();
    if (!q) return dateFilteredRows;
    return dateFilteredRows.filter((r) =>
      String(r.fullName || "")
        .toLowerCase()
        .includes(q),
    );
  }, [dateFilteredRows, searchName]);

  // Sorted rows (all columns sortable)
  const sortedRows = useMemo(() => {
    const rows = [...searchedRows];
    const { key, direction } = sortConfig;

    const dir = direction === "asc" ? 1 : -1;

    const getComparable = (r) => {
      if (key === "ticketerId") return String(r.ticketerId || "");
      if (key === "fullName") return String(r.fullName || "");
      if (key === "dateISO") return String(r.dateISO || "");
      if (key === "shiftStart") return timeToMinutes(r.shiftStart);
      if (key === "shiftEnd") return timeToMinutes(r.shiftEnd);
      if (key === "work") return String(r.work || "");
      return String(r[key] || "");
    };

    rows.sort((a, b) => {
      const av = getComparable(a);
      const bv = getComparable(b);

      // number compare
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }

      // string compare
      return (
        String(av).localeCompare(String(bv), undefined, {
          numeric: true,
          sensitivity: "base",
        }) * dir
      );
    });

    return rows;
  }, [searchedRows, sortConfig]);

  // --- Modal state (edit row) ---
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState("");

  function openEditModal(row) {
    const originalKey = makeRowKey(row.ticketerId, row.dateISO);
    setEditError("");
    setEditForm({
      originalKey,
      ticketerId: row.ticketerId,
      fullName: row.fullName || "",
      dateISO: row.dateISO || "",
      shiftStart: normalizeTimeToHHMM(row.shiftStart),
      shiftEnd: normalizeTimeToHHMM(row.shiftEnd),
      work: row.work || "Regular",
    });
    setIsEditOpen(true);
  }

  function closeEditModal() {
    setIsEditOpen(false);
    setEditForm(null);
    setEditError("");
  }

  function saveEdit() {
    if (!editForm) return;

    const fullName = String(editForm.fullName || "").trim();
    const dateISO = String(editForm.dateISO || "").trim();
    const shiftStart = normalizeTimeToHHMM(editForm.shiftStart);
    const shiftEnd = normalizeTimeToHHMM(editForm.shiftEnd);
    const work = String(editForm.work || "").trim();

    if (!fullName) return setEditError("Full Name is required.");
    if (!dateISO) return setEditError("Date is required.");
    if (!shiftStart) return setEditError("Start Shift is required.");
    if (!shiftEnd) return setEditError("End Shift is required.");
    if (!work) return setEditError("Work is required.");

    const updated = {
      ticketerId: editForm.ticketerId,
      fullName,
      dateISO,
      shiftStart,
      shiftEnd,
      work,
    };

    const newKey = makeRowKey(updated.ticketerId, updated.dateISO);

    setEditsByKey((prev) => {
      const next = { ...prev };
      // If date changed, remove old key so it doesn't linger
      if (editForm.originalKey && editForm.originalKey !== newKey) {
        delete next[editForm.originalKey];
      }
      next[newKey] = updated;
      return next;
    });

    closeEditModal();
  }

  // Close modal on Escape
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape" && isEditOpen) closeEditModal();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isEditOpen]);

  const onLogout = async () => {
    // sample logout behavior (keep or replace with your real logout)
    try {
      localStorage.removeItem("session");
    } catch {
      // ignore
    }
    router.push("/");
  };

  const onUploadRoster = () => {
    // Placeholder handler – wire this to your upload modal / file picker later.
    // For now it just demonstrates the button placement.
    alert("Upload Roster for Ticketers schedule");
  };

  const onExportRoster = () => {
    // Placeholder handler – wire this to your upload modal / file picker later.
    // For now it just demonstrates the button placement.
    alert("Export Roster of Ticketers schedule");
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav onLogout={onLogout} />
      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* Header */}
        <div className="mb-2 flex items-center gap-2 text-sm text-black/70">
          <span>
            <i className="fa-solid fa-user-shield"></i> Admin
          </span>
          <span className="text-black/40">/</span>
          <span>Ticketer Roster</span>
        </div>

        {/* Date filter (Daily / Weekly / Monthly) */}
        <div className="mt-4 rounded-xl border border-black/10 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPresetRange(presets.DAILY)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  preset === presets.DAILY
                    ? "border-red-200 bg-red-50 text-brand-red"
                    : "border-black/10 bg-white text-black/70 hover:text-black"
                }`}
              >
                Daily
              </button>
              <button
                type="button"
                onClick={() => setPresetRange(presets.WEEKLY)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  preset === presets.WEEKLY
                    ? "border-red-200 bg-red-50 text-brand-red"
                    : "border-black/10 bg-white text-black/70 hover:text-black"
                }`}
              >
                Weekly
              </button>
              <button
                type="button"
                onClick={() => setPresetRange(presets.MONTHLY)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  preset === presets.MONTHLY
                    ? "border-red-200 bg-red-50 text-brand-red"
                    : "border-black/10 bg-white text-black/70 hover:text-black"
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setPreset(presets.CUSTOM)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  preset === presets.CUSTOM
                    ? "border-red-200 bg-red-50 text-brand-red"
                    : "border-black/10 bg-white text-black/70 hover:text-black"
                }`}
                title="Manually change From/To"
              >
                Custom
              </button>

              <div className="ml-1 flex flex-wrap items-center gap-2">
                <label className="text-xs text-black/50">From</label>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setPreset(presets.CUSTOM);
                    setFrom(e.target.value);
                  }}
                  className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm"
                />
                <label className="text-xs text-black/50">To</label>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setPreset(presets.CUSTOM);
                    setTo(e.target.value);
                  }}
                  className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm"
                />
              </div>
            </div>

            <div className="text-sm text-black/60">
              Showing{" "}
              <span className="font-semibold text-black">
                {sortedRows.length}
              </span>{" "}
              row(s)
            </div>
          </div>
        </div>

        {/* Table header + Search + Upload button */}
        <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="w-full">
            <h3 className="text-base font-semibold text-black">
              Ticketer Roster
            </h3>
            <p className="text-sm text-black/60">
              Manage ticketer schedules and view work allocations.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <i className="fa-solid fa-magnifying-glass absolute left-2 top-1/2 -translate-y-1/2 text-black/40 text-xs" />
                <input
                  type="text"
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  placeholder="Search Full Name..."
                  className="pl-7 rounded-lg border border-black/10 bg-white px-2 py-2 text-sm w-64"
                />
              </div>
              {searchName ? (
                <button
                  type="button"
                  onClick={() => setSearchName("")}
                  className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-black/70 hover:text-black"
                  title="Clear search"
                >
                  Clear
                </button>
              ) : null}
            </div>

            {/* Upload button */}
            <button
              type="button"
              onClick={onUploadRoster}
              className="rounded-lg bg-brand-red px-3 py-2 text-sm font-medium text-white hover:bg-brand-red/90 flex gap-2"
              title="Upload roster file"
            >
              <i className="fa-solid fa-upload" />
              Upload Roster
            </button>

            {/* Export button */}
            <button
              type="button"
              onClick={onExportRoster}
              className="rounded-lg bg-black/10 px-3 py-2 text-sm font-medium hover:bg-black/30 flex gap-2"
              title="Export roster file"
            >
              <i className="fa-solid fa-download" />
              Export Roster
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="mt-3 overflow-auto rounded-xl border border-black/10 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-black/[0.03] text-black/70">
              <tr>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium">
                  <button
                    type="button"
                    onClick={() => toggleSort("ticketerId")}
                    className="inline-flex items-center gap-1 hover:text-black"
                    title="Sort Ticketer ID"
                  >
                    Ticketer ID{" "}
                    <span className="text-xs">
                      {sortIndicator("ticketerId")}
                    </span>
                  </button>
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium">
                  <button
                    type="button"
                    onClick={() => toggleSort("fullName")}
                    className="inline-flex items-center gap-1 hover:text-black"
                    title="Sort Full Name"
                  >
                    Full Name{" "}
                    <span className="text-xs">{sortIndicator("fullName")}</span>
                  </button>
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium">
                  <button
                    type="button"
                    onClick={() => toggleSort("dateISO")}
                    className="inline-flex items-center gap-1 hover:text-black"
                    title="Sort Date"
                  >
                    Date{" "}
                    <span className="text-xs">{sortIndicator("dateISO")}</span>
                  </button>
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium">
                  <button
                    type="button"
                    onClick={() => toggleSort("shiftStart")}
                    className="inline-flex items-center gap-1 hover:text-black"
                    title="Sort Shift Start"
                  >
                    Shift Start{" "}
                    <span className="text-xs">
                      {sortIndicator("shiftStart")}
                    </span>
                  </button>
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium">
                  <button
                    type="button"
                    onClick={() => toggleSort("shiftEnd")}
                    className="inline-flex items-center gap-1 hover:text-black"
                    title="Sort Shift End"
                  >
                    Shift End{" "}
                    <span className="text-xs">{sortIndicator("shiftEnd")}</span>
                  </button>
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium">
                  <button
                    type="button"
                    onClick={() => toggleSort("work")}
                    className="inline-flex items-center gap-1 hover:text-black"
                    title="Sort Work"
                  >
                    Work{" "}
                    <span className="text-xs">{sortIndicator("work")}</span>
                  </button>
                </th>
              </tr>
            </thead>

            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-black/50"
                  >
                    No rows for the selected range.
                  </td>
                </tr>
              ) : (
                sortedRows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => openEditModal(r)}
                    className="border-t border-black/5 hover:bg-black/[0.02] cursor-pointer"
                    title="Select row to edit"
                  >
                    <td className="px-3 py-2 font-mono text-brand-red">
                      {r.ticketerId}
                    </td>
                    <td className="px-3 py-2">{r.fullName}</td>
                    <td className="px-3 py-2">{r.dateDisplay}</td>
                    <td className="px-3 py-2">{displayTime(r.shiftStart)}</td>
                    <td className="px-3 py-2">{displayTime(r.shiftEnd)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.work === "Regular"
                            ? "bg-green-100 text-green-700"
                            : r.work === "RD"
                              ? "bg-gray-100 text-gray-700"
                              : r.work === "SL"
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {r.work}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Edit Modal */}
        {isEditOpen && editForm ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onMouseDown={(e) => {
              // close on backdrop click
              if (e.target === e.currentTarget) closeEditModal();
            }}
          >
            <div className="w-full max-w-lg rounded-xl bg-white border border-black/10 shadow-lg">
              <div className="flex items-center justify-between px-4 py-3 border-b border-black/10">
                <div>
                  <h4 className="text-base font-semibold text-black">
                    Edit Roster Row
                  </h4>
                  <p className="text-xs text-black/50">
                    Ticketer ID:{" "}
                    <span className="font-mono">{editForm.ticketerId}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm text-black/70 hover:text-black"
                  title="Close"
                >
                  Close
                </button>
              </div>

              <div className="px-4 py-4 space-y-3">
                {editError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {editError}
                  </div>
                ) : null}

                <div>
                  <label className="block text-xs font-medium text-black/60 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    disabled={true}
                    value={editForm.fullName}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, fullName: e.target.value }))
                    }
                    className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                    placeholder="Enter full name"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-black/60 mb-1">
                      Date
                    </label>
                    <input
                      type="date"
                      disabled={true}
                      value={editForm.dateISO}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, dateISO: e.target.value }))
                      }
                      className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-black/60 mb-1">
                      Work
                    </label>
                    <select
                      value={editForm.work}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, work: e.target.value }))
                      }
                      className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                    >
                      <option value="AL">AL</option>
                      <option value="SL">SL</option>
                      <option value="Regular">Regular</option>
                      <option value="RD">RD</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-black/60 mb-1">
                      Start Shift
                    </label>
                    <input
                      type="time"
                      value={editForm.shiftStart}
                      onChange={(e) =>
                        setEditForm((p) => ({
                          ...p,
                          shiftStart: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-black/60 mb-1">
                      End Shift
                    </label>
                    <input
                      type="time"
                      value={editForm.shiftEnd}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, shiftEnd: e.target.value }))
                      }
                      className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-black/10">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="rounded-lg border border-black/10 bg-white px-4 py-2 text-sm text-black/70 hover:text-black"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white hover:bg-brand-red/90"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
