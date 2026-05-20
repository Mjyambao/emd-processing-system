import oktaAuth from "../lib/okta";
import { getAccessToken } from "../lib/auth";

export async function logout() {
  localStorage.removeItem("session");
  localStorage.setItem("chat_history_processing", {});
  localStorage.setItem("chat_history_admin", {});
  localStorage.set("conversation_id", "");
  await oktaAuth.signOut({ postLogoutRedirectUri: window.location.origin });
}

export function getAuthToken() {
  return getAccessToken();
}

/*
 * Get user permission
 *
 * GET /api/v1/auth/me/permissions
 *
 */
export function getUserPermissions() {
  return api.get("/api/v1/auth/me/permissions");
}
