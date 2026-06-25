import { getAccessToken } from "../lib/auth";
import { logout } from "../api/userApi";

let authToken = null;

// Read base URL from env and remove trailing slashes
const BASE_URL = "";

// Default timeout (ms) for API requests. (60 secs)
const DEFAULT_TIMEOUT = 60000;

// Custom API Error to normalize server/client errors. */
export class ApiError extends Error {
  constructor(message, { status, data, url, cause } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status ?? null;
    this.data = data ?? null;
    this.url = url ?? null;
    if (cause) this.cause = cause;
  }
}

/** Auth token helpers */
export function setToken(token) {
  authToken = token || null;
}
export function getToken() {
  return authToken;
}
export function clearToken() {
  authToken = null;
}

// Interceptor (middleware) registries
const requestInterceptors = [];
const responseInterceptors = [];

let isLoggingOut = false;

async function logoutAndRedirectOnce() {
  // SSR/Node guard
  if (typeof window === "undefined") return;

  if (isLoggingOut) return;
  isLoggingOut = true;

  try {
    // Clear any in-memory token
    clearToken();

    // Clear local session marker
    localStorage.removeItem("session");

    // Trigger Okta signout
    void logout();
  } catch {
    // Fallback: if okta signOut fails for some reason, force a hard redirect
    window.location.assign("/");
  } finally {
    // If Okta redirect doesn't happen (blocked/pop-up rules/etc), ensure we land at root
    setTimeout(() => {
      if (window.location.pathname !== "/") window.location.assign("/");
    }, 250);
  }
}

/*
 * Register a request interceptor.
 * @param {(config: RequestConfig) => Promise<RequestConfig>|RequestConfig} fn
 */
export function registerRequestInterceptor(fn) {
  requestInterceptors.push(fn);
}

/*
 * Register a response interceptor.
 * @param {(ctx: { response: Response, request: RequestConfig }) => Promise<Response>|Response} fn
 */
export function registerResponseInterceptor(fn) {
  responseInterceptors.push(fn);
}

/*
 * Request configuration object
 * @typedef {Object} RequestConfig
 * @property {string} url - Path or absolute URL (e.g., '/api/v1/pnrs')
 * @property {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} [method='GET']
 * @property {Object} [query] - Query params for GET (e.g., { page:1, pageSize:25 })
 * @property {Object|FormData|Blob|string|null} [body] - Request body for POST/PUT/PATCH
 * @property {Object} [headers] - Additional headers
 * @property {number} [timeout] - Timeout in ms
 * @property {AbortSignal} [signal] - External abort signal
 */

// Serialize query params (supports arrays)
function toQueryString(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (Array.isArray(value)) {
      value.forEach((v) => search.append(key, String(v)));
    } else if (typeof value === "object") {
      // Flatten simple objects as JSON strings
      search.append(key, JSON.stringify(value));
    } else {
      search.append(key, String(value));
    }
  });
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

// Build full URL using BASE_URL + path
function buildUrl(pathOrUrl, query) {
  const isAbsolute = /^https?:\/\//i.test(pathOrUrl);
  const prefix = isAbsolute ? "" : BASE_URL;
  return `${prefix}${pathOrUrl}${toQueryString(query)}`;
}

// Default headers (attaches Authorization if token is set)
function buildHeaders(extra = {}, body) {
  const headers = { ...extra };

  // Automatically set JSON headers for plain objects/strings (not FormData/Blob)
  const isFormData =
    typeof FormData !== "undefined" && body instanceof FormData;
  const isBlob = typeof Blob !== "undefined" && body instanceof Blob;

  if (
    !isFormData &&
    !isBlob &&
    body !== undefined &&
    body !== null &&
    typeof body !== "string"
  ) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

// Default response error normalization interceptor
registerResponseInterceptor(async ({ response, request }) => {
  if (response.ok) return response;

  let payload = null;
  const contentType = response.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      payload = await response.json();
    } else {
      const text = await response.text();
      payload = { message: text || "Request failed" };
    }
  } catch {
    // ignore parse error
  }

  const detail = payload?.detail || payload?.message || payload?.error || "";
  const isExpiredSignature =
    typeof detail === "string" &&
    detail.includes("Invalid token: Signature has expired.");

  const isAuthError = response.status === 401 || response.status === 403;

  // If token expired (or generally unauthorized), logout + redirect
  if (isAuthError && (isExpiredSignature || /expired/i.test(detail))) {
    await logoutAndRedirectOnce();

    // Optionally throw a consistent error
    throw new ApiError("Session expired. Redirecting to login.", {
      status: response.status,
      data: payload,
      url: request?.url,
    });
  }

  const message =
    payload?.message ||
    payload?.error ||
    `Request failed with status ${response.status}`;

  throw new ApiError(message, {
    status: response.status,
    data: payload,
    url: request?.url,
  });
});

/*
 * Core request executor (applies interceptors, timeout, error handling).
 * @param {RequestConfig} config
 * @returns {Promise<any>} Parsed response (JSON if possible, else text/empty)
 */
export async function request(config) {
  const merged = {
    method: "GET",
    headers: {},
    timeout: DEFAULT_TIMEOUT,
    ...config,
  };

  // Run request interceptors
  let cfg = merged;
  for (const interceptor of requestInterceptors) {
    // allow sync or async interceptors
    // pass a shallow copy to prevent unintended mutation chain
    cfg = (await interceptor({ ...cfg })) || cfg;
  }

  const { url, method, query, headers, body, timeout, signal } = cfg;
  if (!url) throw new ApiError("Missing URL in request config");

  // Attach Azure AD access token (async)
  const token = await getAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const fullUrl = buildUrl(url, query);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // Compose signal (if caller passed one)
  const signals = [controller.signal];
  if (signal) {
    // Merge: propagate abort if external signal aborts
    if (signal.aborted) controller.abort();
    else
      signal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
    signals.push(signal);
  }

  let finalBody = body;
  if (finalBody && typeof finalBody !== "string") {
    const isFormData =
      typeof FormData !== "undefined" && finalBody instanceof FormData;
    const isBlob = typeof Blob !== "undefined" && finalBody instanceof Blob;
    if (!isFormData && !isBlob) {
      // default to JSON for plain objects
      finalBody = JSON.stringify(finalBody);
    }
  }

  const reqInit = {
    method,
    headers: buildHeaders(headers, body),
    body: method === "GET" || method === "HEAD" ? undefined : finalBody,
    signal: controller.signal,
  };

  let res;
  try {
    res = await fetch(fullUrl, reqInit);

    // Run response interceptors
    for (const interceptor of responseInterceptors) {
      res =
        (await interceptor({
          response: res,
          request: { ...cfg, url: fullUrl },
        })) || res;
    }

    // Try to parse JSON; otherwise text; if empty 204, return null
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      return await res.json();
    }
    if (res.status === 204) return null;
    // fallback text
    return await res.text();
  } catch (err) {
    // Normalize AbortError vs network
    if (err?.name === "AbortError") {
      throw new ApiError("Request timed out or was aborted", {
        cause: err,
        url: fullUrl,
      });
    }
    if (err instanceof ApiError) throw err;
    throw new ApiError(err?.message || "Network error", {
      cause: err,
      url: fullUrl,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export const api = {
  get: (url, options = {}) => request({ url, method: "GET", ...options }),
  post: (url, body, options = {}) =>
    request({ url, method: "POST", body, ...options }),
  put: (url, body, options = {}) =>
    request({ url, method: "PUT", body, ...options }),
  patch: (url, body, options = {}) =>
    request({ url, method: "PATCH", body, ...options }),
  delete: (url, options = {}) => request({ url, method: "DELETE", ...options }),
};

export default api;
