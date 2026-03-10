import { useEffect, useState } from "react";

export default function TopNav({ onLogout }) {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState("");
  const [session, setSession] = useState(null);

  useEffect(() => {
    setMounted(true);

    try {
      const raw = localStorage.getItem("session");
      setSession(raw ? JSON.parse(raw) : {});
    } catch {
      setSession({});
    }

    // Start clock after mount
    const tick = () => setNow(new Date().toLocaleString());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-black/10 bg-white/80 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded bg-brand-red/90 backdrop-blur grid place-items-center text-white">
            <i className="fa-solid fa-plane"></i>
          </div>
          <h1 className="text-lg font-semibold tracking-wide">
            EMD Processing System
          </h1>
        </div>

        <div className="flex items-center gap-4 text-sm">
          {mounted && (
            <>
              <div className="hidden sm:block text-black/80">
                <i className="fa-regular fa-clock text-black/70"></i> {now}
              </div>
              <div className="text-black/90">
                <i className="fa-regular fa-user text-brand-red"></i>{" "}
                {session?.name || "Agent"}
                <span className="text-black/60"> • </span>
                <i className="fa-solid fa-id-card-clip text-black/70"></i>{" "}
                {session?.agentId || "AGT-XXXX"}
              </div>
            </>
          )}
          <button className="btn btn-ghost" onClick={onLogout} title="Logout">
            <i className="fa-solid fa-right-from-bracket"></i> Logout
          </button>
        </div>
      </div>
    </header>
  );
}
