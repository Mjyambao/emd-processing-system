import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";

// Components
import TopNav from "../components/TopNav";
import PNRTable from "../components/PNRTable";
import PNRDetails from "../components/PNRDetails";
import ToastViewport from "../components/ToastViewport";
import Spinner from "../components/Spinner";
import Chip from "../components/Chip";

// Utils
import { refreshStatuses } from "../lib/sampleData";
import { generateReportSampleData } from "../lib/reportSampleData";
import { requireAuth } from "../lib/auth";

// Client-only components to avoid hydration mismatches
const ReportsModule = dynamic(() => import("../components/ReportsModule"), {
  ssr: false,
  loading: () => (
    <div className="py-6 flex items-center justify-center text-black/60">
      Loading reports…
    </div>
  ),
});

const AIAgentsDockPortal = dynamic(
  () => import("../components/AIAgentsDockPortal"),
  {
    ssr: false,
  },
);

// APIs
// import { logout } from "../api/userApi";

export default function Dashboard() {
  const router = useRouter();

  // Tabs
  const TABS = { ALL: "all", MINE: "mine", REPORTS: "reports" };
  const [activeTab, setActiveTab] = useState(TABS.ALL);

  // Ticket Type / GDS Region (UI filters)
  const TICKET_TYPES = ["EMD", "Refund", "Reissue"];
  const GDS_TYPES = ["Sabre AU", "Sabre NZ", "Amadeus AU", "Amadeus NZ"];
  const REGION_TYPES = ["AU", "NZ"];
  const [ticketType, setTicketType] = useState(TICKET_TYPES[0]);
  const [gdsType, setGdsType] = useState(GDS_TYPES[0]);
  const [regionType, setRegionType] = useState(REGION_TYPES[0]);
  const [gdsRegion, setGdsRegion] = useState([]);

  const toggleGdsRegion = (region) => {
    setGdsRegion((prev) => {
      const isSelected = prev.includes(region);
      if (isSelected && prev.length === 1) {
        return prev; // do nothing
      }

      if (isSelected) {
        return prev.filter((r) => r !== region);
      }

      return [...prev, region];
    });
  };

  // All Queue (legacy local sample state kept for other UI behaviors)
  const [allRows, setAllRows] = useState([]);
  const [allSearch, setAllSearch] = useState("");
  const [allSelected, setAllSelected] = useState(null);
  const [allRefreshing, setAllRefreshing] = useState(false);
  const [allStatus, setAllStatus] = useState("all"); // 'all' 'processed' 'processing' 'error' 'human'

  // Reports sample
  const [reportData] = useState(() =>
    generateReportSampleData({ days: 30, itemsPerDay: 8 }),
  );

  // My Queue (legacy local sample state kept for other UI behaviors)
  const [myRows, setMyRows] = useState([]);
  const [mySearch, setMySearch] = useState("");
  const [mySelected, setMySelected] = useState(null);
  const [myRefreshing, setMyRefreshing] = useState(false);
  const [myStatus, setMyStatus] = useState("all"); // same enum as above

  const [killing, setKilling] = useState(new Set()); // set of PNRs being killed
  const [retrying, setRetrying] = useState(new Set()); // set of PNRs being retried (optional)

  // Client-only session (avoid SSR hydration mismatch from localStorage)
  const [session, setSession] = useState(null);
  const [hasMounted, setHasMounted] = useState(false);

  const [allTableSnapshot, setAllTableSnapshot] = useState({
    rows: [],
    meta: null,
  });
  const [myTableSnapshot, setMyTableSnapshot] = useState({
    rows: [],
    meta: null,
  });

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

  useEffect(() => {
    setStatus("all");
  }, [ticketType]);

  useEffect(() => {
    setHasMounted(true);
    try {
      const raw = localStorage.getItem("session") || "{}";
      setSession(JSON.parse(raw));
    } catch {
      setSession({});
    }
  }, []);

  /**
   * Counters for chips
   */
  const countByStatus = (rows) =>
    rows.reduce(
      (acc, r) => {
        const s = String(r?.status ?? "").toLowerCase();
        acc.total++;
        acc[s] = (acc[s] || 0) + 1;
        return acc;
      },
      { total: 0, processed: 0, processing: 0, error: 0, human: 0 },
    );

  const allCounts = useMemo(
    () =>
      countByStatus(
        allTableSnapshot.rows?.length ? allTableSnapshot.rows : allRows,
      ),
    [allTableSnapshot.rows, allRows],
  );

  const myCounts = useMemo(
    () =>
      countByStatus(
        myTableSnapshot.rows?.length ? myTableSnapshot.rows : myRows,
      ),
    [myTableSnapshot.rows, myRows],
  );

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

  // Which dataset is active (kept as your original behavior)
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

  // Chips counter
  const counters = activeTab === TABS.ALL ? allCounts : myCounts;

  // Non-EMD counters (Assigned / Unassigned)
  const nonEmdCounts = useMemo(() => {
    const sourceRows =
      activeTab === TABS.ALL
        ? allTableSnapshot.rows?.length
          ? allTableSnapshot.rows
          : allRows
        : myTableSnapshot.rows?.length
          ? myTableSnapshot.rows
          : myRows;

    let assigned = 0;
    let unassigned = 0;

    const isAssigned = (value) => {
      return (
        value &&
        value !== "" &&
        value !== "-" &&
        value !== null &&
        value !== undefined
      );
    };

    sourceRows.forEach((r) => {
      if (isAssigned(r.assigned)) {
        assigned++;
      } else {
        unassigned++;
      }
    });

    return {
      total: sourceRows.length,
      assigned,
      unassigned,
    };
  }, [activeTab, allRows, myRows, allTableSnapshot.rows, myTableSnapshot.rows]);

  const loggedInName = session?.name || session?.user?.name || "";
  const loggedInUserId =
    session?.userId || session?.user?.userId || session?.user?.name || "";

  async function handleLogout() {
    const { default: oktaAuth } = await import("../lib/okta");
    await oktaAuth.signOut({
      postLogoutRedirectUri: window.location.origin,
      clearTokensBeforeRedirect: true,
    });
  }

  return (
    <div className="min-h-screen">
      <TopNav onLogout={handleLogout} />
      <main className="mx-auto max-w-6xl p-4">
        {/* Header */}
        <div className="mb-2 flex items-center gap-2 text-sm text-black/70">
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

        {/* Ticket Type / GDS Region */}
        <div className="mb-2 grid grid-cols-1 gap-3">
          <div>
            <div className="mt-1 inline-flex border border-black/10 overflow-hidden">
              {TICKET_TYPES.map((type) => {
                const isActive = ticketType === type;

                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setTicketType(type)}
                    className={`px-4 py-2 text-sm font-semibold transition
            ${
              isActive
                ? "bg-brand-red text-white"
                : "bg-white text-black/70 hover:bg-black/5 border border-1"
            }
          `}
                  >
                    {type}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-black/60">
              Only <span className="font-semibold">EMD</span> ticket types are
              AI Enabled while <span className="font-semibold">Refund</span> and{" "}
              <span className="font-semibold">Reissue</span> are still not
              migrated to the AI Agents.
            </p>
          </div>

          <div>
            <div className="mb-2 inline-flex border border-black/10 overflow-hidden">
              {GDS_TYPES.map((type) => {
                const isActive = gdsType === type;

                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setGdsType(type)}
                    className={`px-4 py-2 text-sm font-semibold transition
            ${
              isActive
                ? "bg-brand-red text-white"
                : "bg-white text-black/70 hover:bg-black/5 border border-1 "
            }
          `}
                  >
                    {type}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Tabs with counters */}
        <div className="mb-2 border-b border-black/10">
          <div className="flex">
            <button
              type="button"
              onClick={() => setActiveTab(TABS.ALL)}
              className={`px-4 py-2 text-sm font-semibold transition
            ${
              activeTab === TABS.ALL
                ? "bg-brand-red text-white"
                : "bg-white text-black/70 hover:bg-black/5 border border-1"
            }
          `}
              aria-selected={activeTab === TABS.ALL}
              role="tab"
              title="All Queue"
            >
              All Queue {/* ({allCounts.total}) */}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab(TABS.MINE)}
              className={`px-4 py-2 text-sm font-semibold transition
            ${
              activeTab === TABS.MINE
                ? "bg-brand-red text-white"
                : "bg-white text-black/70 hover:bg-black/5 border border-1 "
            }
          `}
              aria-selected={activeTab === TABS.MINE}
              role="tab"
              title="My Queues"
            >
              My Queues {/* ({myCounts.total}) */}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab(TABS.REPORTS)}
              className={`px-4 py-2 text-sm font-semibold transition
            ${
              activeTab === TABS.REPORTS
                ? "bg-brand-red text-white"
                : "bg-white text-black/70 hover:bg-black/5 border border-1 "
            }
          `}
              aria-selected={activeTab === TABS.REPORTS}
              role="tab"
              title="Reports"
            >
              <i className="fa-solid fa-chart-pie mr-1"></i>
              Reports
            </button>
          </div>
        </div>

        {activeTab !== TABS.REPORTS ? (
          <>
            {/* Chips */}
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {/* ✅ NON-EMD (Refund / Reissue) */}
              {ticketType !== "EMD" ? (
                <>
                  <Chip
                    label={`All (${nonEmdCounts.total})`}
                    active={statusFilter === "all"}
                    onClick={() => setStatus("all")}
                  />

                  <Chip
                    label={`Assigned (${nonEmdCounts.assigned})`}
                    color="green"
                    active={statusFilter === "assigned"}
                    onClick={() => setStatus("assigned")}
                  />

                  <Chip
                    label={`Unassigned (${nonEmdCounts.unassigned})`}
                    color="red"
                    active={statusFilter === "unassigned"}
                    onClick={() => setStatus("unassigned")}
                  />
                </>
              ) : (
                /* ✅ ORIGINAL EMD CHIPS */
                <>
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
                  ) : null}

                  <Chip
                    label={`Error (${counters.error})`}
                    color="red"
                    active={statusFilter === "error"}
                    onClick={() => setStatus("error")}
                  />

                  <Chip
                    label={`Human Input Required (${counters.human})`}
                    color="purple"
                    active={statusFilter === "human"}
                    onClick={() => setStatus("human")}
                  />
                </>
              )}
            </div>
          </>
        ) : null}

        {activeTab === TABS.REPORTS ? (
          <ReportsModule
            data={reportData}
            onSelectPNR={(pnr) => {
              setActiveTab(TABS.ALL);
              const found = allRows.find((r) => r.pnr === pnr);
              if (found) setAllSelected(found);
            }}
          />
        ) : (
          <>
            <PNRTable
              ticketType={ticketType}
              gdsRegion={gdsRegion}
              rows={rows}
              search={search}
              setSearch={setSearch}
              onRefresh={onRefresh}
              onSelect={setSelected}
              selected={selected}
              onKill={onKill}
              statusFilter={statusFilter}
              isRefreshing={isRefreshing}
              killingSet={killing}
              retryingSet={retrying}
              onAssign={({ assignee, items }) => {
                console.log("Assign to:", assignee, "Items:", items);
              }}
              onRowsChange={({ rows: latestRows, meta }) => {
                if (activeTab === TABS.ALL)
                  setAllTableSnapshot({ rows: latestRows, meta });
                if (activeTab === TABS.MINE)
                  setMyTableSnapshot({ rows: latestRows, meta });
              }}
              assignedToOverride={
                activeTab === TABS.MINE && loggedInName
                  ? loggedInName
                  : undefined
              }
              loggedInUserName={loggedInName}
              loggedInUserId={loggedInUserId}
            />

            {ticketType === "EMD" && (
              <PNRDetails
                selected={selected}
                onClose={() => setSelected(null)}
                onApprove={(pnr) => {
                  setRows((list) =>
                    list.map((r) =>
                      r.pnr === pnr
                        ? { ...r, status: "processed", action: "NA" }
                        : r,
                    ),
                  );
                  pushToast({ type: "success", message: `Approved • ${pnr}` });
                }}
              />
            )}
          </>
        )}

        {/* Toasts */}
        <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      </main>

      {/* Optional dock portal */}
      {hasMounted ? <AIAgentsDockPortal /> : null}
    </div>
  );
}
