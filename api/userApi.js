import { api, setToken, clearToken, getToken } from "./api";

export async function login(credentials, path = "/api/v1/auth/login") {
  const resp = await api.post(path, credentials);
  const token = resp?.data?.accessToken;

  if (!token) {
    throw new Error("Login succeeded but no token was found in the response");
  }

  setToken(token);

  return {
    token,
    user: resp?.user || resp?.profile || null,
    raw: resp,
  };
}

// Clear token (logout client-side)
export function logout() {
  clearToken();
}

// Manually set token
export function setAuthToken(token) {
  setToken(token);
}

// Get current token (if any)
export function getAuthToken() {
  return getToken();
}
