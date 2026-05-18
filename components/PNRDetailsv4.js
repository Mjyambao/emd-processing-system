import { useEffect, useMemo, useRef, useState } from "react";

import {
  getPnrDetails,
  postBuildAeForEmd,
  postProcessPNR,
  patchEmdFeedback,
  getEmdFeedbackId,
} from "../api/pnrApi";

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

function stopIfInteractive(e) {
  const el = e.target;
  if (
    el?.closest(
      'input, select, textarea, button, a, [role="button"], [data-stop-collapse]',
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
function buildEmdSuggestions({ rfic, rfisc, emdDesc, reason }) {
  const list = [];
  const rficVal = normalize(rfic);
  const rfiscVal = normalize(rfisc);
  const descVal = normalize(emdDesc);
  const reasonVal = normalize(reason);

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
    text: `Reasoning: ${reasonVal}`,
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
      accuracy: pickNum(m.accuracy),
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
  const arr = Array.isArray(value) ? value : [];
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

  const common = {
    pnr: pnrId,
    bookingId: header?.bookingId,
    isTicketed: header?.isTicketed,
    agencyIata: header?.agencyIataNumber || "—",
    pcc: header?.userWorkPcc || "—",
    created: header?.bookingCreatedUtc,
    contactEmail: passengersRaw?.[0]?.primaryEmail || "—",
    contactPhone: passengersRaw?.[0]?.primaryPhoneNumber || "—",
    otherInfo: pickOtherInfoFromApi(pnrApi),
    errorDesc: pnrApi?.errorDetails || null,
    documentType: header?.documentType || "—",
    brand: header?.brandCode || "—",
    gds: header?.gds || "—",
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

      const editable = aeStatus === "PENDING";
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
      emds,
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

// -------------------------
// Detail decoration + silent merge helpers
// -------------------------
function decorateMappedDetails(mapped, selectedStatus) {
  const statusComp = statusToComparable(mapped?.status ?? selectedStatus);
  const isHuman =
    statusComp === "human" || statusComp === "human input required";

  if (mapped?.passengers?.length) {
    mapped.passengers.forEach((pax) => {
      (pax.emds || []).forEach((emd) => {
        const aeStatus = safeUpper(emd?.aeBuildStatus);
        if (!emd.baseline) {
          emd.baseline = {
            rfic: emd.rfic,
            rfisc: emd.rfisc,
            emdDesc: emd.emdDesc,
          };
        }
      });
    });
  }

  return mapped;
}

function getEmdKey(emd) {
  const key = emd?.emdItemId ?? emd?.ancillaryItemId ?? emd?.emdNo ?? "";
  return normalize(key);
}

function mergePnrDetailsSilently(prev, fresh, selectedStatus) {
  if (!fresh) return prev;
  if (!prev) return decorateMappedDetails(fresh, selectedStatus);

  try {
    const next = deepClone(prev);

    // Update top-level fields to reflect latest server state
    next.status = fresh.status ?? next.status;
    next.stage = fresh.stage ?? next.stage;
    next.actionRequired = fresh.actionRequired ?? next.actionRequired;
    next.assignedTo = fresh.assignedTo ?? next.assignedTo;
    next.assignedBy = fresh.assignedBy ?? next.assignedBy;
    next.errorDesc = fresh.errorDesc ?? next.errorDesc;
    next.otherInfo = fresh.otherInfo ?? next.otherInfo;
    next.header = fresh.header ?? next.header;
    next.flights = fresh.flights ?? next.flights;
    next.raw = fresh.raw ?? next.raw;

    // If passengers shape changed, safest is to swap in fresh entirely
    if (!Array.isArray(next.passengers) || !Array.isArray(fresh.passengers)) {
      return decorateMappedDetails(fresh, selectedStatus);
    }

    // Build map of latest EMDs from server
    const freshEmdMap = new Map();
    fresh.passengers.forEach((pax) => {
      (pax?.emds || []).forEach((emd) => {
        const k = getEmdKey(emd);
        if (k) freshEmdMap.set(k, emd);
      });
    });

    // Patch only status-ish fields (avoid clobbering local input values)
    next.passengers.forEach((pax) => {
      (pax?.emds || []).forEach((emd) => {
        const k = getEmdKey(emd);
        if (!k) return;
        const fe = freshEmdMap.get(k);
        if (!fe) return;

        emd.aeBuildStatus = fe.aeBuildStatus ?? emd.aeBuildStatus;
        emd.aeBuiltUtc = fe.aeBuiltUtc ?? emd.aeBuiltUtc;
        emd.aeBuiltBy = fe.aeBuiltBy ?? emd.aeBuiltBy;
        emd.errorDesc = fe.errorDesc ?? emd.errorDesc;

        // If the server changed identifiers or other non-editable metadata
        emd.emdNo = fe.emdNo ?? emd.emdNo;
        emd.emdItemId = fe.emdItemId ?? emd.emdItemId;
        emd.ancillaryItemId = fe.ancillaryItemId ?? emd.ancillaryItemId;
      });
    });

    return decorateMappedDetails(next, selectedStatus);
  } catch {
    // If merge fails, fall back to server state
    return decorateMappedDetails(fresh, selectedStatus);
  }
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
  loggedInUserId,
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

  // Error Details modal
  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);

  // Accordion open passenger index
  const [openPassengerIndex, setOpenPassengerIndex] = useState(-1);

  // Silent refetch (used after actions like Build AE)
  const silentRefetchControllerRef = useRef(null);

  async function regetPnrDetailsSilently(pnrId) {
    if (!pnrId) return;

    try {
      if (silentRefetchControllerRef.current) {
        silentRefetchControllerRef.current.abort();
      }

      const controller = new AbortController();
      silentRefetchControllerRef.current = controller;

      const api = await getPnrDetails(pnrId, { signal: controller.signal });
      const fresh = mapApiToPnrDetails(api);

      setPnrDetails(fresh);
    } catch (e) {
      if (e?.name !== "AbortError") {
        console.warn("Silent PNR details refetch failed", e);
      }
    }
  }

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
      // Abort any in-flight silent refetch
      try {
        silentRefetchControllerRef.current?.abort?.();
      } catch {
        // noop
      }
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
  // Load details
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

      setIsDetailsLoading(true);
      setPnrDetails(null);

      try {
        const api = await getPnrDetails(selected.pnr, {
          signal: controller.signal,
        });
        if (!active) return;
        const mapped = mapApiToPnrDetails(api);

        decorateMappedDetails(mapped, selected?.status);

        setPnrDetails(mapped);
        setIsDetailsLoading(false);
        return;
      } catch (e) {
        console.warn("PNR details API load failed; falling back to mock.", e);
      }

      // Fallback mock behavior
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
            otherInfo: "-",
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

  // Auto-expand the passenger that needs attention (Human Input Required only)
  useEffect(() => {
    if (!pnrDetails?.passengers) return;

    // Only auto-open for Human Input Required; do NOT force-close while users interact
    if (!isHumanRequired) return;

    const idx = pnrDetails.passengers.findIndex((passenger) =>
      (passenger.emdItems || []).some((emd) => emd.aeBuildStatus === "PENDING"),
    );

    // If user already opened an accordion, don't override their selection
    setOpenPassengerIndex((prev) => (prev >= 0 ? prev : idx >= 0 ? idx : 0));
  }, [pnrDetails, isHumanRequired]);

  const inputsNeeded = useMemo(() => {
    if (!isHumanRequired || !pnrDetails?.passengers?.length) return [];
    const list = [];

    pnrDetails.passengers.forEach((passenger, passengerIndex) => {
      (passenger.emdItems || []).forEach((emd, emdIndex) => {
        if (emd.aeBuildStatus === "PENDING") {
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
      (passenger.emdItems || []).every(
        (emd) => emd.aeBuildStatus !== "PENDING",
      ),
    );
  }, [pnrDetails]);

  function handleFieldChange(passengerIndex, emdIndex, field, value) {
    setPnrDetails((prev) => {
      if (!prev) return prev;

      const next = deepClone(prev);
      const pax = next?.passengers?.[passengerIndex];
      if (!pax) return prev;

      if (Array.isArray(pax?.emdItems) && !Array.isArray(pax?.emds))
        pax.emds = pax.emdItems;
      if (Array.isArray(pax?.emds) && !Array.isArray(pax?.emdItems))
        pax.emdItems = pax.emds;

      const patch = (arr) => {
        if (Array.isArray(arr) && arr[emdIndex]) {
          arr[emdIndex][field] = value;
        }
      };

      patch(pax.emdItems);
      patch(pax.emds);

      return next;
    });
  }

  function openBuildFor(passengerIndex, emdIndex) {
    buildTargetRef.current = { passengerIndex, emdIndex };

    const emd = pnrDetails.passengers[passengerIndex].emdItems?.[emdIndex];

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
    const emd = passenger?.emdItems?.[emdIndex];

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

    const requestedBy = loggedInUserId || "";

    setIsBuildSubmitting(true);

    try {
      const payload = {
        emd_item_id: emdItemId,
        rfic: emd?.rfic || "",
        rfisc: emd?.rfisc || "",
        rfic_name: emd?.emdDesc || "",
        feedback: buildNotes || "",
      };

      await postBuildAeForEmd(pnrId, payload);

      setPnrDetails((prev) => {
        const next = deepClone(prev);
        const target = next.passengers[passengerIndex].emdItems?.[emdIndex];

        target.baseline = {
          rfic: target.rfic,
          rfisc: target.rfisc,
          emdDesc: target.emdDesc,
        };
        target.built = true;
        target.aeBuildStatus = target.aeBuildStatus || "BUILT";
        target.aeBuiltUtc = target.aeBuiltUtc || new Date().toISOString();

        return next;
      });

      // Refetch latest PNR + EMD state silently (no page reload, no global loading)
      await regetPnrDetailsSilently(pnrId);

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

    const pnrId = selected?.pnr ?? pnrDetails?.pnr;
    if (!pnrId) {
      const msg = "Cannot process PNR: missing PNR Id";
      showToast({ variant: "error", ariaLabel: msg, title: msg });
      return;
    }

    setIsProcessSubmitting(true);
    try {
      await postProcessPNR(pnrId);

      setPnrDetails((prev) => {
        if (!prev) return prev;
        const next = deepClone(prev);
        next.status = "Processing";
        if (Array.isArray(next.passengers)) {
          next.passengers = next.passengers.map((p) => ({
            ...p,
            status: "Processing",
          }));
        }
        return next;
      });

      callbacks.processPNR({
        pnr: pnrId,
        passengers: pnrDetails.passengers,
      });

      const first = pnrDetails.passengers?.[0]?.emds?.[0];
      if (first && onApprove) {
        onApprove({
          pnr: pnrId,
          rfic: first.rfic,
          rfisc: first.rfisc,
          emdDesc: first.emdDesc,
        });
      }

      showToast({
        variant: "success",
        ariaLabel: `PNR ${pnrId} processed`,
        title: `PNR ${pnrId} processed`,
      });
    } catch (e) {
      const msg = `Failed to Process PNR: ${e?.message || "Unknown error"}`;
      showToast({ variant: "error", ariaLabel: msg, title: msg });
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

  const confirmSubmitADM = async () => {
    const { passengerIndex, emdIndex } = admTargetRef.current;
    if (passengerIndex < 0 || emdIndex < 0) return;

    const emd = pnrDetails?.passengers?.[passengerIndex]?.emds?.[emdIndex];
    const emdId = getEmdFeedbackId(emd);
    if (!emdId) {
      const msg = "Cannot submit feedback: missing EMD identifier (emdItemId)";
      showToast({ variant: "error", ariaLabel: msg, title: msg });
      return;
    }

    const updatedby = loggedInUserId || 31;

    setIsAdmSubmitting(true);
    try {
      const payload = {
        isAdm: Boolean(emd?.adm?.isAdm),
        feedback: emd?.adm?.feedback ?? "",
        correlationId: selected?.correlationId,
        updatedBy: updatedby,
      };

      await patchEmdFeedback(emdId, payload);

      setPnrDetails((prev) => {
        const next = deepClone(prev);
        const target = next.passengers[passengerIndex].emds[emdIndex];
        target.adm = target.adm || {
          isAdm: false,
          feedback: "",
          submitted: false,
        };
        target.adm.submitted = true;
        target.adm.isAdm = payload.isAdm;
        target.adm.feedback = payload.feedback;
        // mirror top-level fields
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
  };

  function cancelSubmitADM() {
    setIsAdmConfirmOpen(false);
  }

  async function openViewPNR() {
    setViewError("");
    setViewJson(null);
    setIsViewLoading(true);
    setIsViewModalOpen(true);

    try {
      if (selected?.pnr) {
        const json = await getPnrDetails(selected.pnr);
        setViewJson(json);
        return;
      }

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

  const openErrorDetails = () => {
    console.log("Open");
    setIsErrorModalOpen(true);
    if (!normalize(errorDetailsText)) return;
  };

  const closeErrorDetails = () => {
    setIsErrorModalOpen(false);
  };

  if (!selected) return null;

  return (
    <>
      <div className="pnr-details compact card mt-3 p-3 mb-6">
        {/* ToastViewport */}
        <ToastViewport toasts={toasts} onDismiss={dismissToast} />

        {/* Header */}
        <div className="flex items-start justify-between">
          <h3 className="font-semibold text-lg flex items-center gap-2 flex-wrap">
            <span>
              <i className="fa-solid fa-ticket text-brand-red"></i> PNR Details
              • <span className="text-brand-red">{selected.pnr}</span>
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
                <>
                  <FadeIn as="div" className="mt-2">
                    <div className="text-left mb-[-20px] ml-[-20px]">
                      <button
                        type="button"
                        className="h-6"
                        title="View full error details"
                        onClick={(e) => {
                          e.stopPropagation();
                          openErrorDetails();
                        }}
                        data-stop-collapse
                      >
                        <i className="fa-solid fa-circle-info"></i>
                      </button>
                    </div>

                    <PNRDetailsActionBar
                      errorDetails={selected.error}
                      onRetry={() => callbacks.retry(selected.pnr)}
                      onRemoveFromQueue={() => requestRemoveFromQueue()}
                      onSendToQueue={({
                        queueType,
                        assigneeName,
                        pnr = selected.pnr,
                      }) =>
                        callbacks.sendToQueue({ pnr, queueType, assigneeName })
                      }
                    />
                  </FadeIn>
                </>
              ) : null}
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
                <i className="fa-solid fa-clipboard-list text-brand-red"></i>{" "}
                PNR & Booking
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <Field
                  k={
                    <>
                      <i className="fa-solid fa-paperclip text-black/60"></i>{" "}
                      PNR
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
                      <i className="fa-regular fa-envelope text-black/60"></i>{" "}
                      GDS
                    </>
                  }
                  v={pnrDetails.gds || "—"}
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
                    (passenger.emdItems || []).some(
                      (emd) => emd.aeBuildStatus === "PENDING",
                    );
                  const isOpen = openPassengerIndex === passengerIndex;

                  return (
                    <div
                      key={`pax-${passengerIndex}`}
                      className={`rounded border ${needsAttention ? "ring-attn" : "border-black/10"} bg-white`}
                    >
                      {/* Accordion Header */}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          setOpenPassengerIndex(isOpen ? -1 : passengerIndex)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setOpenPassengerIndex(isOpen ? -1 : passengerIndex);
                          }
                        }}
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
                      </div>

                      {/* Accordion Body */}
                      <Collapse open={isOpen}>
                        <div
                          className={`p-2 ${needsAttention ? "pulse-focus-once" : ""}`}
                          onPointerDown={stopIfInteractive}
                          onMouseDown={stopIfInteractive}
                          onClick={stopIfInteractive}
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
                                v={
                                  passenger.passengerFlights[0]?.seatNumber ||
                                  "—"
                                }
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
                            {(passenger.emdItems || []).map((emd, emdIndex) => {
                              const canEdit =
                                isHumanRequired &&
                                (emd?.aeBuildStatus || "").toUpperCase() ===
                                  "PENDING";

                              return (
                                <FadeIn
                                  key={`emd-${passengerIndex}-${emdIndex}`}
                                  delay={100 * emdIndex}
                                >
                                  <div className="rounded border border-black/10">
                                    <div className="px-3 py-2 bg-black/[0.02] flex items-center justify-between">
                                      <div className="font-medium text-[13px]">
                                        <i className="fa-solid fa-passport text-brand-red mr-1"></i>
                                        {/* EMD {emdIndex + 1} • {emd.emdNo} */}
                                        EMD - {emdIndex + 1}
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
                                            v={
                                              emd.emdStatusCode != null &&
                                              emd.emdStatusName != null
                                                ? `${emd.emdStatusCode} - ${emd.emdStatusName}`
                                                : "—"
                                            }
                                          />
                                          <Field
                                            k={
                                              <>
                                                <i className="fa-solid fa-dollar-sign text-black/60"></i>{" "}
                                                EMD Total
                                              </>
                                            }
                                            v={emd.totalAmount || "—"}
                                          />
                                          <Field
                                            k={
                                              <>
                                                <i className="fa-solid fa-puzzle-piece text-black/60"></i>{" "}
                                                SSR
                                              </>
                                            }
                                            v={emd.ssrCode || "—"}
                                          />
                                          <Field
                                            k={
                                              <>
                                                <i className="fa-regular fa-note-sticky text-black/60"></i>{" "}
                                                Other Info
                                              </>
                                            }
                                            v={emd.otherInfo || "—"}
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

                                      {/* Notes / Suggestions (Human Input Required only) */}
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

                                                      <div className="lg:w-1/2">
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

                                                  <div className="text-[12px] text-black/60 flex items-center gap-1 mt-2">
                                                    <i className="fa-solid fa-circle-info text-black/50"></i>
                                                    Notes / Suggestions
                                                  </div>

                                                  <ul className="mt-1 list-disc pl-4 grid grid-cols-1 lg:grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-black/80 leading-tight">
                                                    {aiList.length
                                                      ? aiList.map(
                                                          (textVal, i) => (
                                                            <li
                                                              key={`emd-ai-${passengerIndex}-${emdIndex}-${i}`}
                                                              className="text-black/80 break-words"
                                                            >
                                                              {textVal}
                                                            </li>
                                                          ),
                                                        )
                                                      : buildEmdSuggestions({
                                                          rfic: emd.rfic,
                                                          rfisc: emd.rfisc,
                                                          emdDesc: emd.emdDesc,
                                                          reason:
                                                            emd.aiSuggestions
                                                              ?.reasoning,
                                                        }).map((item, i) => {
                                                          const danger =
                                                            item.variant ===
                                                            "warn";
                                                          const ok =
                                                            item.variant ===
                                                            "ok";
                                                          return (
                                                            <li
                                                              key={`emd-suggest-${passengerIndex}-${emdIndex}-${i}`}
                                                              className={`break-words ${
                                                                danger
                                                                  ? "text-red-700"
                                                                  : ok
                                                                    ? "text-green-800"
                                                                    : "text-black/80"
                                                              }`}
                                                            >
                                                              {item.text}
                                                            </li>
                                                          );
                                                        })}
                                                  </ul>

                                                  <div className="mt-2">
                                                    <div className="text-[12px] text-black/60 font-medium mb-1">
                                                      Knowledge source
                                                    </div>

                                                    {(() => {
                                                      const ai =
                                                        emd?.aiSuggestions;
                                                      const ks =
                                                        ai?.knowledge_source;

                                                      const pickHref = (u) => {
                                                        if (!u) return null;
                                                        if (
                                                          typeof u === "string"
                                                        )
                                                          return u;
                                                        if (
                                                          typeof u === "object"
                                                        ) {
                                                          return (
                                                            u.url ||
                                                            u.link ||
                                                            u.href ||
                                                            u.value ||
                                                            u.uri ||
                                                            null
                                                          );
                                                        }
                                                        return null;
                                                      };

                                                      if (
                                                        Array.isArray(ks) &&
                                                        ks.length > 0
                                                      ) {
                                                        const valid = ks
                                                          .map((item) => {
                                                            const label =
                                                              item?.source_article;
                                                            if (!label)
                                                              return null;
                                                            const href =
                                                              pickHref(
                                                                item?.source_article_url,
                                                              );
                                                            return {
                                                              label:
                                                                String(label),
                                                              href,
                                                            };
                                                          })
                                                          .filter(Boolean);

                                                        if (
                                                          valid.length === 0
                                                        ) {
                                                          return (
                                                            <div className="text-[12px] text-black/60">
                                                              -
                                                            </div>
                                                          );
                                                        }

                                                        return (
                                                          <div className="flex flex-wrap gap-x-3 gap-y-1">
                                                            {valid.map(
                                                              (src, idx2) =>
                                                                src.href ? (
                                                                  <a
                                                                    key={`${src.label}-${idx2}`}
                                                                    href={
                                                                      src.href
                                                                    }
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="text-brand-red underline underline-offset-2 hover:opacity-80 text-[12px] whitespace-nowrap"
                                                                  >
                                                                    {src.label}
                                                                  </a>
                                                                ) : (
                                                                  <span
                                                                    key={`${src.label}-${idx2}`}
                                                                    className="text-[12px] text-black/60 whitespace-nowrap"
                                                                  >
                                                                    {src.label}
                                                                  </span>
                                                                ),
                                                            )}
                                                          </div>
                                                        );
                                                      }

                                                      return (
                                                        <div className="text-[12px] text-black/60">
                                                          -
                                                        </div>
                                                      );
                                                    })()}
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
                                          <div
                                            data-stop-collapse
                                            className="mt-2 border border-black/10 rounded p-2 bg-black/[0.03]"
                                          >
                                            <div className="flex flex-col gap-2">
                                              <div
                                                data-stop-collapse
                                                className="flex flex-col gap-2"
                                              >
                                                <div
                                                  data-stop-collapse
                                                  className="flex items-center gap-4"
                                                >
                                                  <div className="text-[13px] font-medium">
                                                    Is this an ADM?
                                                  </div>

                                                  <label className="inline-flex items-center gap-1 text-[13px]">
                                                    <input
                                                      type="radio"
                                                      name={`adm-${passengerIndex}-${emdIndex}`}
                                                      className="h-4 w-4"
                                                      checked={
                                                        (emd?.adm?.isAdm ??
                                                          false) === false
                                                      }
                                                      onClick={(e) =>
                                                        e.stopPropagation()
                                                      }
                                                      onChange={() => {
                                                        setPnrDetails(
                                                          (prev) => {
                                                            const next =
                                                              deepClone(prev);
                                                            const target =
                                                              next.passengers[
                                                                passengerIndex
                                                              ].emds[emdIndex];
                                                            if (!target.adm) {
                                                              target.adm = {
                                                                isAdm: false,
                                                                feedback: "",
                                                                submitted: false,
                                                              };
                                                            }
                                                            target.adm.isAdm = false;
                                                            // mirror top-level fields used elsewhere
                                                            target.isAdm = false;
                                                            return next;
                                                          },
                                                        );
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
                                                        (emd?.adm?.isAdm ??
                                                          false) === true
                                                      }
                                                      onClick={(e) =>
                                                        e.stopPropagation()
                                                      }
                                                      onChange={() => {
                                                        setPnrDetails(
                                                          (prev) => {
                                                            const next =
                                                              deepClone(prev);
                                                            const target =
                                                              next.passengers[
                                                                passengerIndex
                                                              ].emds[emdIndex];
                                                            if (!target.adm) {
                                                              target.adm = {
                                                                isAdm: false,
                                                                feedback: "",
                                                                submitted: false,
                                                              };
                                                            }
                                                            target.adm.isAdm = true;
                                                            // mirror top-level fields used elsewhere
                                                            target.isAdm = true;
                                                            return next;
                                                          },
                                                        );
                                                      }}
                                                    />
                                                    <span>Yes</span>
                                                  </label>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                  <input
                                                    type="text"
                                                    className="input h-8 px-2 flex-1"
                                                    placeholder="Optional feedback"
                                                    value={
                                                      emd?.adm?.feedback ?? ""
                                                    }
                                                    onChange={(ev) =>
                                                      setPnrDetails((prev) => {
                                                        const next =
                                                          deepClone(prev);
                                                        const target =
                                                          next.passengers[
                                                            passengerIndex
                                                          ].emds[emdIndex];
                                                        if (!target.adm) {
                                                          target.adm = {
                                                            isAdm: false,
                                                            feedback: "",
                                                            submitted: false,
                                                          };
                                                        }
                                                        target.adm.feedback =
                                                          ev.target.value;
                                                        // mirror top-level fields used elsewhere
                                                        target.feedback =
                                                          ev.target.value;
                                                        return next;
                                                      })
                                                    }
                                                    onKeyDownCapture={(e) =>
                                                      e.stopPropagation()
                                                    }
                                                    onKeyUpCapture={(e) =>
                                                      e.stopPropagation()
                                                    }
                                                  />

                                                  <button
                                                    className="btn btn-success h-8 px-3 disabled:opacity-40"
                                                    type="button"
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
                                              </div>
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
              {/* Human: Process PNR */}
              {/* disabled={!allEmdsBuilt || isProcessSubmitting} */}

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

        {/* Build AE Modal */}
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
                  onClick={() => confirmSubmitADM()}
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
          <div className="fixed inset-0 z-50 flex items-center justify-center mt-12">
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
                  className="btn h-8 px-2"
                  onClick={() => setIsViewModalOpen(false)}
                  aria-label="Close"
                  title="Close"
                >
                  ✕
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

      {/* Expanded Error Details Modal — rendered outside main div via Fragment */}
      {isErrorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 opacity-0 transition-opacity duration-200"
            onClick={closeErrorDetails}
            style={{
              animation: "fadeInUp 200ms ease-out forwards",
              transform: "none",
            }}
          ></div>
          <div
            className="relative bg-white w-[95%] max-w-2xl rounded shadow-lg p-5 opacity-0 scale-[0.98] transition-all duration-200"
            style={{ animation: "fadeInUp 220ms 40ms ease-out forwards" }}
          >
            <div className="flex items-center justify-between gap-2">
              <h5 className="text-lg font-semibold">Detailed Error</h5>
              <button
                className="btn h-8 px-2"
                onClick={closeErrorDetails}
                aria-label="Close"
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="mt-3">
              <pre className="bg-red-50 border border-red-200 p-3 rounded max-h-[60vh] overflow-auto text-xs leading-relaxed whitespace-pre-wrap break-words">
                {errorDetailsText || "—"}
              </pre>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
