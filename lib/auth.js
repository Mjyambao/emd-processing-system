import { InteractionRequiredAuthError } from "@azure/msal-browser";
import msalInstance, { getMsal, apiScopes, graphScopes } from "./okta";

const getActiveAccount = () =>
  msalInstance.getActiveAccount() || msalInstance.getAllAccounts()[0] || null;

/**
 * Check if a user account is present (signed in).
 */
export const isLoggedIn = () => {
  if (typeof window === "undefined") return false;
  return !!getActiveAccount();
};

/**
 * Guard: redirect to login page if not authenticated.
 */
export const requireAuth = async (router) => {
  if (typeof window === "undefined") return;
  await getMsal();
  if (!getActiveAccount()) router.replace("/");
};

/**
 * Get stored session info for UI display (name, email, etc.)
 */
export const getSession = () => {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem("session");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

/**
 * Get a valid Azure AD ACCESS TOKEN for the backend API.
 *
 * We explicitly request the exposed API scope (apiScopes), so MSAL returns an
 * access token whose audience is your API (api://<client-id>) -- NOT an ID
 * token. If a token for that scope isn't cached yet (or consent is needed),
 * acquireTokenSilent throws InteractionRequiredAuthError; in that case we send
 * the user through an interactive redirect to mint/consent the API token.
 *
 * NOTE: async. Returns null only when no account is present.
 */
export const getAccessToken = async () => {
  await getMsal();
  const account = getActiveAccount();
  if (!account) return null;

  const request = { scopes: apiScopes, account };

  try {
    const res = await msalInstance.acquireTokenSilent(request);
    if (res?.accessToken) return res.accessToken;
    // No access token returned -> force interactive acquisition.
    await msalInstance.acquireTokenRedirect(request);
    return null;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      // Consent / fresh-login needed for the API scope -> redirect.
      await msalInstance.acquireTokenRedirect(request);
      return null;
    }
    console.error("acquireTokenSilent failed:", err);
    return null;
  }
};

/**
 * Get a valid Microsoft Graph access token (scope: GroupMember.Read.All).
 * Used only for admin-facing screens that need to read group membership,
 * e.g. listing everyone in the required security group.
 *
 * Separate from getAccessToken() because Graph requires its own audience
 * (https://graph.microsoft.com) -- it cannot reuse the API access token.
 */
export const getGraphAccessToken = async () => {
  await getMsal();
  const account = getActiveAccount();
  if (!account) return null;

  const request = { scopes: graphScopes, account };

  try {
    const res = await msalInstance.acquireTokenSilent(request);
    if (res?.accessToken) return res.accessToken;
    await msalInstance.acquireTokenRedirect(request);
    return null;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      await msalInstance.acquireTokenRedirect(request);
      return null;
    }
    console.error("acquireTokenSilent (graph) failed:", err);
    return null;
  }
};