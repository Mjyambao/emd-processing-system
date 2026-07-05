import msalInstance, { getMsal } from "../lib/okta";
import { getAccessToken, getGraphAccessToken } from "../lib/auth";
import { api } from "./api";

export async function logout() {
  await getMsal();
  localStorage.removeItem("session");
  localStorage.setItem("chat_history_processing", {});
  localStorage.setItem("chat_history_admin", {});
  localStorage.set("conversation_id", "");
  await msalInstance.logoutRedirect({
    postLogoutRedirectUri: window.location.origin,
  });
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

/*
 * Check whether the current user passed the Entra security group gate
 *
 * GET /api/v1/auth/me/access-check
 *
 */
export function checkAccess() {
  return api.get("/api/v1/auth/me/access-check");
}

const GRAPH_AUTH_MODE = (process.env.NEXT_PUBLIC_GRAPH_AUTH_MODE || "application").toLowerCase();

/*
 * List all users in the required Entra security group.
 * Mode mirrors the backend's GRAPH_AUTH_MODE:
 *  - "application": plain call, backend handles Graph auth itself.
 *  - "delegated": acquires a Graph-scoped MSAL token and sends it via
 *    X-Graph-Token, so a delegated consent is used instead.
 *
 * GET /api/v1/auth/group/members
 *
 */
export async function getGroupMembers() {
  if (GRAPH_AUTH_MODE === "delegated") {
    const graphToken = await getGraphAccessToken();
    if (!graphToken) {
      throw new Error("Unable to acquire Microsoft Graph token");
    }
    return api.get("/api/v1/auth/group/members", {
      headers: { "X-Graph-Token": graphToken },
    });
  }
  return api.get("/api/v1/auth/group/members");
}