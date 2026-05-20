import { useMemo, useState } from "react";
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
      shiftStart: "6:00",
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

  // Generate sample data that ALWAYS aligns with the selected filters.
  // Monthly shows ~30 days, Weekly shows ~7 days, Daily shows 1 day.
  const sampleRows = useMemo(() => {
    // Always generate at least 30 days ending at the currently selected 'to'
    // so Monthly/Weekly/Daily filters will all have data.
    return generateSampleRoster({ days: 30, endISO: to });
  }, [to]);

  const filteredRows = useMemo(() => {
    return sampleRows
      .filter((r) => withinRange(r.dateISO, from, to))
      .map((r, idx) => ({
        id: `${r.ticketerId}-${r.dateISO}-${idx}`,
        ...r,
        dateDisplay: formatDateDisplay(r.dateISO),
      }));
  }, [sampleRows, from, to]);

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
                {filteredRows.length}
              </span>{" "}
              row(s)
            </div>
          </div>
        </div>

        {/* Table header + Upload button */}
        <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-base font-semibold text-black">
              Ticketer Roster
            </h3>
            <p className="text-sm text-black/60">
              Manage ticketer schedules and view work allocations.
            </p>
          </div>

          <button
            type="button"
            onClick={onUploadRoster}
            className="rounded-lg bg-brand-red px-3 py-2 text-sm font-medium text-white hover:bg-brand-red/90 flex items-center gap-2"
            title="Upload roster file"
          >
            <i className="fa-solid fa-upload" />
            Upload Roster
          </button>
        </div>

        {/* Table */}
        <div className="mt-3 overflow-auto rounded-xl border border-black/10 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-black/[0.03] text-black/70">
              <tr>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium">
                  Ticketer ID
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium">
                  Full Name
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium">
                  Date
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium">
                  Shift Start
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium">
                  Shift End
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium">
                  Work
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-black/50"
                  >
                    No rows for the selected range.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-black/5 hover:bg-black/[0.02]"
                  >
                    <td className="px-3 py-2 font-mono text-brand-red">
                      {r.ticketerId}
                    </td>
                    <td className="px-3 py-2">{r.fullName}</td>
                    <td className="px-3 py-2">{r.dateDisplay}</td>
                    <td className="px-3 py-2">{r.shiftStart}</td>
                    <td className="px-3 py-2">{r.shiftEnd}</td>
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
      </main>
    </div>
  );
}
