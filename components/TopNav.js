import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";

export default function TopNav({ onLogout }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState("");
  const [session, setSession] = useState(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

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

  // Close menu on outside click / Escape
  useEffect(() => {
    if (!menuOpen) return;

    const onDocMouseDown = (e) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target)) setMenuOpen(false);
    };

    const onDocKeyDown = (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, [menuOpen]);

  const go = (path) => {
    setMenuOpen(false);
    router.push(path);
  };

  const doLogout = async () => {
    setMenuOpen(false);
    await onLogout?.();
  };

  return (
    <header className="sticky top-0 z-[99999] border-b border-black/10 bg-white/80 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded bg-brand-red/90 backdrop-blur grid place-items-center text-white">
            <i className="fa-solid fa-plane"></i>
          </div>
          <h1 className="text-lg font-semibold tracking-wide">
            Ticket Processing System
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

          {/* Burger menu */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              className="btn btn-ghost"
              title="Menu"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <i className="fa-solid fa-bars"></i>
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-48 overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="w-full px-4 py-2 text-left text-sm hover:bg-black/[0.04] flex items-center gap-2"
                  onClick={() => go("/admin")}
                >
                  <i className="fa-solid fa-user-shield text-black/60"></i>
                  Admin
                </button>

                <button
                  type="button"
                  role="menuitem"
                  className="w-full px-4 py-2 text-left text-sm hover:bg-black/[0.04] flex items-center gap-2"
                  onClick={() => go("/dashboard")}
                >
                  <i className="fa-solid fa-gauge-high text-black/60"></i>
                  Dashboard
                </button>

                <div className="h-px bg-black/10" />

                <button
                  type="button"
                  role="menuitem"
                  className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 text-brand-red flex items-center gap-2"
                  onClick={doLogout}
                >
                  <i className="fa-solid fa-right-from-bracket"></i>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
