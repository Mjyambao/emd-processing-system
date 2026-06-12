import { useEffect, useState } from "react";

export default function TopNav({ onLogout }) {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState("");
  const [session, setSession] = useState(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    setMounted(true);

    (async () => {
      // Read the signed-in user straight from MSAL (source of truth),
      // falling back to the stored session blob if present.
      try {
        const { getMsal } = await import("../lib/okta");
        const instance = await getMsal();
        const account =
          instance.getActiveAccount() || instance.getAllAccounts()[0] || null;

        if (account) {
          const claims = account.idTokenClaims || {};
          const email =
            claims.email ||
            claims.preferred_username ||
            claims.upn ||
            (Array.isArray(claims.emails) ? claims.emails[0] : "") ||
            account.username ||
            "";
          const name =
            claims.name ||
            [claims.given_name, claims.family_name].filter(Boolean).join(" ") ||
            email ||
            account.name ||
            "";
          const next = {
            email,
            name,
            agentId:
              claims.preferred_username || claims.oid || account.username || "",
            userId: claims.oid || claims.sub || "",
          };
          setSession(next);
          // keep localStorage in sync for any other code that reads it
          localStorage.setItem("session", JSON.stringify(next));
          return;
        }
      } catch {
        // fall through to localStorage
      }

      try {
        const raw = localStorage.getItem("session");
        setSession(raw ? JSON.parse(raw) : {});
      } catch {
        setSession({});
      }
    })();

    // Start clock after mount
    const tick = () => setNow(new Date().toLocaleString());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const handleLogoutClick = async () => {
    if (isLoggingOut) return; // guard

    setIsLoggingOut(true);

    try {
      await onLogout(); // call your existing logout logic
    } catch (err) {
      console.error("Logout failed:", err);
      setIsLoggingOut(false); // allow retry if it fails
    }
  };

  return (
    <header className="sticky top-0 z-[99999] border-b border-black/10 bg-white/80 backdrop-blur">
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
          <button
            className="btn btn-ghost"
            onClick={handleLogoutClick}
            disabled={isLoggingOut}
            title="Logout"
            style={{
              marginLeft: "10px",
              opacity: isLoggingOut ? 0.6 : 1,
              cursor: isLoggingOut ? "not-allowed" : "pointer",
            }}
          >
            <i className="fa-solid fa-right-from-bracket"></i>{" "}
            {isLoggingOut ? "Logging out..." : "Logout"}
          </button>
        </div>
      </div>
    </header>
  );
}
