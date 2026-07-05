import { PublicClientApplication } from "@azure/msal-browser";

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
  cache: { cacheLocation: "localStorage", storeAuthStateInCookie: false },
});

// MSAL v3+ requires initialize() before any other call. We ALSO run
// handleRedirectPromise() here so any pending redirect is completed and the
// "interaction in progress" flag is cleared on every page load. This is what
// prevents BrowserAuthError: interaction_in_progress.
let initPromise = null;
let redirectResult = null;

export function getMsal() {
  if (!initPromise) {
    initPromise = msalInstance
      .initialize()
      .then(() => msalInstance.handleRedirectPromise())
      .then((result) => {
        redirectResult = result || null;
        if (result?.account) {
          msalInstance.setActiveAccount(result.account);
        }
        return msalInstance;
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