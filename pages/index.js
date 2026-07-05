import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import msalInstance, { getMsal, apiScopes } from "../lib/okta";

export default function Login() {
  const router = useRouter();
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // If already authenticated, go straight to dashboard
  useEffect(() => {
    getMsal().then(() => {
      if (msalInstance.getAllAccounts().length > 0)
        router.replace("/dashboard");
    });
  }, [router]);

  async function handleLogin() {
    if (isLoggingIn) return; // prevent spam clicks

    setIsLoggingIn(true);

    try {
      await getMsal();

      await msalInstance.loginRedirect({
        scopes: ["openid", "profile", "email", ...apiScopes],
      });

      // NOTE:
      // No need to reset isLoggingIn = false
      // because redirect will unload the page
    } catch (err) {
      console.error("Login failed:", err);
      setIsLoggingIn(false); // allow retry if something breaks
    }
  }

  return (
    <main className="min-h-screen grid place-items-center p-4">
      <div className="w-full max-w-md card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded bg-brand-red grid place-items-center text-white">
            <i className="fa-solid fa-plane"></i>
          </div>
          <div>
            <h1 className="text-xl font-semibold">
              EMD Processing System{" "}
              <span className="text-xs text-black/30">v1.0</span>
            </h1>
            <p className="text-black/60 text-sm">Sign in to continue</p>
          </div>
        </div>

        <button
          className="btn btn-primary w-full justify-center"
          onClick={handleLogin}
          disabled={isLoggingIn}
          style={{
            opacity: isLoggingIn ? 0.6 : 1,
            cursor: isLoggingIn ? "not-allowed" : "pointer",
          }}
        >
          <i className="fa-solid fa-right-to-bracket"></i>{" "}
          {isLoggingIn ? "Signing in..." : "Sign in with Okta"}
        </button>
      </div>
    </main>
  );
}
