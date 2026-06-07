import { useEffect } from "react";
import { useRouter } from "next/router";
import msalInstance, { getMsal, apiScopes } from "../lib/okta";

export default function Login() {
  const router = useRouter();

  // If already authenticated, go straight to dashboard
  useEffect(() => {
    getMsal().then(() => {
      if (msalInstance.getAllAccounts().length > 0)
        router.replace("/dashboard");
    });
  }, [router]);

  async function handleLogin() {
    await getMsal();
    await msalInstance.loginRedirect({
      scopes: ["openid", "profile", "email", ...apiScopes],
    });
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
              <span className="text-xs text-black/30">v1.2</span>
            </h1>
            <p className="text-black/60 text-sm">Sign in to continue</p>
          </div>
        </div>

        <button
          className="btn btn-primary w-full justify-center"
          onClick={handleLogin}
        >
          <i className="fa-solid fa-right-to-bracket"></i> Sign in with Okta
        </button>
      </div>
    </main>
  );
}
