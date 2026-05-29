import { api } from "./api";
/*
 * Get PNR queue lists
 * GET /api/v1/pnrs
 *
 * @param {Object} params
 */
export async function getPnrQueueList(params = {}) {
  const {
    page = 1,
    pageSize = 10,
    status,
    assignedTo,
    pnr,
    errorDetails,
    lastUpdatedFrom,
    lastUpdatedTo,
    queueArrivalFrom,
    queueArrivalTo,
    ttlFrom,
    ttlTo,
    sort,
  } = params;

  const qs = new URLSearchParams();

  qs.set("page", String(page));
  qs.set("pageSize", String(pageSize));

  if (status) qs.set("status", String(status));
  if (assignedTo) qs.set("assignedTo", String(assignedTo));
  if (pnr) qs.set("pnr", String(pnr));
  if (errorDetails) qs.set("errorDetails", String(errorDetails));

  if (lastUpdatedFrom) qs.set("lastUpdatedFrom", String(lastUpdatedFrom));
  if (lastUpdatedTo) qs.set("lastUpdatedTo", String(lastUpdatedTo));
  if (queueArrivalFrom) qs.set("queueArrivalFrom", String(queueArrivalFrom));
  if (queueArrivalTo) qs.set("queueArrivalTo", String(queueArrivalTo));
  if (ttlFrom) qs.set("ttlFrom", String(ttlFrom));
  if (ttlTo) qs.set("ttlTo", String(ttlTo));

  if (sort) qs.set("sort", String(sort));

  return api.get(`/api/v1/pnrs?${qs.toString()}`);
}

/*
 * Get single PNR queue item
 * GET /api/v1/pnrs/{pnrId}/queue-item
 *
 * @param {string} pnrId
 */
export function getPnrQueueItem(pnrId) {
  return api.get(`/api/v1/pnrs/${encodeURIComponent(pnrId)}/queue-item`);
}

/*
 * Get PNR details
 * GET /api/v1/pnrs/{pnrId}
 *
 * @param {string} pnrId
 */
export function getPnrDetails(pnrId) {
  return api.get(`/api/v1/pnrs/${encodeURIComponent(pnrId)}`);
}

/*
 * Assign PNR(s)
 * POST /api/v1/pnrs/assign
 *
 * @param {string} pnrId
 * @param {Object} payload
 */
export async function patchAssignPnr(pnrId, payload) {
  return api.patch(`/api/v1/pnrs/${encodeURIComponent(pnrId)}/assign`, payload);
}

/*
 * Set Pnr TTL
 * POST /api/v1/pnrs/ttl
 *
 * @param {string} pnrId
 * @param {Object} ttlUtc
 */
export async function patchTtlPnr(pnrId, payload) {
  return api.patch(`/api/v1/pnrs/${encodeURIComponent(pnrId)}/ttl`, payload);
}

/*
 * Move PNR to another queue
 * POST /api/v1/pnrs/{pnrId}/move-queue
 *
 * @param {string} pnrId
 * @param {Object} payload
 */
export function movePnrToQueue(pnrId, payload) {
  return api.post(
    `/api/v1/pnrs/${encodeURIComponent(pnrId)}/move-queue`,
    payload,
  );
}

/*
 * Retry PNR processing
 * POST /api/v1/pnrs/{pnrId}/retry
 *
 * @param {string} pnrId
 * @param {Object} payload
 */
export function retryPnrProcessing(pnrId, payload = {}) {
  return api.post(`/api/v1/pnrs/${encodeURIComponent(pnrId)}/retry`, payload);
}

/*
 * Send PNR to OASIS queue
 * POST /api/v1/pnrs/{pnrId}/send-to-oasis
 *
 * @param {string} pnrId
 * @param {Object} payload
 */
export function sendPnrToOasis(pnrId, payload = {}) {
  return api.post(
    `/api/v1/pnrs/${encodeURIComponent(pnrId)}/send-to-oasis`,
    payload,
  );
}

/*
 * Remove PNR from queue
 * POST /api/v1/pnrs/{pnrId}/remove-from-queue
 *
 * @param {string} pnrId
 * @param {Object} payload
 */
export function removePnrFromQueue(pnrId, payload) {
  return api.post(
    `/api/v1/pnrs/${encodeURIComponent(pnrId)}/remove-from-queue`,
    payload,
  );
}

/*
 * Build AE for a specific EMD-S
 * POST /api/v1/emd-s/{emdItemId}/build-ae
 *
 * @param {string} emdItemId
 * @param {Object} payload
 */
export function postBuildAeForEmd(pnrId, payload) {
  return api.post(
    `/api/v1/pnrs/${encodeURIComponent(pnrId)}/build-ae`,
    payload,
  );
}

/*
 * Process PNR
 * POST /api/v1/pnrs/{pnrId}/process
 *
 * @param {string} pnrId
 * @param {Object} payload
 */
export function postProcessPNR(pnrId, payload = {}) {
  return api.post(`/api/v1/pnrs/${encodeURIComponent(pnrId)}/process`, payload);
}

/*
 * Error Queue Actions
 * POST /api/v1/pnrs/{pnr_id}/queue-action
 *
 * @param {string} pnrId
 * @param {Object} payload
 */
export function postQueueActions(pnrId, payload = {}) {
  return api.post(
    `/api/v1/pnrs/${encodeURIComponent(pnrId)}/queue-action`,
    payload,
  );
}

/*
 * Log UI action
 * POST /api/v1/logs/ui-actions.
 */
export function logUiAction(payload) {
  return api.post("/api/v1/logs/ui-actions", payload);
}

// -------------------------
// PNRDetails API helpers (moved from PNRDetailsV4.js)
// Keeps existing endpoints/methods/error-shape + AbortController support
// -------------------------

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

// Feedback (ADM) API
function buildEmdFeedbackUrl(emdId) {
  const id = encodeURIComponent(emdId || "");
  const path = `/api/v1/pnrs/emd-items/${id}/feedback`;
  return API_BASE ? `${API_BASE}${path}` : path;
}

// Build AE API
function buildBuildAeUrl(pnrId) {
  const id = encodeURIComponent(pnrId || "");
  const path = `/api/v1/pnrs/${id}/build-ae`;
  return API_BASE ? `${API_BASE}${path}` : path;
}

// Process PNR API
function buildProcessPnrUrl(pnrId) {
  const id = encodeURIComponent(pnrId ?? "");
  const path = `/api/v1/pnrs/${id}/process`;
  return API_BASE ? `${API_BASE}${path}` : path;
}

async function parseJsonOrEmpty(res) {
  const txt = await res.text().catch(() => "");
  try {
    return txt ? JSON.parse(txt) : {};
  } catch {
    return {};
  }
}

async function throwHttpError(res) {
  const text = await res.text().catch(() => "");
  const err = new Error(
    `HTTP ${res.status} ${res.statusText}${text ? ` â€” ${text}` : ""}`,
  );
  err.status = res.status;
  throw err;
}

export function getEmdFeedbackId(emd) {
  // Prefer server-side identifiers
  const id = emd?.emdItemId ?? emd?.ancillaryItemId;
  if (id != null && String(id).trim() !== "") return id;

  // Fallback to EMD number if it looks valid (best-effort)
  const no = emd?.emdNo;
  if (no && no !== "â€”" && String(no).trim() !== "") return no;

  return null;
}

export async function patchEmdFeedback(emdId, payload, { signal } = {}) {
  const url = buildEmdFeedbackUrl(emdId);
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
    signal,
  });

  if (!res.ok) await throwHttpError(res);
  return parseJsonOrEmpty(res);
}
