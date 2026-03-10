import { api } from "./api";
/*
 * Get PNR queue lists
 * GET /api/v1/pnrs
 *
 * @param {Object} params
 */
export function getPnrQueueList(params = {}) {
  return api.get("/api/v1/pnrs", params);
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
export function assignPnrs(payload) {
  return api.post("/api/v1/pnrs/assign", payload);
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
export function buildAeForEmd(emdItemId, payload) {
  return api.post(
    `/api/v1/emd-s/${encodeURIComponent(emdItemId)}/build-ae`,
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
export function processPnr(pnrId, payload = {}) {
  return api.post(`/api/v1/pnrs/${encodeURIComponent(pnrId)}/process`, payload);
}

/*
 * Log UI action
 * POST /api/v1/logs/ui-actions.
 */
export function logUiAction(payload) {
  return api.post("/api/v1/logs/ui-actions", payload);
}
