import { useEffect, useMemo, useRef, useState } from "react";

// Components
import StatusBadge from "./StatusBadge";
import Field from "./Field";
import Spinner from "./Spinner";
import Toasts from "./Toasts";
import Collapse from "./Collapse";
import FadeIn from "./FadeIn";
import PNRDetailsActionBar from "./PNRDetailsActionBar";

// Utils
import formatDate from "../utils/helper";

// APIs
//---

const normalize = (v) => (v ?? "").toString().trim();
const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

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

/**
 * Notes / Suggestions helper (Human Input Required only)
 * - Not a field, no user input
 * - Shows guidance for RFIC / RFISC / EMD Desc
 * - Includes a useful airline code lookup link (like your previous example)
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

  // Airline code lookup link (your request: like the previous example w/ link)
  list.push({
    variant: "info",
    parts: [
      "Need to validate airline / carrier codes? Use the ",
      {
        linkText: "Airline Code Lookup",
        href: AIRLINE_CODE_LOOKUP_URL,
      },
      " to confirm the carrier code format.",
    ],
  });

  // Consistency suggestion
  list.push({
    variant: "info",
    text: "Tip: Keep RFIC/RFISC aligned with the EMD Desc wording to avoid mismatched subcodes.",
  });

  return list;
}

export default function PNRDetails({
  selected,
  onApprove,
  onRetry,
  onRemoveFromQueue,
  onSendToQueue,
  onProcessPNR,
}) {
  const [pnrDetails, setPnrDetails] = useState(null);

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

  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(1);

  const showToast = ({
    variant = "info",
    ariaLabel = "",
    title = "",
    ttl = 3000,
  }) => {
    const id = toastIdRef.current++;
    const toast = { id, variant, ariaLabel, title };
    let timer = null;

    const startTimer = () => {
      clearTimeout(timer);
      if (ttl > 0) {
        timer = setTimeout(() => {
          setToasts((prev) => prev.filter((x) => x.id !== id));
        }, ttl);
      }
    };
    const stopTimer = () => clearTimeout(timer);

    toast.startTimer = startTimer;
    toast.stopTimer = stopTimer;

    setToasts((prev) => [...prev, toast]);
    startTimer();
  };
  const closeToast = (id) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));

  // Safe handler fallbacks
  const callbacks = {
    retry: onRetry ?? (() => {}),
    removeFromQueue: onRemoveFromQueue ?? (() => {}),
    sendToQueue: onSendToQueue ?? (() => {}),
    processPNR: onProcessPNR ?? (() => {}),
  };

  // Status helpers
  const statusLower = (selected?.status || "").toLowerCase();
  const isHumanRequired =
    statusLower === "human" || statusLower === "human input required";
  const isProcessed = statusLower === "processed";
  const isError = statusLower.includes("error");

  // Error details text (from table row preferred)
  const errorDetailsText =
    selected?.errorDetails ||
    selected?.errorDesc ||
    pnrDetails?.errorDesc ||
    "";

  const showErrorPanel = isError && !!normalize(errorDetailsText);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!selected) {
        setPnrDetails(null);
        return;
      }

      if (selected.pnr === "GLEBNY") {
        const res = await fetch("/data/sabre-booking.json");
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
          emdNo: anc?.electronicMiscellaneousDocumentNumber || "6074333222111",
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
        // Mock for non-GLEBNY
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
              baseline: { rfic: "C", rfisc: "0BG", emdDesc: "EXTRA BAG 10KG" },
              built: false,
              editable: true,
              notes: "",
              adm: { isAdm: false, feedback: "", submitted: false },
            },
          ],
        };

        setPnrDetails({ ...common, passengers: [pax1, pax2] });
      }
    }

    load();
    return () => {
      active = false;
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
    setIsBuildSubmitting(true);
    try {
      await new Promise((r) => setTimeout(r, 700));

      setPnrDetails((prev) => {
        const next = deepClone(prev);
        const emd = next.passengers[passengerIndex].emds[emdIndex];
        emd.baseline = {
          rfic: emd.rfic,
          rfisc: emd.rfisc,
          emdDesc: emd.emdDesc,
        };
        emd.built = true;
        return next;
      });

      setIsBuildModalOpen(false);
      setBuildChanges([]);
      const passengerName = pnrDetails.passengers[passengerIndex].name;
      showToast({
        variant: "success",
        ariaLabel: `AE built for ${passengerName}, EMD ${emdIndex + 1}`,
        title: `AE built for ${passengerName}, EMD ${emdIndex + 1}`,
      });
      buildTargetRef.current = { passengerIndex: -1, emdIndex: -1 };
    } finally {
      setIsBuildSubmitting(false);
    }
  }

  async function processPNR() {
    if (!allEmdsBuilt) return;
    setIsProcessSubmitting(true);
    try {
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
    setIsAdmSubmitting(true);
    try {
      await new Promise((r) => setTimeout(r, 700));
      setPnrDetails((prev) => {
        const next = deepClone(prev);
        next.passengers[passengerIndex].emds[emdIndex].adm.submitted = true;
        return next;
      });
      setIsAdmConfirmOpen(false);
      showToast({
        variant: "success",
        ariaLabel: `ADM feedback submitted for EMD ${emdIndex + 1}`,
        title: `ADM feedback submitted for EMD ${emdIndex + 1}`,
      });
      admTargetRef.current = { passengerIndex: -1, emdIndex: -1 };
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
      const res = await fetch("/data/sabre-booking.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      console.log(json);
      setViewJson(json);
    } catch (e) {
      const msg = `Failed to load sabre-booking.json: ${e?.message || "Unknown error"}`;
      setViewError(msg);
      showToast({ variant: "error", ariaLabel: msg, title: msg });
    } finally {
      setIsViewLoading(false);
    }
  }

  if (!selected) return null;

  return (
    <div className="pnr-details compact card mt-3 p-3 mb-6">
      <Toasts items={toasts} onClose={closeToast} position="bottom-right" />

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
            title="View raw PNR JSON snapshot (sabre-booking.json)"
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
      {pnrDetails ? (
        <div className="mt-4 space-y-4 text-[13px]">
          {/* PNR & Booking */}
          <section>
            <h4 className="section-title text-[15px]">
              <i className="fa-solid fa-clipboard-list text-brand-red"></i> PNR
              &amp; Booking
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
                v={pnrDetails.brand || "ECO FLEX"}
              />
            </div>
          </section>

          {/* Passengers, Flight & EMDs */}
          <section>
            <h4 className="section-title text-[15px]">
              <i className="fa-solid fa-people-group text-brand-red"></i>{" "}
              Passengers, Flight &amp; EMDs
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
                    className={`rounded border ${
                      needsAttention ? "ring-attn" : "border-black/10"
                    } bg-white`}
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
                        className={`p-2 ${
                          needsAttention ? "pulse-focus-once" : ""
                        }`}
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
                                        Needs Build AE
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
                                            <div className="text-[12px] text-black/60 flex items-center gap-2">
                                              <i className="fa-solid fa-circle-info text-black/50"></i>
                                              Notes / Suggestions
                                            </div>

                                            <ul className="mt-1 list-disc pl-5 space-y-1 text-[12px] text-black/80">
                                              {buildEmdSuggestions({
                                                rfic: emd.rfic,
                                                rfisc: emd.rfisc,
                                                emdDesc: emd.emdDesc,
                                              }).map((item, i) => {
                                                const danger =
                                                  item.variant === "warn";
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
                                                    {item.parts ? (
                                                      <>
                                                        {item.parts.map(
                                                          (p, idx) => {
                                                            if (
                                                              typeof p ===
                                                              "string"
                                                            ) {
                                                              return (
                                                                <span
                                                                  key={`p-${idx}`}
                                                                >
                                                                  {p}
                                                                </span>
                                                              );
                                                            }
                                                            return (
                                                              <a
                                                                key={`p-${idx}`}
                                                                href={p.href}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="text-brand-red underline underline-offset-2 hover:opacity-80"
                                                              >
                                                                {p.linkText}
                                                              </a>
                                                            );
                                                          },
                                                        )}
                                                      </>
                                                    ) : (
                                                      item.text
                                                    )}
                                                  </li>
                                                );
                                              })}
                                            </ul>
                                          </div>
                                        </div>
                                      )}
                                    </FadeIn>

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
                                            <div className="flex items-center gap-4">
                                              <div className="text-[13px] font-medium">
                                                Is this an ADM?
                                              </div>
                                              <label className="inline-flex items-center gap-1 text-[13px]">
                                                <input
                                                  type="radio"
                                                  name={`adm-${passengerIndex}-${emdIndex}`}
                                                  className="h-4 w-4"
                                                  checked={
                                                    emd.adm.isAdm === false
                                                  }
                                                  onChange={() =>
                                                    setPnrDetails((prev) => {
                                                      const next =
                                                        deepClone(prev);
                                                      next.passengers[
                                                        passengerIndex
                                                      ].emds[
                                                        emdIndex
                                                      ].adm.isAdm = false;
                                                      return next;
                                                    })
                                                  }
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
        <p className="text-black/70">Loading details…</p>
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
