// pages/dashboard.js
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import TopNav from "../components/TopNav";
import PNRTable from "../components/PNRTable";
import PNRDetails from "../components/PNRDetails";
import ToastStack from "../components/Toast";
import Spinner from "../components/Spinner";
import Chip from "../components/Chip";
import { initialPnrs, refreshStatuses } from "../lib/sampleData";
import { requireAuth } from "../lib/auth";

export default function Dashboard() {
  const router = useRouter();
  // Tabs
  const TABS = { ALL: "all", MINE: "mine" };
  const [activeTab, setActiveTab] = useState(TABS.ALL);

  // All Queue
  const [allRows, setAllRows] = useState(initialPnrs);
  const [allSearch, setAllSearch] = useState("");
  const [allSelected, setAllSelected] = useState(null);
  const [allRefreshing, setAllRefreshing] = useState(false);
  const [allStatus, setAllStatus] = useState("all"); // 'all'|'processed'|'processing'|'error'|'human'

  // My Queues (replace with your real "mine" dataset)
  const [myRows, setMyRows] = useState([
    {
      pnr: "MY987B",
      passenger: "James Doe",
      status: "human",
      action: "Review SSR vs seat",
      stage: "EMD Mask Checking",
      error: "",
    },
    {
      pnr: "MY777C",
      passenger: "Clara Smith",
      status: "error",
      action: "Retry deal match",
      stage: "Deal Matching",
      error: "No applicable deal table found",
    },
  ]);
  const [mySearch, setMySearch] = useState("");
  const [mySelected, setMySelected] = useState(null);
  const [myRefreshing, setMyRefreshing] = useState(false);
  const [myStatus, setMyStatus] = useState("all"); // same enum as above

  const [killing, setKilling] = useState(new Set()); // set of PNRs being killed
  const [retrying, setRetrying] = useState(new Set()); // set of PNRs being retried (optional)

  // Toasts
  const [toasts, setToasts] = useState([]);
  const pushToast = (t) =>
    setToasts((prev) => [
      ...prev,
      {
        id: crypto.randomUUID?.() || String(Date.now() + Math.random()),
        type: "info",
        ...t,
      },
    ]);
  const dismissToast = (id) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));

  useEffect(() => {
    requireAuth(router);
  }, []);

  // Counters for tabs and chips
  const countByStatus = (rows) =>
    rows.reduce(
      (acc, r) => {
        acc.total++;
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
      },
      { total: 0, processed: 0, processing: 0, error: 0, human: 0 },
    );

  const allCounts = useMemo(() => countByStatus(allRows), [allRows]);
  const myCounts = useMemo(() => countByStatus(myRows), [myRows]);

  // Handlers: All
  async function refreshAll() {
    setAllRefreshing(true);
    await new Promise((r) => setTimeout(r, 800));
    setAllRows((p) => refreshStatuses(p));
    setAllRefreshing(false);
  }

  // Handlers: Mine
  async function refreshMine() {
    setMyRefreshing(true);
    await new Promise((r) => setTimeout(r, 800));
    setMyRows((p) => refreshStatuses(p));
    setMyRefreshing(false);
  }
  // helper to mark busy/not busy
  function withBusy(setter, pnr, busy) {
    setter((prev) => {
      const next = new Set(prev);
      busy ? next.add(pnr) : next.delete(pnr);
      return next;
    });
  }

  async function killFromAll(originalIndex) {
    const victim = allRows[originalIndex];
    if (
      !confirm(
        `Kill process for ${victim?.pnr || "this PNR"}? This cannot be undone.`,
      )
    )
      return;
    withBusy(setKilling, victim.pnr, true);
    try {
      // simulate API call
      await new Promise((r) => setTimeout(r, 700));
      setAllRows((prev) => prev.filter((_, i) => i !== originalIndex));
      setAllSelected((sel) => (sel?.pnr === victim?.pnr ? null : sel));
      pushToast({ type: "error", message: `Process killed • ${victim?.pnr}` });
    } finally {
      withBusy(setKilling, victim.pnr, false);
    }
  }

  async function killFromMine(originalIndex) {
    const victim = myRows[originalIndex];
    if (
      !confirm(
        `Kill process for ${victim?.pnr || "this PNR"}? This cannot be undone.`,
      )
    )
      return;
    withBusy(setKilling, victim.pnr, true);
    try {
      await new Promise((r) => setTimeout(r, 700));
      setMyRows((prev) => prev.filter((_, i) => i !== originalIndex));
      setMySelected((sel) => (sel?.pnr === victim?.pnr ? null : sel));
      pushToast({ type: "error", message: `Process killed • ${victim?.pnr}` });
    } finally {
      withBusy(setKilling, victim.pnr, false);
    }
  }

  // Which dataset is active
  const rows = activeTab === TABS.ALL ? allRows : myRows;
  const setRows = activeTab === TABS.ALL ? setAllRows : setMyRows;
  const search = activeTab === TABS.ALL ? allSearch : mySearch;
  const setSearch = activeTab === TABS.ALL ? setAllSearch : setMySearch;
  const selected = activeTab === TABS.ALL ? allSelected : mySelected;
  const setSelected = activeTab === TABS.ALL ? setAllSelected : setMySelected;
  const isRefreshing = activeTab === TABS.ALL ? allRefreshing : myRefreshing;
  const onRefresh = activeTab === TABS.ALL ? refreshAll : refreshMine;
  const onKill = activeTab === TABS.ALL ? killFromAll : killFromMine;
  const statusFilter = activeTab === TABS.ALL ? allStatus : myStatus;
  const setStatus = activeTab === TABS.ALL ? setAllStatus : setMyStatus;
  const counters = activeTab === TABS.ALL ? allCounts : myCounts;

  function handleLogout() {
    localStorage.removeItem("session");
    router.replace("/");
  }

  return (
    <div className="min-h-screen">
      <TopNav onLogout={handleLogout} />

      <main className="mx-auto max-w-6xl p-4">
        {/* Header */}
        <div className="mb-3 flex items-center gap-2 text-sm text-black/70">
          <span>
            <i className="fa-solid fa-table"></i> Dashboard
          </span>
          <span className="text-black/40">/</span>
          <span>PNR Queues</span>
          {isRefreshing && (
            <span className="ml-auto animate-pulse text-black/60">
              <i className="fa-solid fa-arrows-rotate"></i> Refreshing…
            </span>
          )}
        </div>

        {/* Tabs with counters */}
        <div className="mb-3 border-b border-black/10">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab(TABS.ALL)}
              className={`px-3 py-2 rounded-t-md border-b-2 -mb-[1px] ${
                activeTab === TABS.ALL
                  ? "border-brand-red text-brand-red bg-red-50"
                  : "border-transparent text-black/70 hover:text-black"
              }`}
              aria-selected={activeTab === TABS.ALL}
              role="tab"
              title="All Queue"
            >
              <i className="fa-solid fa-layer-group mr-1"></i>
              All Queue{" "}
              <span className="ml-1 text-black/50">({allCounts.total})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab(TABS.MINE)}
              className={`px-3 py-2 rounded-t-md border-b-2 -mb-[1px] ${
                activeTab === TABS.MINE
                  ? "border-brand-red text-brand-red bg-red-50"
                  : "border-transparent text-black/70 hover:text-black"
              }`}
              aria-selected={activeTab === TABS.MINE}
              role="tab"
              title="My Queues"
            >
              <i className="fa-solid fa-user-check mr-1"></i>
              My Queues{" "}
              <span className="ml-1 text-black/50">({myCounts.total})</span>
            </button>
          </div>
        </div>

        {/* Status filter chips for the active tab */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Chip
            label={`All (${counters.total})`}
            active={statusFilter === "all"}
            onClick={() => setStatus("all")}
          />
          {activeTab === TABS.ALL ? (
            <>
              <Chip
                label={`Processed (${counters.processed})`}
                color="green"
                active={statusFilter === "processed"}
                onClick={() => setStatus("processed")}
              />
              <Chip
                label={`Processing (${counters.processing})`}
                color="yellow"
                active={statusFilter === "processing"}
                onClick={() => setStatus("processing")}
              />
            </>
          ) : (
            ""
          )}

          <Chip
            label={`Error (${counters.error})`}
            color="red"
            active={statusFilter === "error"}
            onClick={() => setStatus("error")}
          />
          <Chip
            label={`Human (${counters.human})`}
            color="gray"
            active={statusFilter === "human"}
            onClick={() => setStatus("human")}
          />
        </div>

        {/* Table for active tab */}
        <PNRTable
          rows={rows}
          search={search}
          setSearch={setSearch}
          onRefresh={onRefresh}
          onSelect={setSelected}
          selected={selected}
          onKill={onKill}
          statusFilter={statusFilter}
          killingSet={killing}
          retryingSet={retrying}
          assignees={[
            { id: "111", name: "All Ticketers" },
            { id: "t-01", name: "Susan Wan Chen" },
            { id: "t-02", name: "Boden Woolstencroft" },
            { id: "t-03", name: "Matt Quinn" },
          ]}
          onAssign={({ assignee, items }) => {
            // items: [{ pnr, originalIndex }, ...]
            // Do your API call or state update here
            console.log("Assign to:", assignee, "Items:", items);
          }}
        />

        {/* Details panel with toast on approve */}
        <PNRDetails
          selected={selected}
          onApprove={({ pnr }) => {
            setRows((list) =>
              list.map((r) =>
                r.pnr === pnr ? { ...r, status: "processed", action: "NA" } : r,
              ),
            );
            pushToast({ type: "success", message: `Approved • ${pnr}` });
          }}
        />

        {/* Toasts */}
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </main>
    </div>
  );
}
