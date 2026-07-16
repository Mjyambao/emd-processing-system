import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Image from "next/image";
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
      <div className="w-full max-w-md card p-8 px-6">
        <div className="flex flex-col items-center">
          <Image
            src="/login-asset-2.png"
            alt="EMD Logo"
            className="rounded-xl mx-10"
            width={300}
            height={300}
          />
          <p className="text-black/60 text-sm py-6">Sign in to continue</p>
        </div>

        <button
          className="btn btn-navyGround w-full justify-center h-12"
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
