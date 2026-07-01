import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import msalInstance, { getMsal, getRedirectResult } from "../lib/okta";

import { createChatSession } from "../api/chatApi";
import { checkAccess } from "../api/userApi";

export default function Callback() {
  const router = useRouter();
  const [error, setError] = useState(null);

  useEffect(() => {
    async function handleCallback() {
      try {
        // getMsal() runs handleRedirectPromise() and sets the active account.
        await getMsal();

        // Prefer the redirect result; fall back to the active account / first
        // account so a re-render or mount-order race can't lose the session.
        const result = getRedirectResult();
        const account =
          result?.account ||
          msalInstance.getActiveAccount() ||
          msalInstance.getAllAccounts()[0] ||
          null;

        if (account) {
          msalInstance.setActiveAccount(account);
          const claims = account.idTokenClaims || {};

          const email =
            claims.email ||
            claims.preferred_username ||
            claims.upn ||
            (Array.isArray(claims.emails) ? claims.emails[0] : "") ||
            "";
          const name =
            claims.name ||
            [claims.given_name, claims.family_name].filter(Boolean).join(" ") ||
            email ||
            account.name ||
            account.username ||
            "";

          localStorage.setItem(
            "session",
            JSON.stringify({
              email,
              name,
              agentId: claims.preferred_username || claims.oid || account.username,
              userId: claims.oid || claims.sub,
            }),
          );
        } else {
          console.warn("Callback: no MSAL account found after redirect.");
        }

        // Enforce the Azure Entra security group gate before letting the
        // user into the app. A 403 here means auth succeeded but the user
        // isn't authorized (backend enforces this on every call too — this
        // just avoids a flash of the dashboard before it 403s everywhere).
        try {
          await checkAccess();
        } catch (accessErr) {
          if (accessErr?.status === 403) {
            router.replace("/access-denied");
            return;
          }
          // Non-403 errors (network hiccup, etc.) — fall through and let
          // the dashboard's own API calls enforce access as a fallback.
          console.error("Access check failed:", accessErr);
        }

        try {
          const response = await createChatSession();
          const conversationId = response?.conversation_id;
          if (conversationId) {
            localStorage.setItem("conversation_id", conversationId);
          }
        } catch (error) {
          console.error("Failed to create chat session:", error);
        }
        router.replace("/dashboard");
      } catch (err) {
        console.error("Callback error:", err);
        setError(err.message || "Authentication failed");
      }
    }

    handleCallback();
  }, [router]);

  return (
    <main className="min-h-screen grid place-items-center">
      <p className="text-black/60">Completing sign-in...</p>
    </main>
  );
}