import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { appLogger } from "../utils/appLogger";

// Components
import TopNav from "../components/TopNav";
import PNRTable from "../components/PNRTable";
import PNRDetails from "../components/PNRDetails";
import ToastViewport from "../components/ToastViewport";
import Spinner from "../components/Spinner";
import Chip from "../components/Chip";

import { requireAuth, getGraphAccessToken } from "../lib/auth";

import { getGroupMembers } from "../api/userApi";

// Client-only components to avoid hydration mismatches
const ReportsModule = dynamic(() => import("../components/ReportsModule"), {
  ssr: false,
  loading: () => (
    <div className="py-6 flex items-center justify-center text-black/60">
      <Spinner />
      <span className="ml-2 text-sm">Loading reports…</span>
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
  const [groupMembers, setGroupMembers] = useState([]);

  useEffect(() => {
    const loadGroupMembers = async () => {
      try {
        const members = await getGroupMembers();
        setGroupMembers(members?.members || []);

        localStorage.setItem(
          "groupMembers",
          JSON.stringify(members?.members || []),
        );
      } catch (error) {
        const cachedMembers = JSON.parse(
          localStorage.getItem("groupMembers") || "[]",
        );

        setGroupMembers(cachedMembers);
      }
    };
    loadGroupMembers();
  }, []);

  const assignees = useMemo(() => {
    return groupMembers.map((member) => ({
      id: member.id,
      name: member.displayName,
    }));
  }, [groupMembers]);

  const router = useRouter();

  const refreshStatuses = (list) => {
    const states = ["processed", "processing", "error", "human"];
    return list.map((row) => ({
      ...row,
      status: states[Math.floor(Math.random() * states.length)],
      action: row.status === "processed" ? "NA" : row.action,
    }));
  };

  // Tabs
  const TABS = { ALL: "all", MINE: "mine", REPORTS: "reports" };
  const [activeTab, setActiveTab] = useState(TABS.ALL);

  // All Queue (legacy local sample state kept for other UI behaviors)
  const [allRows, setAllRows] = useState([]);
  const [allSearch, setAllSearch] = useState("");
  const [allSelected, setAllSelected] = useState(null);
  const [allRefreshing, setAllRefreshing] = useState(false);
  const [allStatus, setAllStatus] = useState("all"); // 'all'|'processed'|'processing'|'error'|'human'

  // My Queue (legacy local sample state kept for other UI behaviors)
  const [myRows, setMyRows] = useState([]);
  const [mySearch, setMySearch] = useState("");
  const [mySelected, setMySelected] = useState(null);
  const [myRefreshing, setMyRefreshing] = useState(false);
  const [myStatus, setMyStatus] = useState("all"); // same enum as above

  const [killing, setKilling] = useState(new Set()); // set of PNRs being killed
  const [retrying, setRetrying] = useState(new Set());

  // Client-only session (avoid SSR hydration mismatch from localStorage)
  const [session, setSession] = useState(null);
  const [hasMounted, setHasMounted] = useState(false); // set of PNRs being retried (optional)
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
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasMounted(true);
    try {
      const raw = localStorage.getItem("session") || "{}";
      setSession(JSON.parse(raw));
    } catch {
      setSession({});
    }
  }, []);

  useEffect(() => {
    if (!hasMounted) return;

    appLogger.info("DASHBOARD_VIEWED", {
      component: "Dashboard",
      activeTab,
    });
  }, [activeTab, hasMounted]);

  useEffect(() => {
    if (!hasMounted) return;

    appLogger.info("DASHBOARD_TAB_CHANGED", {
      component: "Dashboard",
      activeTab,
    });
  }, [activeTab, hasMounted]);

  /**
   * Counters for chips
   */
  const normalizeStatus = (status) =>
    String(status ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const countByStatus = useCallback((rows = []) =>
    rows.reduce(
      (acc, r) => {
        const s = normalizeStatus(r?.status);

        acc.total += 1;

        if (s === "processed") acc.processed += 1;
        else if (s === "processing") acc.processing += 1;
        else if (s === "error") acc.error += 1;
        else if (s === "human") acc.human += 1;
        else if (
          s === "sent_back_to_oasis" ||
          s === "send_to_oasis" ||
          s === "sent_to_oasis"
        ) {
          acc.sentBackToOasis += 1;
        }

        return acc;
      },
      {
        total: 0,
        processed: 0,
        processing: 0,
        error: 0,
        human: 0,
        sentBackToOasis: 0,
      },
    ),
  );

  const countsFromApiMeta = (meta) => {
    if (!meta) return null;
    return {
      total: Number(meta.totalRecords ?? 0),
      processed: Number(meta.totalProcessed ?? 0),
      processing: Number(meta.totalProcessing ?? 0),
      error: Number(meta.totalError ?? 0),
      human: Number(meta.totalHuman ?? 0),
      sentBackToOasis: Number(meta.totalSendToOasis ?? 0),
    };
  };

  const allCounts = useMemo(() => {
    return (
      countsFromApiMeta(allTableSnapshot.meta) ??
      countByStatus(
        allTableSnapshot.rows?.length ? allTableSnapshot.rows : allRows,
      )
    );
  }, [allTableSnapshot.meta, allTableSnapshot.rows, countByStatus, allRows]);

  const myCounts = useMemo(() => {
    return (
      countsFromApiMeta(myTableSnapshot.meta) ??
      countByStatus(
        myTableSnapshot.rows?.length ? myTableSnapshot.rows : myRows,
      )
    );
  }, [myTableSnapshot.meta, myTableSnapshot.rows, countByStatus, myRows]);

  // Handlers: All
  async function refreshAll() {
    appLogger.info("ALL_QUEUE_REFRESH_CLICKED", {
      component: "Dashboard",
    });

    setAllRefreshing(true);

    try {
      await new Promise((r) => setTimeout(r, 800));
      setAllRows((p) => refreshStatuses(p));

      appLogger.info("ALL_QUEUE_REFRESH_COMPLETED", {
        component: "Dashboard",
      });
    } catch (err) {
      appLogger.error("ALL_QUEUE_REFRESH_FAILED", {
        component: "Dashboard",
        message: err?.message || "Unknown error",
      });
    } finally {
      setAllRefreshing(false);
    }
  }

  async function refreshMine() {
    appLogger.info("MY_QUEUE_REFRESH_CLICKED", {
      component: "Dashboard",
    });

    setMyRefreshing(true);

    try {
      await new Promise((r) => setTimeout(r, 800));
      setMyRows((p) => refreshStatuses(p));

      appLogger.info("MY_QUEUE_REFRESH_COMPLETED", {
        component: "Dashboard",
      });
    } catch (err) {
      appLogger.error("MY_QUEUE_REFRESH_FAILED", {
        component: "Dashboard",
        message: err?.message || "Unknown error",
      });
    } finally {
      setMyRefreshing(false);
    }
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

  const loggedInName = session?.name || session?.user?.name || "";
  const loggedInUserId =
    session?.userId || session?.user?.userId || session?.user?.name || "";

  async function handleLogout() {
    appLogger.info("LOGOUT_STARTED", {
      component: "Dashboard",
    });

    try {
      const { default: msalInstance, getMsal } = await import("../lib/okta");
      await getMsal();

      appLogger.info("LOGOUT_REDIRECT_STARTED", {
        component: "Dashboard",
      });

      await msalInstance.logoutRedirect({
        postLogoutRedirectUri: window.location.origin,
      });
    } catch (err) {
      appLogger.error("LOGOUT_REDIRECT_FAILED", {
        component: "Dashboard",
        message: err?.message || "Unknown error",
      });

      throw err;
    }
  }

  const switchTab = (tab) => {
    appLogger.info("DASHBOARD_TAB_CLICKED", {
      component: "Dashboard",
      from: activeTab,
      to: tab,
    });

    setActiveTab(tab);
  };

  const tableRef = useRef(null);
  const handleCloseDetails = () => {
    setSelected(null);
    requestAnimationFrame(() => {
      tableRef.current?.focus?.();
    });
  };

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

        {/* Tabs with counters */}
        <div className="mb-2 border-b border-black/10">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => switchTab(TABS.ALL)}
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
              {/* <span className="ml-1 text-black/50">({allCounts.total})</span> */}
            </button>

            <button
              type="button"
              onClick={() => switchTab(TABS.MINE)}
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
              {/* <span className="ml-1 text-black/50">({myCounts.total})</span> */}
            </button>

            <button
              type="button"
              onClick={() => switchTab(TABS.REPORTS)}
              className={`px-3 py-2 rounded-t-md border-b-2 -mb-[1px] ${
                activeTab === TABS.REPORTS
                  ? "border-brand-red text-brand-red bg-red-50"
                  : "border-transparent text-black/70 hover:text-black"
              }`}
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
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Chip
              label={`All (${counters.total})`}
              active={statusFilter === "all"}
              onClick={() => setStatus("all")}
            />

            <Chip
              label={`Error on Processing (${counters.error})`}
              color="red"
              active={statusFilter === "error"}
              onClick={() => setStatus("error")}
            />
            <Chip
              label={`Human Input Required (${counters.human})`}
              color="gray"
              active={statusFilter === "human"}
              onClick={() => setStatus("human")}
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
              label={`Sent back to Oasis (${counters.sentBackToOasis})`}
              color="blue"
              active={statusFilter === "sent_back_to_oasis"}
              onClick={() => setStatus("sent_back_to_oasis")}
            />
          </div>
        ) : null}

        {activeTab === TABS.REPORTS ? (
          <ReportsModule
            onOpenPNR={(pnr) => {
              switchTab(TABS.ALL);
              const found = allRows.find((r) => r.pnr === pnr);
              if (found) setAllSelected(found);
            }}
          />
        ) : (
          <>
            <div className="grid grid-cols-1 items-start">
              <div>
                <PNRTable
                  ref={tableRef}
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
                  assignees={assignees}
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
              </div>
              <div>
                <PNRDetails
                  loggedInUserId={loggedInUserId}
                  selected={selected}
                  onCloseDetails={handleCloseDetails}
                  onApprove={({ pnr }) => {
                    setRows((list) =>
                      list.map((r) =>
                        r.pnr === pnr
                          ? { ...r, status: "processed", action: "NA" }
                          : r,
                      ),
                    );
                    pushToast({
                      type: "success",
                      message: `Approved • ${pnr}`,
                    });
                  }}
                />
              </div>
            </div>
          </>
        )}

        {/* Toasts */}
        <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      </main>

      <AIAgentsDockPortal />
    </div>
  );
}
