let authToken = null;

// Read base URL from env and remove trailing slashes
const BASE_URL = (process.env.NEXT_API_BASE_URL || "").replace(/\/+$/, "");

// Default timeout (ms) for API requests. (20 secs)
const DEFAULT_TIMEOUT = 20000;

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

/*
 * Register a request interceptor.
 * @param {(config: RequestConfig) => Promise<RequestConfig>|RequestConfig} fn
 */
export function useRequest(fn) {
  requestInterceptors.push(fn);
}

/*
 * Register a response interceptor.
 * @param {(ctx: { response: Response, request: RequestConfig }) => Promise<Response>|Response} fn
 */
export function useResponse(fn) {
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
      // Flatten simple objects as JSON strings; adjust if your backend expects different
      search.append(key, JSON.stringify(value));
    } else {
      search.append(key, String(value));
    }
  });
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

// Build full URL using BASE_URL + path (if path is relative)
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
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  return headers;
}

// Default response error normalization interceptor
useResponse(async ({ response, request }) => {
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
