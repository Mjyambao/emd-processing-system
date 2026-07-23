import { PublicClientApplication } from "@azure/msal-browser";
import { appLogger } from "../utils/appLogger";

const clientId = process.env.NEXT_PUBLIC_AZURE_CLIENT_ID?.trim() || "";
const tenantId = process.env.NEXT_PUBLIC_AZURE_TENANT_ID?.trim() || "";

export const apiScopes = [
  process.env.NEXT_PUBLIC_AZURE_API_SCOPE || `api://${clientId}/access_as_user`,
];

// Delegated Microsoft Graph scope used only for reading security group
// membership (e.g. the /group/members admin screen). Requires one-time
// admin consent on the app registration -- no client secret involved.
export const graphScopes = ["GroupMember.Read.All"];

const msalInstance = new PublicClientApplication({
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri:
      typeof window !== "undefined"
        ? `${window.location.origin}/callback`
        : "http://localhost:3000/callback",
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: false,
  },
});

// Authentication SLA threshold (3 seconds)
const AUTH_THRESHOLD_MS = 3000;

// MSAL v3+ requires initialize() before any other call. We ALSO run
// handleRedirectPromise() here so any pending redirect is completed and the
// "interaction in progress" flag is cleared on every page load.
let initPromise = null;
let redirectResult = null;

export function getMsal() {
  if (!initPromise) {
    const authStartTime = performance.now();

    appLogger.info("AUTH_INITIALIZATION_STARTED", {
      component: "MSAL",
      thresholdMs: AUTH_THRESHOLD_MS,
    });

    initPromise = msalInstance
      .initialize()
      .then(() => {
        const initializeDuration = performance.now() - authStartTime;

        appLogger.info("AUTH_MSAL_INITIALIZED", {
          component: "MSAL",
          durationMs: Number(initializeDuration.toFixed(2)),
        });

        appLogger.info("AUTH_REDIRECT_PROCESSING_STARTED", {
          component: "MSAL",
        });

        return msalInstance.handleRedirectPromise();
      })
      .then((result) => {
        redirectResult = result || null;

        const totalDuration = performance.now() - authStartTime;

        if (result?.account) {
          msalInstance.setActiveAccount(result.account);

          appLogger.info("AUTH_ACTIVE_ACCOUNT_SET", {
            component: "MSAL",
          });
        }

        appLogger.info("AUTH_COMPLETED", {
          component: "MSAL",
          durationMs: Number(totalDuration.toFixed(2)),
          thresholdMs: AUTH_THRESHOLD_MS,
          passed: totalDuration <= AUTH_THRESHOLD_MS,
          hasAccount: !!result?.account,
        });

        if (totalDuration <= AUTH_THRESHOLD_MS) {
          appLogger.info("AUTH_SLA_PASSED", {
            component: "MSAL",
            durationMs: Number(totalDuration.toFixed(2)),
            thresholdMs: AUTH_THRESHOLD_MS,
          });
        } else {
          appLogger.warn("AUTH_SLA_FAILED", {
            component: "MSAL",
            durationMs: Number(totalDuration.toFixed(2)),
            thresholdMs: AUTH_THRESHOLD_MS,
            exceededByMs: Number(
              (totalDuration - AUTH_THRESHOLD_MS).toFixed(2),
            ),
          });
        }

        return msalInstance;
      })
      .catch((error) => {
        const failedDuration = performance.now() - authStartTime;

        appLogger.error("AUTH_FAILED", {
          component: "MSAL",
          durationMs: Number(failedDuration.toFixed(2)),
          errorMessage: error?.message,
          errorCode: error?.errorCode,
          errorName: error?.name,
        });

        throw error;
      });
  }

  return initPromise;
}

// handleRedirectPromise() returns its result only once per redirect, and
// getMsal() already consumed it. callback.js reads the captured result here
// instead of calling handleRedirectPromise() a second time (which returns null).
export function getRedirectResult() {
  return redirectResult;
}

export default msalInstance;
