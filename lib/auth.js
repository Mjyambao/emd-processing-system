// export const VALID_USER = {
//   email: "guestuser@accenture.com",
//   password: "1234",
//   name: "Guest User",
//   agentId: "U-0001",
//   userId: "31",
// };
// export const isLoggedIn = () => {
//   if (typeof window === "undefined") return false;
//   return !!localStorage.getItem("session");
// };
// export const requireAuth = (router) => {
//   if (typeof window === "undefined") return;
//   const s = localStorage.getItem("session");
//   if (!s) router.replace("/");
// };
import oktaAuth from "./okta";

/**
 * Check if user is authenticated via Okta.
 * Returns true if a valid token exists in the Okta token manager.
 */
export const isLoggedIn = () => {
  if (typeof window === "undefined") return false;
  const tokenManager = oktaAuth.tokenManager;
  const accessToken = tokenManager.getTokensSync()?.accessToken;
  return !!accessToken && !oktaAuth.tokenManager.hasExpired(accessToken);
};

/**
 * Guard: redirect to login page if not authenticated.
 */
export const requireAuth = async (router) => {
  if (typeof window === "undefined") return;
  const isAuth = await oktaAuth.isAuthenticated();
  if (!isAuth) {
    router.replace("/");
  }
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
 * Get the current Okta access token string (for API calls).
 */
export const getAccessToken = () => {
  const tokens = oktaAuth.tokenManager.getTokensSync();
  return tokens?.accessToken?.accessToken || null;
};
