import msalInstance, { getMsal, apiScopes } from "./okta";

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
 * Get a valid Azure AD access token for API calls.
 * NOTE: this is async (MSAL refreshes the token silently when needed).
 */
export const getAccessToken = async () => {
  await getMsal();
  const account = getActiveAccount();
  if (!account) return null;
  try {
    const res = await msalInstance.acquireTokenSilent({
      scopes: apiScopes,
      account,
    });
    return res.accessToken || null;
  } catch {
    return null; // optionally call msalInstance.acquireTokenRedirect(...) here
  }
};