import { useEffect, useMemo, useRef, useState } from "react";

// Components
import StatusBadge from "./StatusBadge";
import Field from "./Field";
import Spinner from "./Spinner";
import ToastViewport from "./ToastViewport";
import Collapse from "./Collapse";
import FadeIn from "./FadeIn";
import PNRDetailsActionBar from "./PNRDetailsActionBar";

// Utils
import formatDate from "../utils/helper";

// -------------------------
// Helpers
// -------------------------
const normalize = (v) => (v ?? "").toString().trim();
const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

function safeUpper(v) {
  return normalize(v).toUpperCase();
}

function statusToComparable(v) {
  // supports: HUMAN_INPUT_REQUIRED, Human Input Required, human_input_required
  return normalize(v)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getEmdDiff(current, baseline) {
  const diffs = [];
  if (normalize(current.rfic) !== normalize(baseline.rfic)) {
    diffs.push({
      field: "RFIC",
      from: baseline.rfic || "—",
      to: current.rfic || "—",
    });
  }
  if (normalize(current.rfisc) !== normalize(baseline.rfisc)) {
    diffs.push({
      field: "RFISC",
      from: baseline.rfisc || "—",
      to: current.rfisc || "—",
    });
  }
  if (normalize(current.emdDesc) !== normalize(baseline.emdDesc)) {
    diffs.push({
      field: "EMD Desc",
      from: baseline.emdDesc || "—",
      to: current.emdDesc || "—",
    });
  }
  return diffs;
}

function extractOtherInfoSabre(data) {
  try {
    const traveler = data?.travelers?.[0] || {};
    const anc = traveler?.ancillaries?.[0] || {};

    const candidates = [
      anc?.otherInfo,
      anc?.otherInformation,
      anc?.extendedInfo?.description,
      anc?.attributes?.otherInfo,
      traveler?.remarks,
      data?.remarks,
      data?.notes,
      data?.request?.remarks,
      data?.flights?.[0]?.remarks,
    ].filter(Boolean);

    if (Array.isArray(candidates[0])) {
      const firstString = candidates[0].find((v) => typeof v === "string");
      if (firstString) return firstString;
    }

    const val = candidates.find((v) => typeof v === "string");
    return val || "—";
  } catch {
    return "—";
  }
}

function stopIfInteractive(e) {
  const el = e.target;
  if (
    el.closest(
      'input, select, textarea, a, [role="button"], [data-stop-collapse]',
    )
  ) {
    e.stopPropagation();
  }
}

/**
 * Notes / Suggestions helper (Human Input Required only)
 * - Not a field, no user input
 * - Shows guidance for RFIC / RFISC / EMD Desc
 * - Includes a useful airline code lookup link
 */
const AIRLINE_CODE_LOOKUP_URL =
  "https://www.iata.org/en/publications/directories/code-search/";

/** Very lightweight heuristics (safe + helpful, without hardcoding airline-specific mappings) */
function buildEmdSuggestions({ rfic, rfisc, emdDesc }) {
  const list = [];
  const rficVal = normalize(rfic);
  const rfiscVal = normalize(rfisc);
  const descVal = normalize(emdDesc);

  // Basic format checks
  if (!rficVal) {
    list.push({
      variant: "warn",
      text: "RFIC is empty — provide a 1-character RFIC value.",
    });
  } else if (rficVal.length !== 1) {
    list.push({
      variant: "warn",
      text: `RFIC should typically be 1 character (current: "${rficVal}").`,
    });
  } else {
    list.push({
      variant: "ok",
      text: `RFIC format looks OK (current: "${rficVal}").`,
    });
  }

  if (!rfiscVal) {
    list.push({
      variant: "warn",
      text: "RFISC is empty — provide a 3-character RFISC value.",
    });
  } else if (rfiscVal.length !== 3) {
    list.push({
      variant: "warn",
      text: `RFISC should typically be 3 characters (current: "${rfiscVal}").`,
    });
  } else {
    list.push({
      variant: "ok",
      text: `RFISC format looks OK (current: "${rfiscVal}").`,
    });
  }

  // EMD description checks
  if (!descVal) {
    list.push({
      variant: "warn",
      text: "EMD Desc is empty — add a clear commercial name / description.",
    });
  } else {
    list.push({
      variant: "ok",
      text: `Ensure EMD Desc matches the intended ancillary (current: "${descVal}").`,
    });
  }

  // Consistency suggestion
  list.push({
    variant: "info",
    text: "Tip: Keep RFIC/RFISC aligned with the EMD Desc wording to avoid mismatched subcodes.",
  });

  return list;
}

// Coerce aiSuggestions from API into a clean array of strings
function coerceAiSuggestions(value) {
  if (value == null) return [];

  // Array of strings or objects
  if (Array.isArray(value)) {
    return value
      .flatMap((v) => {
        if (typeof v === "string") return [v];
        if (v && typeof v === "object") {
          const cand = [v.text, v.suggestion, v.message, v.value].find(
            (x) => typeof x === "string" && normalize(x),
          );
          return cand ? [cand] : [];
        }
        return [];
      })
      .map((s) => normalize(s))
      .filter(Boolean);
  }

  // Single string (split into bullets/lines if applicable)
  if (typeof value === "string") {
    const parts = value
      .split(/\r?\n|•|\u2022|;+/g)
      .map((s) => normalize(s))
      .filter(Boolean);
    return parts.length ? parts : [normalize(value)];
  }

  // Single object
  if (typeof value === "object") {
    return [value.text, value.suggestion, value.message, value.value]
      .filter((x) => typeof x === "string")
      .map((s) => normalize(s))
      .filter(Boolean);
  }

  return [];
}

// Extract LLM metrics (accuracy, consistency, coherence, groundedness) from API shapes.
function coerceLlmMetrics(value) {
  // Accept a variety of shapes:
  // - { metrics: { accuracy, consistency, coherence, groundedness } }
  // - { llmMetrics: { ... } }
  // - { accuracy, consistency, coherence, groundedness }
  // - [{ metrics: {...}}] (pick first)
  const pickNum = (v) => {
    if (v == null) return null;
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (typeof v === "string") {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  const tryObj = (obj) => {
    if (!obj || typeof obj !== "object") return null;
    const m = obj.metrics || obj.llmMetrics || obj;
    const out = {
      accuracy: pickNum(m.confidence),
      consistency: pickNum(m.consistency),
      coherence: pickNum(m.coherence),
      groundedness: pickNum(m.groundedness),
    };
    const hasAny = Object.values(out).some((v) => v != null);
    return hasAny ? out : null;
  };
  if (Array.isArray(value)) {
    for (const item of value) {
      const got = tryObj(item);
      if (got) return got;
    }
    return null;
  }
  return tryObj(value);
}

// Extract knowledge sources / ground-truth citations from API shapes.
function coerceKnowledgeSources(value) {
  // Accept a variety of shapes:
  // - { citations: [{ title, url }] }
  // - { knowledgeSources: [...] }
  // - { sources: [...] }
  // - array of strings/objects
  const normalizeUrl = (u) => {
    const s = normalize(u);
    return s ? s : null;
  };
  const toItem = (v) => {
    if (typeof v.source_article === "string") {
      const url = normalizeUrl(v.source_article);
      return url ? { title: url, url } : null;
    }
    if (v && typeof v === "object") {
      const url = normalizeUrl(v.source_url || v.source_link);
      const title = normalize(v.source_article);
      return url ? { title: title || url, url } : null;
    }
    return null;
  };
  const root = value && typeof value === "object";
  const arr = Array.isArray(root) ? root : [];
  const out = [];
  for (const v of arr) {
    const item = toItem(v.source_article);
    if (item) out.push(item);
  }
  // de-dupe by url
  const seen = new Set();
  return out.filter((it) => {
    if (seen.has(it.url)) return false;
    seen.add(it.url);
    return true;
  });
}
// -------------------------
// API mapping
// -------------------------
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

function buildPnrDetailsUrl(pnrId) {
  const id = encodeURIComponent(pnrId || "");
  const path = `/api/v1/pnrs/${id}`;
  return API_BASE ? `${API_BASE}${path}` : path;
}

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

async function postBuildAE(pnrId, payload, { signal } = {}) {
  const url = buildBuildAeUrl(pnrId);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload || {}),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(
      `HTTP ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`,
    );
    err.status = res.status;
    throw err;
  }

  const txt = await res.text().catch(() => "");
  try {
    return txt ? JSON.parse(txt) : {};
  } catch {
    return {};
  }
}

function getEmdFeedbackId(emd) {
  // Prefer server-side identifiers
  const id = emd?.emdItemId ?? emd?.ancillaryItemId;
  if (id != null && String(id).trim() !== "") return id;
  // Fallback to EMD number if it looks valid (best-effort)
  const no = emd?.emdNo;
  if (no && no !== "—" && String(no).trim() !== "") return no;
  return null;
}

async function patchEmdFeedback(emdId, payload, { signal } = {}) {
  const url = buildEmdFeedbackUrl(emdId);
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload || {}),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(
      `HTTP ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`,
    );
    err.status = res.status;
    throw err;
  }

  // Some PATCH endpoints may return empty responses
  const txt = await res.text().catch(() => "");
  try {
    return txt ? JSON.parse(txt) : {};
  } catch {
    return {};
  }
}

function pickOtherInfoFromApi(pnrApi) {
  const passengers = pnrApi?.passengers || [];
  for (const pax of passengers) {
    const emds = pax?.emdItems || [];
    for (const emd of emds) {
      const oi = emd?.otherInfo;
      if (typeof oi === "string" && normalize(oi)) return oi;
    }
  }
  return "—";
}

function mapApiToPnrDetails(pnrApi) {
  const header = pnrApi?.header || {};
  const flights = Array.isArray(pnrApi?.flights) ? pnrApi.flights : [];
  const passengersRaw = Array.isArray(pnrApi?.passengers)
    ? pnrApi.passengers
    : [];

  const flightById = new Map();
  flights.forEach((f) => {
    if (f?.flightId != null) flightById.set(f.flightId, f);
  });

  const pnrId = pnrApi?.pnrId || header?.pnrId;
  const createdUtc =
    header?.bookingCreatedUtc || header?.bookingCreated || header?.createdUtc;

  const common = {
    // existing UI fields
    pnr: pnrId,
    bookingId: header?.bookingId,
    isTicketed: header?.isTicketed,
    agencyIata: header?.agencyIataNumber,
    pcc: header?.userWorkPcc || header?.displayPcc || header?.userHomePcc,
    created: createdUtc,
    contactEmail: passengersRaw?.[0]?.primaryEmail || "—",
    contactPhone: passengersRaw?.[0]?.primaryPhoneNumber || "—",
    otherInfo: pickOtherInfoFromApi(pnrApi),
    errorDesc: pnrApi?.errorDetails || null,
    documentType: header?.documentType || "EMD",
    brand: header?.brandCode || "—",
    gds: header?.gds || "—",

    // keep extra fields from API (non-breaking)
    status: pnrApi?.status,
    stage: pnrApi?.stage,
    actionRequired: pnrApi?.actionRequired,
    assignedTo: pnrApi?.assignedTo,
    assignedBy: pnrApi?.assignedBy,
    header,
    flights,
  };

  const passengers = passengersRaw.map((pax) => {
    const paxFlights = Array.isArray(pax?.passengerFlights)
      ? pax.passengerFlights
      : [];
    const firstPaxFlight = paxFlights[0] || {};
    const linkedFlight =
      flightById.get(firstPaxFlight.flightId) || flights[0] || {};

    const flightNo =
      `${linkedFlight?.airlineCode || ""} ${linkedFlight?.flightNumber || ""}`.trim();
    const operating =
      `${linkedFlight?.operatingAirlineCode || ""} ${linkedFlight?.operatingFlightNumber || ""}`.trim();
    const route =
      `${linkedFlight?.origin || ""} → ${linkedFlight?.destination || ""}`.trim();
    const dep = linkedFlight?.departureDatetimeUtc || "";
    const arr = linkedFlight?.arrivalDatetimeUtc || "";
    const seat = firstPaxFlight?.seatNumber || "—";

    const emdItems = Array.isArray(pax?.emdItems) ? pax.emdItems : [];

    const emds = emdItems.map((item) => {
      const aeStatus = safeUpper(item?.aeBuildStatus);

      // Editable only if PNR is HUMAN_INPUT_REQUIRED and AE Build Status is PENDING
      // (exact requirement) — keep computed editable flag for existing logic.
      const editable = aeStatus === "PENDING";

      // Consider anything not PENDING as already built (non-editable path)
      const built = aeStatus && aeStatus !== "PENDING";

      const totalAmount = item?.totalAmount ?? item?.subtotalAmount;
      const currencyCode = item?.currencyCode;
      const emdTotal =
        normalize(totalAmount) && normalize(currencyCode)
          ? `${totalAmount} ${currencyCode}`
          : normalize(totalAmount)
            ? `${totalAmount}`
            : "—";

      const emdNo =
        item?.emdNumber ||
        item?.aeNumber ||
        item?.ancillaryItemId ||
        item?.emdItemId ||
        "—";

      const rfic = item?.rfic || "";
      const rfisc = item?.rfisc || "";
      const emdDesc = item?.emdDesc || item?.commercialName || "";

      const emd = {
        emdNo,
        emdStatus: item?.emdStatusName || item?.emdStatusCode || "—",
        emdTotal,
        rfic,
        rfisc,
        emdDesc,
        baseline: { rfic, rfisc, emdDesc },
        built,
        editable,
        notes: "",
        adm: {
          isAdm: item?.isAdm != null ? Boolean(item.isAdm) : false,
          feedback: item?.feedback ?? "",
          submitted: item?.isAdm != null || item?.feedback != null,
        },

        // keep API fields (non-breaking)
        emdItemId: item?.emdItemId,
        ancillaryItemId: item?.ancillaryItemId,
        commercialName: item?.commercialName,
        numberOfItems: item?.numberOfItems,
        rficName: item?.rficName,
        airlineCode: item?.airlineCode,
        vendorCode: item?.vendorCode,
        isRefundable: item?.isRefundable,
        isCommissionable: item?.isCommissionable,
        flightApplicabilityType: item?.flightApplicabilityType,
        emdStatusCode: item?.emdStatusCode,
        subtotalAmount: item?.subtotalAmount,
        taxesAmount: item?.taxesAmount,
        totalAmount: item?.totalAmount,
        feesAmount: item?.feesAmount,
        netRemitAmount: item?.netRemitAmount,
        currencyCode: item?.currencyCode,
        aeNumber: item?.aeNumber,
        aeBuildStatus: item?.aeBuildStatus,
        aeBuiltUtc: item?.aeBuiltUtc,
        aiSuggestions: item?.aiSuggestions,
        buildFeedback: item?.buildFeedback,
        reviewedBy: item?.reviewedBy,
        reviewedAtUtc: item?.reviewedAtUtc,
        isAdm: item?.isAdm,
        feedback: item?.feedback,
        otherInfo: item?.otherInfo,
      };

      // If it is editable (PENDING), treat it as not built
      if (editable) emd.built = false;

      return emd;
    });

    const paxName =
      pax?.fullName ||
      `${pax?.surname || ""} ${pax?.givenName || ""}`.trim() ||
      "—";

    return {
      name: paxName,
      ticketNo: pax?.ticketNo || pax?.ticketNumber || "—",
      travelerName: paxName,
      ...common,
      flightNo: flightNo || "—",
      operating: operating || "—",
      route: route || "—",
      dep,
      arr,
      seat,
      ssrCode: "—",
      emds,

      // keep passenger API fields (non-breaking)
      passengerId: pax?.passengerId,
      travelerIndex: pax?.travelerIndex,
      givenName: pax?.givenName,
      middleName: pax?.middleName,
      surname: pax?.surname,
      fullName: pax?.fullName,
      birthDate: pax?.birthDate,
      gender: pax?.gender,
      travelerType: pax?.travelerType,
      passengerCode: pax?.passengerCode,
      nameAssociationId: pax?.nameAssociationId,
      nameReferenceCode: pax?.nameReferenceCode,
      isGrouped: pax?.isGrouped,
      primaryEmail: pax?.primaryEmail,
      primaryPhoneNumber: pax?.primaryPhoneNumber,
      passengerFlights: paxFlights,
      emdItems,
    };
  });

  return { ...common, passengers, raw: pnrApi };
}

async function fetchPnrDetails(pnrId, { signal } = {}) {
  const url = buildPnrDetailsUrl(pnrId);
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(
      `HTTP ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`,
    );
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// -------------------------
// Component
// -------------------------
export default function PNRDetails({
  selected,
  onApprove,
  onRetry,
  onRemoveFromQueue,
  onSendToQueue,
  onProcessPNR,
  loggedInUserName,
}) {
  const [pnrDetails, setPnrDetails] = useState(null);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);

  // Build AE (per-EMD) modal
  const [isBuildModalOpen, setIsBuildModalOpen] = useState(false);
  const [isBuildSubmitting, setIsBuildSubmitting] = useState(false);
  const [buildChanges, setBuildChanges] = useState([]);
  const [buildNotes, setBuildNotes] = useState("");
  const buildTargetRef = useRef({ passengerIndex: -1, emdIndex: -1 });

  // Process PNR
  const [isProcessSubmitting, setIsProcessSubmitting] = useState(false);

  // ADM confirmation
  const [isAdmConfirmOpen, setIsAdmConfirmOpen] = useState(false);
  const [isAdmSubmitting, setIsAdmSubmitting] = useState(false);
  const admTargetRef = useRef({ passengerIndex: -1, emdIndex: -1 });

  // Remove from Queue confirmation
  const [isRemoveConfirmOpen, setIsRemoveConfirmOpen] = useState(false);

  // View PNR JSON modal
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isViewLoading, setIsViewLoading] = useState(false);
  const [viewError, setViewError] = useState("");
  const [viewJson, setViewJson] = useState(null);

  // Accordion open passenger index
  const [openPassengerIndex, setOpenPassengerIndex] = useState(-1);

  // -------------------------
  // Toasts (ToastViewport)
  // -------------------------
  const [toasts, setToasts] = useState([]);
  const toastTimersRef = useRef({});

  const dismissToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    if (toastTimersRef.current[id]) {
      clearTimeout(toastTimersRef.current[id]);
      delete toastTimersRef.current[id];
    }
  };

  const pushToast = ({ type = "info", message = "", ttl = 3000 }) => {
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    setToasts((prev) => [...prev, { id, type, message }]);

    if (ttl > 0) {
      toastTimersRef.current[id] = setTimeout(() => {
        dismissToast(id);
      }, ttl);
    }

    return id;
  };

  // Backward-compatible wrapper so you don't need to update all call sites
  const showToast = ({
    variant = "info",
    ariaLabel = "",
    title = "",
    ttl = 3000,
  }) => {
    const type =
      variant === "error"
        ? "error"
        : variant === "success"
          ? "success"
          : "info";
    const message = title || ariaLabel || "";
    return pushToast({ type, message, ttl });
  };

  useEffect(() => {
    return () => {
      Object.values(toastTimersRef.current).forEach((t) => clearTimeout(t));
      toastTimersRef.current = {};
    };
  }, []);

  // -------------------------
  // Safe handler fallbacks
  // -------------------------
  const callbacks = {
    retry: onRetry ?? (() => {}),
    removeFromQueue: onRemoveFromQueue ?? (() => {}),
    sendToQueue: onSendToQueue ?? (() => {}),
    processPNR: onProcessPNR ?? (() => {}),
  };

  // Status helpers
  const statusSource = pnrDetails?.status ?? selected?.status ?? "";
  const statusComparable = statusToComparable(statusSource);

  const isHumanRequired =
    statusComparable === "human" || statusComparable === "human input required";
  const isProcessed = statusComparable === "processed";
  const isError = statusComparable.includes("error");

  // Error details text
  const errorDetailsText =
    selected?.errorDetails ||
    selected?.errorDesc ||
    pnrDetails?.errorDetails ||
    pnrDetails?.errorDesc ||
    "";

  const showErrorPanel = isError && !!normalize(errorDetailsText);

  // -------------------------
  // Load details (API first, fall back to existing mock behavior)
  // -------------------------
  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function load() {
      if (!selected) {
        setPnrDetails(null);
        setIsDetailsLoading(false);
        return;
      }

      // Show loading state while switching PNRs
      setIsDetailsLoading(true);
      setPnrDetails(null);

      // 1) Try API (integrated)
      try {
        const api = await fetchPnrDetails(selected.pnr, {
          signal: controller.signal,
        });
        if (!active) return;
        const mapped = mapApiToPnrDetails(api);

        // Enforce editability rule exactly: only when PNR is HUMAN_INPUT_REQUIRED and emd.aeBuildStatus === PENDING
        const statusComp = statusToComparable(
          mapped?.status ?? selected?.status,
        );
        const isHuman =
          statusComp === "human" || statusComp === "human input required";
        if (mapped?.passengers?.length) {
          mapped.passengers.forEach((pax) => {
            (pax.emds || []).forEach((emd) => {
              const aeStatus = safeUpper(emd?.aeBuildStatus);
              emd.editable = isHuman && aeStatus === "PENDING";
              emd.built = emd.editable ? false : true;
              // Preserve baseline values from initial load
              if (!emd.baseline)
                emd.baseline = {
                  rfic: emd.rfic,
                  rfisc: emd.rfisc,
                  emdDesc: emd.emdDesc,
                };
            });
          });
        }

        setPnrDetails(mapped);
        setIsDetailsLoading(false);
        return;
      } catch (e) {
        // fall back to existing mock behavior (retain)
        console.warn("PNR details API load failed; falling back to mock.", e);
      }

      // 2) Existing mock behavior
      try {
        if (selected.pnr === "GLEBNY") {
          const res = await fetch("/data/sabre-booking.json", {
            signal: controller.signal,
          });
          const data = await res.json();
          if (!active) return;

          const traveler = data?.travelers?.[0] || {};
          const anc = traveler?.ancillaries?.[0] || {};
          const flight = data?.flights?.[0] || {};
          const emdTotals = anc?.totals || {};
          const contactEmail = (data?.contactInfo?.emails || [])[0];
          const contactPhone = (data?.contactInfo?.phones || [])[0];
          const ticket0 = (data?.flightTickets || [])[0] || {};
          const ssr = (data?.specialServices || [])[0] || {};

          const common = {
            pnr: data?.request?.confirmationId || selected.pnr,
            bookingId: data?.bookingId,
            isTicketed: data?.isTicketed,
            agencyIata: data?.creationDetails?.agencyIataNumber,
            pcc: data?.creationDetails?.userWorkPcc,
            created:
              `${data?.creationDetails?.creationDate || ""} ${data?.creationDetails?.creationTime || ""}`.trim(),
            contactEmail,
            contactPhone,
            otherInfo: extractOtherInfoSabre(data),
            errorDesc: data?.errors?.[0]?.description,
            flightNo:
              `${flight?.airlineCode || ""} ${flight?.flightNumber || ""}`.trim(),
            operating:
              `${flight?.operatingAirlineCode || ""} ${flight?.operatingFlightNumber || ""}`.trim(),
            route: `${flight?.fromAirportCode || ""} → ${flight?.toAirportCode || ""}`,
            dep: `${flight?.updatedDepartureDate || flight?.departureDate || ""} ${flight?.updatedDepartureTime || flight?.departureTime || ""}`.trim(),
            arr: `${flight?.updatedArrivalDate || flight?.arrivalDate || ""} ${flight?.updatedArrivalTime || flight?.arrivalTime || ""}`.trim(),
            seat: flight?.seats?.[0]?.number || "-",
            ssrCode: ssr?.code || "",
            documentType: "EMD",
            brand: "ECO FLEX",
            gds: "SABRE",
          };

          const pax1Name =
            `${traveler?.givenName || ""} ${traveler?.middleName || ""} ${traveler?.surname || ""}`
              .replace(/\s+/g, " ")
              .trim() || "DOE/JOHN";
          const pax1Ticket = ticket0?.number || "0167489825830";

          const emd1 = {
            emdNo:
              anc?.electronicMiscellaneousDocumentNumber || "6074333222111",
            emdStatus: anc?.statusName || "Confirmed",
            emdTotal:
              `${emdTotals?.total || "128.00"} ${emdTotals?.currencyCode || "USD"}`.trim(),
            rfic: anc?.reasonForIssuanceCode || "C",
            rfisc: anc?.subcode || "05Z",
            emdDesc: anc?.commercialName || "UPTO33LB 15KG BAGGAGE",
            baseline: null,
            built: true,
            editable: false,
            notes: "",
            adm: { isAdm: false, feedback: "", submitted: false },
          };
          emd1.baseline = {
            rfic: emd1.rfic,
            rfisc: emd1.rfisc,
            emdDesc: emd1.emdDesc,
          };

          const pax2Name = "Jane Smith";
          const pax2Ticket = "0167489825831";

          const emd2a = {
            emdNo: "6074333222112",
            emdStatus: "On Hold",
            emdTotal: "45.00 USD",
            rfic: "C",
            rfisc: "07B",
            emdDesc: "PREPAID SEAT 17B",
            baseline: null,
            built: false,
            editable: true,
            notes: "",
            adm: { isAdm: false, feedback: "", submitted: false },
          };
          emd2a.baseline = {
            rfic: emd2a.rfic,
            rfisc: emd2a.rfisc,
            emdDesc: emd2a.emdDesc,
          };

          const emd2b = {
            emdNo: "6074333222113",
            emdStatus: "On Hold",
            emdTotal: "30.00 USD",
            rfic: "C",
            rfisc: "0BG",
            emdDesc: "EXTRA BAG 10KG",
            baseline: null,
            built: false,
            editable: true,
            notes: "",
            adm: { isAdm: false, feedback: "", submitted: false },
          };
          emd2b.baseline = {
            rfic: emd2b.rfic,
            rfisc: emd2b.rfisc,
            emdDesc: emd2b.emdDesc,
          };

          setPnrDetails({
            ...common,
            passengers: [
              {
                name: pax1Name,
                ticketNo: pax1Ticket,
                travelerName: pax1Name,
                ...common,
                emds: [emd1],
              },
              {
                name: pax2Name,
                ticketNo: pax2Ticket,
                travelerName: pax2Name,
                ...common,
                emds: [emd2a, emd2b],
              },
            ],
          });
        } else {
          const common = {
            pnr: selected.pnr,
            bookingId: "1SXXX1A2B3C4D",
            isTicketed: true,
            agencyIata: "99119911",
            pcc: "AB12",
            created: "2024-01-09 15:00",
            contactEmail: "travel@sabre.com",
            contactPhone: "+1-555-123-4567",
            otherInfo: "Unassisted minor international",
            errorDesc: selected?.errorDesc,
            flightNo: "AA 123",
            operating: "UA 321",
            route: "DFW → HNL",
            dep: "2024-07-09 09:25",
            arr: "2024-07-09 12:38",
            seat: "13A",
            ssrCode: "WCHR",
            documentType: "EMD",
            brand: "ECO FLEX",
            gds: "SABRE",
          };

          const pax1 = {
            name: selected.passenger || "DOE/JOHN",
            ticketNo: "0167489825830",
            travelerName: selected.passenger || "DOE/JOHN",
            ...common,
            emds: [
              {
                emdNo: "6074333222111",
                emdStatus: "Confirmed",
                emdTotal: "128.00 USD",
                rfic: "C",
                rfisc: "05Z",
                emdDesc: "UPTO33LB 15KG BAGGAGE",
                baseline: {
                  rfic: "C",
                  rfisc: "05Z",
                  emdDesc: "UPTO33LB 15KG BAGGAGE",
                },
                built: true,
                editable: false,
                notes: "",
                adm: { isAdm: false, feedback: "", submitted: false },
              },
            ],
          };

          const pax2 = {
            name: "Jane Smith",
            ticketNo: "0167489825831",
            travelerName: "Jane Smith",
            ...common,
            emds: [
              {
                emdNo: "6074333222112",
                emdStatus: "On Hold",
                emdTotal: "45.00 USD",
                rfic: "C",
                rfisc: "07B",
                emdDesc: "PREPAID SEAT 17B",
                baseline: {
                  rfic: "C",
                  rfisc: "07B",
                  emdDesc: "PREPAID SEAT 17B",
                },
                built: false,
                editable: true,
                notes: "",
                adm: { isAdm: false, feedback: "", submitted: false },
              },
              {
                emdNo: "6074333222113",
                emdStatus: "On Hold",
                emdTotal: "30.00 USD",
                rfic: "C",
                rfisc: "0BG",
                emdDesc: "EXTRA BAG 10KG",
                baseline: {
                  rfic: "C",
                  rfisc: "0BG",
                  emdDesc: "EXTRA BAG 10KG",
                },
                built: false,
                editable: true,
                notes: "",
                adm: { isAdm: false, feedback: "", submitted: false },
              },
            ],
          };

          setPnrDetails({ ...common, passengers: [pax1, pax2] });
        }
        setIsDetailsLoading(false);
      } catch (e) {
        const msg = `Failed to load details: ${e?.message || "Unknown error"}`;
        showToast({ variant: "error", ariaLabel: msg, title: msg });
      }
    }

    load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [selected]);

  // Auto-expand the passenger that needs attention (Human Input Required)
  useEffect(() => {
    if (!pnrDetails?.passengers) return;

    if (!isHumanRequired) {
      setOpenPassengerIndex(-1);
      return;
    }

    const idx = pnrDetails.passengers.findIndex((passenger) =>
      (passenger.emds || []).some((emd) => emd.editable && !emd.built),
    );

    setOpenPassengerIndex(idx >= 0 ? idx : 0);
  }, [pnrDetails, isHumanRequired]);

  const inputsNeeded = useMemo(() => {
    if (!isHumanRequired || !pnrDetails?.passengers?.length) return [];
    const list = [];

    pnrDetails.passengers.forEach((passenger, passengerIndex) => {
      (passenger.emds || []).forEach((emd, emdIndex) => {
        if (emd.editable && !emd.built) {
          list.push({
            key: `${passengerIndex}-${emdIndex}`,
            passenger: passenger.name,
            label: `EMD ${emdIndex + 1}: RFIC, RFISC, EMD Desc`,
            passengerIndex,
            emdIndex,
          });
        }
      });
    });

    return list;
  }, [pnrDetails, isHumanRequired]);

  const allEmdsBuilt = useMemo(() => {
    if (!pnrDetails?.passengers?.length) return false;
    return pnrDetails.passengers.every((passenger) =>
      (passenger.emds || []).every((emd) => !!emd.built),
    );
  }, [pnrDetails]);

  function handleFieldChange(passengerIndex, emdIndex, field, value) {
    setPnrDetails((prev) => {
      const next = deepClone(prev);
      next.passengers[passengerIndex].emds[emdIndex][field] = value;
      return next;
    });
  }

  function openBuildFor(passengerIndex, emdIndex) {
    buildTargetRef.current = { passengerIndex, emdIndex };

    const emd = pnrDetails.passengers[passengerIndex].emds[emdIndex];
    const diff = getEmdDiff(
      { rfic: emd.rfic, rfisc: emd.rfisc, emdDesc: emd.emdDesc },
      emd.baseline || { rfic: "", rfisc: "", emdDesc: "" },
    );

    setBuildChanges(diff);
    setBuildNotes("");
    setIsBuildModalOpen(true);
  }

  async function confirmBuildAE() {
    const { passengerIndex, emdIndex } = buildTargetRef.current;
    if (passengerIndex < 0 || emdIndex < 0) return;

    const pnrId = selected?.pnr || pnrDetails?.pnr;
    const passenger = pnrDetails?.passengers?.[passengerIndex];
    const emd = passenger?.emds?.[emdIndex];

    // Required identifiers for the Build AE endpoint
    const emdItemId = emd?.emdItemId || emd?.ancillaryItemId || null;
    const passengerId = passenger?.passengerId || null;

    if (!pnrId) {
      const msg = "Cannot build AE: missing PNR Id";
      showToast({ variant: "error", ariaLabel: msg, title: msg });
      return;
    }
    if (!emdItemId) {
      const msg = "Cannot build AE: missing EMD item id (emdItemId)";
      showToast({ variant: "error", ariaLabel: msg, title: msg });
      return;
    }
    if (!passengerId) {
      const msg = "Cannot build AE: missing passenger id (passengerId)";
      showToast({ variant: "error", ariaLabel: msg, title: msg });
      return;
    }

    // requested_by comes from the logged-in user in session
    const requestedBy = loggedInUserName || "";

    setIsBuildSubmitting(true);
    try {
      const payload = {
        emd_item_id: emdItemId,
        rfic: emd?.rfic || "",
        rfisc: emd?.rfisc || "",
        commercialName: emd?.emdDesc || "",
        feedback: buildNotes || "",
        requested_by: requestedBy,
      };

      await postBuildAE(pnrId, payload);

      // Update UI state (retain existing behavior)
      setPnrDetails((prev) => {
        const next = deepClone(prev);
        const target = next.passengers[passengerIndex].emds[emdIndex];

        target.baseline = {
          rfic: target.rfic,
          rfisc: target.rfisc,
          emdDesc: target.emdDesc,
        };
        target.built = true;

        // Keep API-mapped fields in sync (non-breaking)
        target.aeBuildStatus = target.aeBuildStatus || "BUILT";
        target.aeBuiltUtc = target.aeBuiltUtc || new Date().toISOString();

        return next;
      });

      setIsBuildModalOpen(false);
      setBuildChanges([]);
      setBuildNotes("");

      const passengerName = passenger?.name || "Passenger";
      showToast({
        variant: "success",
        ariaLabel: `AE built for ${passengerName}, EMD ${emdIndex + 1}`,
        title: `AE built for ${passengerName}, EMD ${emdIndex + 1}`,
      });

      buildTargetRef.current = { passengerIndex: -1, emdIndex: -1 };
    } catch (e) {
      const msg = `Failed to build AE: ${e?.message || "Unknown error"}`;
      showToast({ variant: "error", ariaLabel: msg, title: msg, ttl: 4500 });
    } finally {
      setIsBuildSubmitting(false);
    }
  }

  async function processPNR() {
    if (!allEmdsBuilt) return;

    setIsProcessSubmitting(true);
    try {
      // retain existing simulated latency
      await new Promise((r) => setTimeout(r, 700));

      callbacks.processPNR({
        pnr: selected.pnr,
        passengers: pnrDetails.passengers,
      });

      const first = pnrDetails.passengers?.[0]?.emds?.[0];
      if (first && onApprove) {
        onApprove({
          pnr: selected.pnr,
          rfic: first.rfic,
          rfisc: first.rfisc,
          emdDesc: first.emdDesc,
        });
      }

      showToast({
        variant: "success",
        ariaLabel: `PNR ${selected.pnr} processed`,
        title: `PNR ${selected.pnr} processed`,
      });
    } finally {
      setIsProcessSubmitting(false);
    }
  }

  function requestRemoveFromQueue() {
    setIsRemoveConfirmOpen(true);
  }

  function confirmRemoveFromQueue() {
    setIsRemoveConfirmOpen(false);
    callbacks.removeFromQueue(selected.pnr);

    showToast({
      variant: "info",
      ariaLabel: `PNR ${selected.pnr} removed from list`,
      title: `PNR ${selected.pnr} removed from list`,
    });
  }

  function cancelRemoveFromQueue() {
    setIsRemoveConfirmOpen(false);
  }

  function openAdmConfirm(passengerIndex, emdIndex) {
    admTargetRef.current = { passengerIndex, emdIndex };
    setIsAdmConfirmOpen(true);
  }

  async function confirmSubmitADM() {
    const { passengerIndex, emdIndex } = admTargetRef.current;
    if (passengerIndex < 0 || emdIndex < 0) return;

    const emd = pnrDetails?.passengers?.[passengerIndex]?.emds?.[emdIndex];
    const emdId = getEmdFeedbackId(emd);
    if (!emdId) {
      const msg = "Cannot submit feedback: missing EMD identifier (emdItemId)";
      showToast({ variant: "error", ariaLabel: msg, title: msg });
      return;
    }

    setIsAdmSubmitting(true);
    try {
      const payload = {
        isAdm: Boolean(emd?.adm?.isAdm),
        feedback: emd?.adm?.feedback ?? "",
      };

      await patchEmdFeedback(emdId, payload);

      setPnrDetails((prev) => {
        const next = deepClone(prev);
        const target = next.passengers[passengerIndex].emds[emdIndex];
        target.adm.submitted = true;
        // Keep API-mapped fields in sync (non-breaking)
        target.isAdm = payload.isAdm;
        target.feedback = payload.feedback;
        return next;
      });

      setIsAdmConfirmOpen(false);
      showToast({
        variant: "success",
        ariaLabel: `ADM feedback submitted for EMD ${emdIndex + 1}`,
        title: `ADM feedback submitted for EMD ${emdIndex + 1}`,
      });

      admTargetRef.current = { passengerIndex: -1, emdIndex: -1 };
    } catch (e) {
      const msg = `Failed to submit feedback: ${e?.message || "Unknown error"}`;
      showToast({ variant: "error", ariaLabel: msg, title: msg });
    } finally {
      setIsAdmSubmitting(false);
    }
  }

  function cancelSubmitADM() {
    setIsAdmConfirmOpen(false);
  }

  // View PNR modal logic
  async function openViewPNR() {
    setViewError("");
    setViewJson(null);
    setIsViewLoading(true);
    setIsViewModalOpen(true);

    try {
      // Prefer API snapshot if available
      if (selected?.pnr) {
        const json = await fetchPnrDetails(selected.pnr);
        setViewJson(json);
        return;
      }

      // fallback (retain existing)
      const res = await fetch("/data/sabre-booking.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setViewJson(json);
    } catch (e) {
      const msg = `Failed to load PNR snapshot: ${e?.message || "Unknown error"}`;
      setViewError(msg);
      showToast({ variant: "error", ariaLabel: msg, title: msg });
    } finally {
      setIsViewLoading(false);
    }
  }

  if (!selected) return null;

  return (
    <div className="pnr-details compact card mt-3 p-3 mb-6">
      {/* ToastViewport (replaces Toasts) */}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />

      {/* Header */}
      <div className="flex items-start justify-between">
        <h3 className="font-semibold text-lg flex items-center gap-2 flex-wrap">
          <span>
            <i className="fa-solid fa-ticket text-brand-red"></i> PNR Details •{" "}
            <span className="text-brand-red">{selected.pnr}</span>
          </span>

          {/* View PNR JSON */}
          <button
            className="btn btn-outline h-8 px-3 text-xs"
            type="button"
            onClick={openViewPNR}
            title="View raw PNR JSON snapshot"
          >
            <i className="fa-regular fa-eye mr-1"></i>
            View PNR
          </button>
        </h3>

        {/* Right side: Current Status + Action Bar / Inputs Needed */}
        <div className="text-[13px] text-black/60 flex flex-col items-end gap-2 w-full md:w-auto">
          <div>
            <span className="mr-2">Current Status: </span>
            <StatusBadge status={selected.status} />

            {isError ? (
              <FadeIn as="div" className="mt-2">
                <PNRDetailsActionBar
                  errorDetails={selected.error}
                  onRetry={() => callbacks.retry(selected.pnr)}
                  onRemoveFromQueue={() => requestRemoveFromQueue()}
                  onSendToQueue={({
                    queueType,
                    assigneeName,
                    pnr = selected.pnr,
                  }) => callbacks.sendToQueue({ pnr, queueType, assigneeName })}
                />
              </FadeIn>
            ) : (
              ""
            )}
          </div>

          {/* Human Input Required: Inputs Needed */}
          {isHumanRequired && inputsNeeded.length > 0 && (
            <FadeIn as="div" className="w-full text-left">
              <div className="text-black/80 mb-1">Inputs Needed:</div>
              <ul className="list-disc pl-5 md:pl-0">
                {inputsNeeded.map((item, idx) => (
                  <FadeIn
                    as="li"
                    key={item.key}
                    delay={70 * idx}
                    className="text-black/70"
                  >
                    <span className="font-medium">{item.passenger}</span> —{" "}
                    {item.label}
                  </FadeIn>
                ))}
              </ul>
            </FadeIn>
          )}
        </div>
      </div>

      {/* Error Details panel */}
      {showErrorPanel && (
        <FadeIn className="mt-3">
          <div className="p-2 rounded border border-red-200 bg-red-50 text-[13px]">
            <div className="font-semibold text-red-700 mb-1">
              <i className="fa-solid fa-triangle-exclamation mr-1"></i> Error
              Details
            </div>
            <div className="text-red-800/90 whitespace-pre-wrap">
              {errorDetailsText}
            </div>
          </div>
        </FadeIn>
      )}

      {/* Body */}
      {isDetailsLoading ? (
        <div className="flex items-center gap-2 text-black/70">
          <Spinner size="sm" /> Loading details…
        </div>
      ) : pnrDetails ? (
        <div className="mt-4 space-y-4 text-[13px]">
          {/* PNR & Booking */}
          <section>
            <h4 className="section-title text-[15px]">
              <i className="fa-solid fa-clipboard-list text-brand-red"></i> PNR
              & Booking
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <Field
                k={
                  <>
                    <i className="fa-solid fa-paperclip text-black/60"></i> PNR
                  </>
                }
                v={pnrDetails.pnr || "-"}
              />
              <Field
                k={
                  <>
                    <i className="fa-solid fa-file-invoice text-black/60"></i>{" "}
                    Booking ID
                  </>
                }
                v={pnrDetails.bookingId || "—"}
              />
              <Field
                k={
                  <>
                    <i className="fa-solid fa-ticket text-black/60"></i>{" "}
                    Document Type
                  </>
                }
                v={pnrDetails.documentType || "EMD"}
              />
              <Field
                k={
                  <>
                    <i className="fa-regular fa-clock text-black/60"></i> Date
                    Created
                  </>
                }
                v={formatDate(pnrDetails.created) || "—"}
              />
              <Field
                k={
                  <>
                    <i className="fa-solid fa-building text-black/60"></i>{" "}
                    Agency IATA
                  </>
                }
                v={pnrDetails.agencyIata || "—"}
              />
              <Field
                k={
                  <>
                    <i className="fa-solid fa-key text-black/60"></i> PCC
                  </>
                }
                v={pnrDetails.pcc || "—"}
              />
              <Field
                k={
                  <>
                    <i className="fa-regular fa-envelope text-black/60"></i> GDS
                  </>
                }
                v={pnrDetails.gds || "SABRE"}
              />
              <Field
                k={
                  <>
                    <i className="fa-solid fa-phone text-black/60"></i> Brand
                  </>
                }
                v={pnrDetails.brand || "—"}
              />
            </div>
          </section>

          {/* Passengers, Flight & EMDs */}
          <section>
            <h4 className="section-title text-[15px]">
              <i className="fa-solid fa-people-group text-brand-red"></i>{" "}
              Passengers, Flight & EMDs
            </h4>

            <div className="space-y-3">
              {pnrDetails.passengers.map((passenger, passengerIndex) => {
                const needsAttention =
                  isHumanRequired &&
                  (passenger.emds || []).some(
                    (emd) => emd.editable && !emd.built,
                  );
                const isOpen = openPassengerIndex === passengerIndex;

                return (
                  <div
                    key={`pax-${passengerIndex}`}
                    className={`rounded border ${needsAttention ? "ring-attn" : "border-black/10"} bg-white`}
                  >
                    {/* Accordion Header */}
                    <button
                      type="button"
                      onClick={() =>
                        setOpenPassengerIndex(isOpen ? -1 : passengerIndex)
                      }
                      className={`w-full text-left px-3 py-2 flex items-center justify-between transition-colors ${
                        needsAttention ? "bg-red-50" : "bg-black/[0.02]"
                      } hover:bg-black/[0.04] active:scale-[0.995]`}
                    >
                      <div className="font-semibold text-[14px]">
                        {passenger.name} •{" "}
                        <span className="text-black/70">
                          Ticket {passenger.ticketNo}
                        </span>
                      </div>
                      <i
                        className={`fa-solid ${
                          isOpen ? "fa-chevron-up" : "fa-chevron-down"
                        } text-black/50 transition-transform duration-200`}
                      ></i>
                    </button>

                    {/* Accordion Body */}
                    <Collapse open={isOpen}>
                      <div
                        className={`p-2 ${needsAttention ? "pulse-focus-once" : ""}`}
                        onPointerDownCapture={stopIfInteractive}
                        onMouseDownCapture={stopIfInteractive}
                        onClickCapture={stopIfInteractive}
                      >
                        {/* Traveler & Flight */}
                        <FadeIn className="mb-2">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                            <Field
                              k={
                                <>
                                  <i className="fa-regular fa-user text-black/60"></i>{" "}
                                  Passenger
                                </>
                              }
                              v={passenger.travelerName || "—"}
                            />
                            <Field
                              k={
                                <>
                                  <i className="fa-solid fa-plane text-black/60"></i>{" "}
                                  Flight No.
                                </>
                              }
                              v={passenger.flightNo || "—"}
                            />
                            <Field
                              k={
                                <>
                                  <i className="fa-solid fa-tag text-black/60"></i>{" "}
                                  Operating
                                </>
                              }
                              v={passenger.operating || "—"}
                            />
                            <Field
                              k={
                                <>
                                  <i className="fa-solid fa-location-dot text-black/60"></i>{" "}
                                  Route
                                </>
                              }
                              v={passenger.route || "—"}
                            />
                            <Field
                              k={
                                <>
                                  <i className="fa-solid fa-plane-departure text-black/60"></i>{" "}
                                  Departure
                                </>
                              }
                              v={formatDate(passenger.dep) || "—"}
                            />
                            <Field
                              k={
                                <>
                                  <i className="fa-solid fa-plane-arrival text-black/60"></i>{" "}
                                  Arrival
                                </>
                              }
                              v={formatDate(passenger.arr) || "—"}
                            />
                            <Field
                              k={
                                <>
                                  <i className="fa-solid fa-chair text-black/60"></i>{" "}
                                  Seat
                                </>
                              }
                              v={passenger.seat || "—"}
                            />
                            <Field
                              k={
                                <>
                                  <i className="fa-solid fa-hashtag text-black/60"></i>{" "}
                                  Ticket No.
                                </>
                              }
                              v={passenger.ticketNo || "—"}
                            />
                          </div>
                        </FadeIn>

                        {/* EMDs */}
                        <div className="space-y-2">
                          {(passenger.emds || []).map((emd, emdIndex) => {
                            const canEdit =
                              isHumanRequired && emd.editable && !emd.built;

                            return (
                              <FadeIn
                                key={`emd-${passengerIndex}-${emdIndex}`}
                                delay={100 * emdIndex}
                              >
                                <div className="rounded border border-black/10">
                                  <div className="px-3 py-2 bg-black/[0.02] flex items-center justify-between">
                                    <div className="font-medium text-[13px]">
                                      <i className="fa-solid fa-passport text-brand-red mr-1"></i>
                                      EMD {emdIndex + 1} • {emd.emdNo}
                                    </div>

                                    {!canEdit ? (
                                      <span className="text-[12px] text-black/60">
                                        Status: {emd.emdStatus || "—"}
                                      </span>
                                    ) : (
                                      <span className="text-[12px] text-red-600 font-medium">
                                        Needs AE item to proceed
                                      </span>
                                    )}
                                  </div>

                                  <div className="p-2">
                                    {/* Top row meta */}
                                    <FadeIn>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-2">
                                        <Field
                                          k={
                                            <>
                                              <i className="fa-regular fa-circle-dot text-black/60"></i>{" "}
                                              EMD Status
                                            </>
                                          }
                                          v={emd.emdStatus || "—"}
                                        />
                                        <Field
                                          k={
                                            <>
                                              <i className="fa-solid fa-dollar-sign text-black/60"></i>{" "}
                                              EMD Total
                                            </>
                                          }
                                          v={emd.emdTotal || "—"}
                                        />
                                        <Field
                                          k={
                                            <>
                                              <i className="fa-solid fa-puzzle-piece text-black/60"></i>{" "}
                                              SSR
                                            </>
                                          }
                                          v={passenger.ssrCode || "—"}
                                        />
                                        <Field
                                          k={
                                            <>
                                              <i className="fa-regular fa-note-sticky text-black/60"></i>{" "}
                                              Other Info
                                            </>
                                          }
                                          v={pnrDetails.otherInfo || "—"}
                                        />
                                      </div>
                                    </FadeIn>

                                    {/* Editable fields */}
                                    <FadeIn delay={60}>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                        {/* RFIC */}
                                        <div
                                          className={`rounded p-2 border transition-colors ${
                                            canEdit
                                              ? "border-red-400 bg-red-50"
                                              : "border-black/10 bg-black/[0.03]"
                                          }`}
                                        >
                                          <div className="text-black/60 text-[12px]">
                                            RFIC
                                          </div>
                                          {canEdit ? (
                                            <input
                                              className="input mt-1 font-medium w-full h-8 px-2 transition-shadow focus:shadow-sm"
                                              value={emd.rfic || ""}
                                              onChange={(ev) =>
                                                handleFieldChange(
                                                  passengerIndex,
                                                  emdIndex,
                                                  "rfic",
                                                  ev.target.value,
                                                )
                                              }
                                            />
                                          ) : (
                                            <div className="mt-1 font-medium">
                                              {emd.rfic || "—"}
                                            </div>
                                          )}
                                        </div>

                                        {/* RFISC */}
                                        <div
                                          className={`rounded p-2 border transition-colors ${
                                            canEdit
                                              ? "border-red-400 bg-red-50"
                                              : "border-black/10 bg-black/[0.03]"
                                          }`}
                                        >
                                          <div className="text-black/60 text-[12px]">
                                            RFISC
                                          </div>
                                          {canEdit ? (
                                            <input
                                              className="input mt-1 font-medium w-full h-8 px-2 transition-shadow focus:shadow-sm"
                                              value={emd.rfisc || ""}
                                              onChange={(ev) =>
                                                handleFieldChange(
                                                  passengerIndex,
                                                  emdIndex,
                                                  "rfisc",
                                                  ev.target.value,
                                                )
                                              }
                                            />
                                          ) : (
                                            <div className="mt-1 font-medium">
                                              {emd.rfisc || "—"}
                                            </div>
                                          )}
                                        </div>

                                        {/* EMD Desc */}
                                        <div
                                          className={`rounded p-2 border transition-colors ${
                                            canEdit
                                              ? "border-red-400 bg-red-50"
                                              : "border-black/10 bg-black/[0.03]"
                                          }`}
                                        >
                                          <div className="text-black/60 text-[12px]">
                                            EMD Desc
                                          </div>
                                          {canEdit ? (
                                            <input
                                              className="input mt-1 font-medium w-full h-8 px-2 transition-shadow focus:shadow-sm"
                                              value={emd.emdDesc || ""}
                                              onChange={(ev) =>
                                                handleFieldChange(
                                                  passengerIndex,
                                                  emdIndex,
                                                  "emdDesc",
                                                  ev.target.value,
                                                )
                                              }
                                            />
                                          ) : (
                                            <div className="mt-1 font-medium">
                                              {emd.emdDesc || "—"}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </FadeIn>

                                    {/* Notes / Suggestions section (Human Input Required only) */}
                                    {isHumanRequired && (
                                      <div className="mt-2">
                                        <div
                                          className={`rounded p-2 border ${
                                            canEdit
                                              ? "border-red-200 bg-red-50/60"
                                              : "border-black/10 bg-black/[0.03]"
                                          }`}
                                        >
                                          {(() => {
                                            const aiRaw = emd.aiSuggestions;
                                            const aiList =
                                              coerceAiSuggestions(aiRaw);
                                            const metrics =
                                              coerceLlmMetrics(aiRaw);
                                            const sources =
                                              coerceKnowledgeSources(aiRaw);

                                            const formatMetric = (v) => {
                                              if (v == null) return "—";
                                              const num = Number(v);
                                              if (!Number.isFinite(num))
                                                return "—";
                                              if (num >= 0 && num <= 1)
                                                return `${Math.round(num * 100)}%`;
                                              return `${Math.round(num * 100) / 100}`;
                                            };

                                            return (
                                              <>
                                                {metrics && (
                                                  <div>
                                                    <div className="text-[12px] text-black/60 font-medium mb-1">
                                                      LLM Metrics
                                                    </div>
                                                    <div className="flex flex-wrap gap-1">
                                                      <span className="px-2 py-0.5 rounded-full border border-black/10 bg-white text-[11px]">
                                                        Accuracy:{" "}
                                                        <span className="font-medium">
                                                          {formatMetric(
                                                            metrics.accuracy,
                                                          )}
                                                        </span>
                                                      </span>
                                                      <span className="px-2 py-0.5 rounded-full border border-black/10 bg-white text-[11px]">
                                                        Consistency:{" "}
                                                        <span className="font-medium">
                                                          {formatMetric(
                                                            metrics.consistency,
                                                          )}
                                                        </span>
                                                      </span>
                                                      <span className="px-2 py-0.5 rounded-full border border-black/10 bg-white text-[11px]">
                                                        Coherence:{" "}
                                                        <span className="font-medium">
                                                          {formatMetric(
                                                            metrics.coherence,
                                                          )}
                                                        </span>
                                                      </span>
                                                      <span className="px-2 py-0.5 rounded-full border border-black/10 bg-white text-[11px]">
                                                        Groundedness:{" "}
                                                        <span className="font-medium">
                                                          {formatMetric(
                                                            metrics.groundedness,
                                                          )}
                                                        </span>
                                                      </span>
                                                    </div>
                                                  </div>
                                                )}

                                                <div className="text-[12px] text-black/60 flex items-center gap-2 mt-2">
                                                  <i className="fa-solid fa-circle-info text-black/50"></i>
                                                  Notes / Suggestions
                                                </div>

                                                <ul className="mt-2 list-disc pl-5 space-y-1 text-[12px] text-black/80">
                                                  {aiList.length
                                                    ? aiList.map(
                                                        (textVal, i) => (
                                                          <li
                                                            key={`emd-ai-${passengerIndex}-${emdIndex}-${i}`}
                                                            className="text-black/80"
                                                          >
                                                            {textVal}
                                                          </li>
                                                        ),
                                                      )
                                                    : buildEmdSuggestions({
                                                        rfic: emd.rfic,
                                                        rfisc: emd.rfisc,
                                                        emdDesc: emd.emdDesc,
                                                      }).map((item, i) => {
                                                        const danger =
                                                          item.variant ===
                                                          "warn";
                                                        const ok =
                                                          item.variant === "ok";
                                                        return (
                                                          <li
                                                            key={`emd-suggest-${passengerIndex}-${emdIndex}-${i}`}
                                                            className={
                                                              danger
                                                                ? "text-red-700"
                                                                : ok
                                                                  ? "text-green-800"
                                                                  : "text-black/80"
                                                            }
                                                          >
                                                            {item.text}
                                                          </li>
                                                        );
                                                      })}
                                                </ul>

                                                <div className="mt-3">
                                                  <div className="text-[12px] text-black/60 font-medium mb-1">
                                                    Knowledge source
                                                  </div>
                                                  {emd?.aiSuggestions
                                                    ?.source_article ? (
                                                    <a
                                                      href={
                                                        emd.aiSuggestions
                                                          .source_article
                                                      }
                                                      target="_blank"
                                                      rel="noreferrer"
                                                      className="text-brand-red underline underline-offset-2 hover:opacity-80"
                                                    >
                                                      {
                                                        emd.aiSuggestions
                                                          .source_article
                                                      }
                                                    </a>
                                                  ) : (
                                                    <div className="text-[12px] text-black/60">
                                                      -
                                                    </div>
                                                  )}
                                                </div>
                                              </>
                                            );
                                          })()}
                                        </div>
                                      </div>
                                    )}

                                    {/* Build AE per EMD */}
                                    {canEdit && (
                                      <FadeIn delay={100}>
                                        <div className="mt-2">
                                          <button
                                            className="btn btn-success h-8 px-3 active:scale-[0.98] transition-[transform,box-shadow] duration-150"
                                            title="Build AE with current values for this EMD"
                                            onClick={() =>
                                              openBuildFor(
                                                passengerIndex,
                                                emdIndex,
                                              )
                                            }
                                          >
                                            <i className="fa-regular fa-paper-plane mr-1"></i>{" "}
                                            Build AE
                                          </button>
                                        </div>
                                      </FadeIn>
                                    )}

                                    {/* Processed: ADM area per EMD */}
                                    {isProcessed && (
                                      <FadeIn delay={80}>
                                        <div className="mt-2 border border-black/10 rounded p-2 bg-black/[0.03]">
                                          <div className="flex flex-col gap-2">
                                            <div
                                              data-stop-collapse
                                              className="flex items-center gap-4"
                                            >
                                              <div className="text-[13px] font-medium">
                                                Is this an ADM?
                                              </div>

                                              <label
                                                className="inline-flex items-center gap-1 text-[13px]"
                                                onPointerDown={(e) =>
                                                  e.stopPropagation()
                                                }
                                                onMouseDown={(e) =>
                                                  e.stopPropagation()
                                                }
                                                onClick={(e) =>
                                                  e.stopPropagation()
                                                }
                                              >
                                                <input
                                                  type="radio"
                                                  name={`adm-${passengerIndex}-${emdIndex}`}
                                                  className="h-4 w-4"
                                                  checked={
                                                    emd.adm.isAdm === false
                                                  }
                                                  onClick={(e) =>
                                                    e.stopPropagation()
                                                  }
                                                  onChange={(e) => {
                                                    setPnrDetails((prev) => {
                                                      const next =
                                                        deepClone(prev);
                                                      next.passengers[
                                                        passengerIndex
                                                      ].emds[
                                                        emdIndex
                                                      ].adm.isAdm = false;
                                                      return next;
                                                    });
                                                    e.stopPropagation();
                                                  }}
                                                />
                                                <span>No</span>
                                              </label>

                                              <label className="inline-flex items-center gap-1 text-[13px]">
                                                <input
                                                  type="radio"
                                                  name={`adm-${passengerIndex}-${emdIndex}`}
                                                  className="h-4 w-4"
                                                  checked={
                                                    emd.adm.isAdm === true
                                                  }
                                                  onChange={() =>
                                                    setPnrDetails((prev) => {
                                                      const next =
                                                        deepClone(prev);
                                                      next.passengers[
                                                        passengerIndex
                                                      ].emds[
                                                        emdIndex
                                                      ].adm.isAdm = true;
                                                      return next;
                                                    })
                                                  }
                                                />
                                                <span>Yes</span>
                                              </label>
                                            </div>

                                            <div className="flex items-center gap-2">
                                              <input
                                                type="text"
                                                className="input h-8 px-2 flex-1"
                                                placeholder="Optional feedback"
                                                value={emd.adm.feedback || ""}
                                                onChange={(ev) =>
                                                  setPnrDetails((prev) => {
                                                    const next =
                                                      deepClone(prev);
                                                    next.passengers[
                                                      passengerIndex
                                                    ].emds[
                                                      emdIndex
                                                    ].adm.feedback =
                                                      ev.target.value;
                                                    return next;
                                                  })
                                                }
                                              />

                                              <button
                                                className="btn btn-success h-8 px-3 disabled:opacity-40"
                                                onClick={() =>
                                                  openAdmConfirm(
                                                    passengerIndex,
                                                    emdIndex,
                                                  )
                                                }
                                                title="Submit Feedback"
                                              >
                                                Submit Feedback
                                              </button>
                                            </div>

                                            {emd.adm.submitted && (
                                              <div className="text-green-700 text-[12px]">
                                                <i className="fa-regular fa-circle-check mr-1"></i>
                                                Feedback submitted (Is ADM:{" "}
                                                {emd.adm.isAdm ? "Yes" : "No"}
                                                {emd.adm.feedback
                                                  ? `, Note: ${emd.adm.feedback}`
                                                  : ""}
                                                )
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </FadeIn>
                                    )}
                                  </div>
                                </div>
                              </FadeIn>
                            );
                          })}
                        </div>
                      </div>
                    </Collapse>
                  </div>
                );
              })}
            </div>

            {/* Human: Process PNR at end */}
            {isHumanRequired && (
              <FadeIn className="flex w-full justify-center mt-3">
                <button
                  className="btn btn-primary h-9 w-full md:w-1/2 lg:w-1/3 justify-center disabled:opacity-40 active:scale-[0.985] transition-transform"
                  title={
                    allEmdsBuilt
                      ? "Process this PNR"
                      : "Build AE for all EMDs to enable"
                  }
                  disabled={!allEmdsBuilt || isProcessSubmitting}
                  onClick={processPNR}
                >
                  {isProcessSubmitting ? (
                    <Spinner size="sm" />
                  ) : (
                    <>Process PNR</>
                  )}
                </button>
              </FadeIn>
            )}
          </section>
        </div>
      ) : (
        <p className="text-black/70">No details to display.</p>
      )}
      {/* Build AE Modal (per EMD) */}
      {isBuildModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 opacity-0 transition-opacity duration-200"
            onClick={() => setIsBuildModalOpen(false)}
            style={{
              animation: "fadeInUp 200ms ease-out forwards",
              transform: "none",
            }}
          ></div>
          <div
            className="relative bg-white w-[95%] max-w-lg rounded shadow-lg p-5 opacity-0 scale-[0.98] transition-all duration-200"
            style={{ animation: "fadeInUp 220ms 40ms ease-out forwards" }}
          >
            <h5 className="text-lg font-semibold mb-3">Confirm Build AE</h5>

            <div className="text-sm">
              <div className="font-medium mb-1">Changed Fields</div>
              {buildChanges.length === 0 ? (
                <div className="text-black/70">
                  No edits detected (RFIC, RFISC, EMD Desc are unchanged).
                </div>
              ) : (
                <ul className="list-disc pl-5 space-y-1">
                  {buildChanges.map((change) => (
                    <li key={change.field}>
                      <span className="font-medium">{change.field}:</span>{" "}
                      <span className="text-black/60 line-through">
                        {change.from}
                      </span>{" "}
                      <i className="fa-solid fa-arrow-right mx-1 text-black/40"></i>
                      <span>{change.to}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-3">
              <label className="block text-sm font-medium mb-1">
                Optional feedback
              </label>
              <textarea
                className="input w-full h-20"
                placeholder="Add notes for this build (optional)"
                value={buildNotes}
                onChange={(e) => setBuildNotes(e.target.value)}
              />
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                className="btn btn-secondary"
                onClick={() => setIsBuildModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-success"
                onClick={confirmBuildAE}
                disabled={isBuildSubmitting}
                title="Confirm Build"
              >
                {isBuildSubmitting ? <Spinner size="sm" /> : "Confirm Build"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADM Submit Confirmation */}
      {isAdmConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 opacity-0 transition-opacity duration-200"
            onClick={cancelSubmitADM}
            style={{
              animation: "fadeInUp 200ms ease-out forwards",
              transform: "none",
            }}
          ></div>
          <div
            className="relative bg-white w-[95%] max-w-md rounded shadow-lg p-5 opacity-0 scale-[0.98] transition-all duration-200"
            style={{ animation: "fadeInUp 220ms 40ms ease-out forwards" }}
          >
            <h5 className="text-lg font-semibold mb-3">Submit Feedback</h5>
            <div className="text-sm text-black/70">
              Are you sure you want to submit this ADM feedback?
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button className="btn btn-secondary" onClick={cancelSubmitADM}>
                Cancel
              </button>
              <button
                className="btn btn-success"
                onClick={confirmSubmitADM}
                disabled={isAdmSubmitting}
              >
                {isAdmSubmitting ? <Spinner size="sm" /> : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove from Queue Confirmation */}
      {isRemoveConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 opacity-0 transition-opacity duration-200"
            onClick={cancelRemoveFromQueue}
            style={{
              animation: "fadeInUp 200ms ease-out forwards",
              transform: "none",
            }}
          ></div>
          <div
            className="relative bg-white w-[95%] max-w-md rounded shadow-lg p-5 opacity-0 scale-[0.98] transition-all duration-200"
            style={{ animation: "fadeInUp 220ms 40ms ease-out forwards" }}
          >
            <h5 className="text-lg font-semibold mb-3">Remove from Queue</h5>
            <div className="text-sm text-black/70">
              Remove PNR <span className="font-medium">{selected.pnr}</span>{" "}
              from the list?
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                className="btn btn-secondary"
                onClick={cancelRemoveFromQueue}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={confirmRemoveFromQueue}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View PNR JSON Modal */}
      {isViewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 opacity-0 transition-opacity duration-200"
            onClick={() => setIsViewModalOpen(false)}
            style={{
              animation: "fadeInUp 200ms ease-out forwards",
              transform: "none",
            }}
          ></div>
          <div
            className="relative bg-white w-[95%] max-w-4xl rounded shadow-lg p-5 opacity-0 scale-[0.98] transition-all duration-200"
            style={{ animation: "fadeInUp 220ms 40ms ease-out forwards" }}
          >
            <div className="flex items-center justify-between">
              <h5 className="text-lg font-semibold">PNR Snapshot</h5>
              <button
                className="btn btn-secondary h-8 px-3 text-xs"
                onClick={() => setIsViewModalOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-3">
              {isViewLoading ? (
                <div className="flex items-center gap-2 text-black/70">
                  <Spinner size="sm" /> Loading snapshot…
                </div>
              ) : viewError ? (
                <div className="text-red-600">{viewError}</div>
              ) : viewJson ? (
                <pre className="bg-black/5 p-2 rounded max-h-[70vh] overflow-auto text-xs leading-relaxed">
                  {JSON.stringify(viewJson, null, 2)}
                </pre>
              ) : (
                <div className="text-black/60">No data to display.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
