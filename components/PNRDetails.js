import { useEffect, useMemo, useRef, useState } from "react";
import StatusBadge from "./StatusBadge";
import Field from "./Field";
import Spinner from "./Spinner";
import PNRDetailsActionBar from "../components/PNRDetailsActionBar";
import formatDate from "../utils/helper";

/** ---------- Helpers (outside component) ---------- */
const norm = (v) => (v ?? "").toString().trim();

function getEmdDiff(current, baseline) {
  const diffs = [];
  if (norm(current.rfic) !== norm(baseline.rfic)) {
    diffs.push({
      field: "RFIC",
      from: baseline.rfic || "—",
      to: current.rfic || "—",
    });
  }
  if (norm(current.rfisc) !== norm(baseline.rfisc)) {
    diffs.push({
      field: "RFISC",
      from: baseline.rfisc || "—",
      to: current.rfisc || "—",
    });
  }
  if (norm(current.emdDesc) !== norm(baseline.emdDesc)) {
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

/** ---------- Component ---------- */
export default function PNRDetails({
  selected,
  onApprove,
  // Optional handlers provided by parent
  onRetry, // (pnr) => void
  onRemoveFromQueue, // (pnr) => void
  onSendToQueue, // ({ pnr, queueType, assigneeName }) => void
  onProcessPNR, // optional: ({ pnr, passengers }) => void
}) {
  /** -------------------- HOOKS (fixed order) -------------------- */
  const [details, setDetails] = useState(null);

  // Build AE (per-EMD) modal
  const [buildOpen, setBuildOpen] = useState(false);
  const [buildSubmitting, setBuildSubmitting] = useState(false);
  const [buildDiff, setBuildDiff] = useState([]);
  const [buildFeedback, setBuildFeedback] = useState("");
  const buildTargetRef = useRef({ passIdx: -1, emdIdx: -1 });

  // Process PNR (Human) submit
  const [processSubmitting, setProcessSubmitting] = useState(false);

  // ADM confirmation
  const [admConfirmOpen, setAdmConfirmOpen] = useState(false);
  const [admSubmitting, setAdmSubmitting] = useState(false);
  const admTargetRef = useRef({ passIdx: -1, emdIdx: -1 });

  // Remove from Queue confirmation
  const [removeOpen, setRemoveOpen] = useState(false);

  // View PNR JSON modal
  const [viewOpen, setViewOpen] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState("");
  const [viewJson, setViewJson] = useState(null);

  // Accordion open index (auto-expand the one that needs attention)
  const [openIdx, setOpenIdx] = useState(-1);

  // Safe handler fallbacks (no-op)
  const handlers = {
    retry: onRetry ?? (() => {}),
    removeFromQueue: onRemoveFromQueue ?? (() => {}),
    sendToQueue: onSendToQueue ?? (() => {}),
    processPNR: onProcessPNR ?? (() => {}),
  };

  // Status helpers
  const statusLower = (selected?.status || "").toLowerCase();
  const isHuman =
    statusLower === "human" || statusLower === "human input required";
  const isProcessing = statusLower === "processing";
  const isProcessed = statusLower === "processed";
  const isError = statusLower.includes("error");

  // Error details text (from table row preferred)
  const errorDetailsText =
    selected?.errorDetails || selected?.errorDesc || details?.errorDesc || "";

  // Derived
  const showErrorPanel = isError && !!norm(errorDetailsText);

  /** -------------------- EFFECTS -------------------- */

  // Load details and model passengers + EMDs
  useEffect(() => {
    let active = true;

    async function load() {
      if (!selected) {
        setDetails(null);
        return;
      }

      // Pull from sabre-booking.json if GLEBNY (as before), then construct passengers + EMDs
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
            `${flight?.airlineCode || ""} ${flight?.flightNumber || ""} (${flight?.airlineName})`.trim(),
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

        // Passenger 1 — 1 EMD (no edits needed)
        const pax1Name =
          `${traveler?.givenName || ""} ${traveler?.middleName || ""} ${traveler?.surname || ""}`
            .replace(/\s+/g, " ")
            .trim() || "John Doe";
        const pax1Ticket = ticket0?.number || "0167489825830";
        const emd1 = {
          emdNo: anc?.electronicMiscellaneousDocumentNumber || "6074333222111",
          emdStatus: anc?.statusName || "HD - Confirmed",
          emdTotal:
            `${emdTotals?.total || "128.00"} ${emdTotals?.currencyCode || "USD"}`.trim(),
          rfic: anc?.reasonForIssuanceCode || "C",
          rfisc: anc?.subcode || "05Z",
          emdDesc: anc?.commercialName || "UPTO33LB 15KG BAGGAGE",
          baseline: null, // will be set below
          built: true, // already fine; not editable
          editable: false,
          adm: { isAdm: false, feedback: "", submitted: false },
        };
        emd1.baseline = {
          rfic: emd1.rfic,
          rfisc: emd1.rfisc,
          emdDesc: emd1.emdDesc,
        };

        // Passenger 2 — 2 EMDs (edits required when Human)
        const pax2Name = "Jane Smith";
        const pax2Ticket = "0167489825831";
        const emd2a = {
          emdNo: "6074333222112",
          emdStatus: "HD - Confirmed",
          emdTotal: "45.00 USD",
          rfic: "C",
          rfisc: "07B",
          emdDesc: "PREPAID SEAT 17B",
          baseline: null,
          built: false, // needs Build AE
          editable: true, // can edit in Human status
          adm: { isAdm: false, feedback: "", submitted: false },
        };
        emd2a.baseline = {
          rfic: emd2a.rfic,
          rfisc: emd2a.rfisc,
          emdDesc: emd2a.emdDesc,
        };

        const emd2b = {
          emdNo: "6074333222113",
          emdStatus: "HD - Confirmed",
          emdTotal: "30.00 USD",
          rfic: "C",
          rfisc: "0BG",
          emdDesc: "EXTRA BAG 10KG",
          baseline: null,
          built: false,
          editable: true,
          adm: { isAdm: false, feedback: "", submitted: false },
        };
        emd2b.baseline = {
          rfic: emd2b.rfic,
          rfisc: emd2b.rfisc,
          emdDesc: emd2b.emdDesc,
        };

        const obj = {
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
        };

        setDetails(obj);
      } else {
        // Mock for non-GLEBNY, two passengers as required
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
          flightNo: "AA 123 (AMERICAN AIRLINES)",
          operating: "UA 321 (UNITED AIRLINES)",
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
          name: selected.passenger || "John Doe",
          ticketNo: "0167489825830",
          travelerName: selected.passenger || "John Doe",
          ...common,
          emds: [
            {
              emdNo: "6074333222111",
              emdStatus: "HD - Confirmed",
              emdTotal: "128.00 USD",
              rfic: "C",
              rfisc: "05Z",
              emdDesc: "UPTO33LB 15KG BAGGAGE",
              baseline: {
                rfic: "C",
                rfisc: "05Z",
                emdDesc: "UPTO33LB 15KG BAGGAGE",
              },
              built: true, // no edits needed
              editable: false,
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
              emdStatus: "HD - Confirmed",
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
              adm: { isAdm: false, feedback: "", submitted: false },
            },
            {
              emdNo: "6074333222113",
              emdStatus: "HD - Confirmed",
              emdTotal: "30.00 USD",
              rfic: "C",
              rfisc: "0BG",
              emdDesc: "EXTRA BAG 10KG",
              baseline: { rfic: "C", rfisc: "0BG", emdDesc: "EXTRA BAG 10KG" },
              built: false,
              editable: true,
              adm: { isAdm: false, feedback: "", submitted: false },
            },
          ],
        };

        setDetails({
          ...common,
          passengers: [pax1, pax2],
        });
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [selected]);

  // Auto-expand the passenger that needs attention (Human Input Required)
  useEffect(() => {
    if (!details?.passengers) return;
    if (!isHuman) {
      setOpenIdx(-1);
      return;
    }
    const idx = details.passengers.findIndex((p) =>
      (p.emds || []).some((e) => e.editable && !e.built),
    );
    setOpenIdx(idx >= 0 ? idx : 0);
  }, [details, isHuman]);

  /** -------------------- Derived Lists -------------------- */

  const inputsNeeded = useMemo(() => {
    if (!isHuman || !details?.passengers?.length) return [];
    const list = [];
    details.passengers.forEach((p, pi) => {
      (p.emds || []).forEach((e, ei) => {
        if (e.editable && !e.built) {
          // For the sample, all three fields are expected
          list.push({
            key: `${pi}-${ei}`,
            passenger: p.name,
            label: `EMD ${ei + 1}: RFIC, RFISC, EMD Desc`,
            passIdx: pi,
            emdIdx: ei,
          });
        }
      });
    });
    return list;
  }, [details, isHuman]);

  const allEmdsBuilt = useMemo(() => {
    if (!details?.passengers?.length) return false;
    return details.passengers.every((p) =>
      (p.emds || []).every((e) => !!e.built),
    );
  }, [details]);

  /** -------------------- Handlers -------------------- */

  function handleFieldChange(passIdx, emdIdx, field, value) {
    setDetails((prev) => {
      const next = structuredClone(prev);
      next.passengers[passIdx].emds[emdIdx][field] = value;
      return next;
    });
  }

  function openBuildFor(passIdx, emdIdx) {
    buildTargetRef.current = { passIdx, emdIdx };
    const emd = details.passengers[passIdx].emds[emdIdx];
    const diff = getEmdDiff(
      { rfic: emd.rfic, rfisc: emd.rfisc, emdDesc: emd.emdDesc },
      emd.baseline || { rfic: "", rfisc: "", emdDesc: "" },
    );
    setBuildDiff(diff);
    setBuildFeedback("");
    setBuildOpen(true);
  }

  async function confirmBuildAE() {
    const { passIdx, emdIdx } = buildTargetRef.current;
    if (passIdx < 0 || emdIdx < 0) return;
    setBuildSubmitting(true);
    try {
      // Simulate API call
      await new Promise((r) => setTimeout(r, 700));

      setDetails((prev) => {
        const next = structuredClone(prev);
        const emd = next.passengers[passIdx].emds[emdIdx];
        // advance baseline
        emd.baseline = {
          rfic: emd.rfic,
          rfisc: emd.rfisc,
          emdDesc: emd.emdDesc,
        };
        // mark built -> readonly & removed from inputsNeeded
        emd.built = true;
        return next;
      });

      setBuildOpen(false);
      setBuildDiff([]);
      buildTargetRef.current = { passIdx: -1, emdIdx: -1 };
    } finally {
      setBuildSubmitting(false);
    }
  }

  async function processPNR() {
    if (!allEmdsBuilt) return;
    setProcessSubmitting(true);
    try {
      // Simulate processing + allow parent hook
      await new Promise((r) => setTimeout(r, 700));
      handlers.processPNR({
        pnr: selected.pnr,
        passengers: details.passengers,
      });
      // For backward compatibility, also invoke onApprove with the first EMD of first passenger (if the parent expects it)
      const first = details.passengers?.[0]?.emds?.[0];
      if (first && onApprove) {
        onApprove({
          pnr: selected.pnr,
          rfic: first.rfic,
          rfisc: first.rfisc,
          emdDesc: first.emdDesc,
        });
      }
    } finally {
      setProcessSubmitting(false);
    }
  }

  function requestRemoveFromQueue() {
    setRemoveOpen(true);
  }
  function confirmRemoveFromQueue() {
    setRemoveOpen(false);
    handlers.removeFromQueue(selected.pnr);
  }

  function cancelRemoveFromQueue() {
    setRemoveOpen(false);
  }

  function openAdmConfirm(passIdx, emdIdx) {
    admTargetRef.current = { passIdx, emdIdx };
    setAdmConfirmOpen(true);
  }
  async function confirmSubmitADM() {
    const { passIdx, emdIdx } = admTargetRef.current;
    if (passIdx < 0 || emdIdx < 0) return;
    setAdmSubmitting(true);
    try {
      await new Promise((r) => setTimeout(r, 700));
      // retain values (already in state), mark as submitted
      setDetails((prev) => {
        const next = structuredClone(prev);
        next.passengers[passIdx].emds[emdIdx].adm.submitted = true;
        return next;
      });
      setAdmConfirmOpen(false);
      admTargetRef.current = { passIdx: -1, emdIdx: -1 };
    } finally {
      setAdmSubmitting(false);
    }
  }
  function cancelSubmitADM() {
    setAdmConfirmOpen(false);
  }

  // View PNR modal logic
  async function openViewPNR() {
    setViewError("");
    setViewJson(null);
    setViewLoading(true);
    setViewOpen(true);
    try {
      const res = await fetch("/data/sabre-booking.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setViewJson(json);
    } catch (e) {
      setViewError(
        `Failed to load sabre-booking.json: ${e?.message || "Unknown error"}`,
      );
    } finally {
      setViewLoading(false);
    }
  }

  /** -------------------- Render -------------------- */

  if (!selected) return null;

  return (
    <div className="card mt-4 p-4 mb-10">
      {/* Header */}
      <div className="flex items-start justify-between">
        <h3 className="font-semibold text-xl flex items-center gap-3 flex-wrap">
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

        {/* Right side: Current Status + (conditional) Error Details / Action Bar */}
        <div className="text-[13px] text-black/60 flex flex-col items-end gap-2 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <span>Current Status:</span>
            <StatusBadge status={selected.status} />
            {isError ? (
              <div>
                <PNRDetailsActionBar
                  errorDetails={selected.error}
                  onRetry={() => handlers.retry(selected.pnr)}
                  onRemoveFromQueue={() => requestRemoveFromQueue()}
                  onSendToQueue={({
                    queueType,
                    assigneeName,
                    pnr = selected.pnr,
                  }) => handlers.sendToQueue({ pnr, queueType, assigneeName })}
                />
              </div>
            ) : (
              ""
            )}
          </div>

          {/* Human Input Required: Inputs Needed */}
          {isHuman && inputsNeeded.length > 0 && (
            <div className="w-full md:w-auto text-left md:text-right">
              <div className="font-medium text-black/80 mb-1">
                Inputs Needed
              </div>
              <ul className="list-disc md:list-none pl-5 md:pl-0 space-y-1">
                {inputsNeeded.map((it) => (
                  <li key={it.key} className="text-black/70">
                    <span className="font-medium">{it.passenger}</span> —{" "}
                    {it.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Error Details panel (only for error-like statuses) */}
      {showErrorPanel && (
        <div className="mt-4 p-3 rounded border border-red-200 bg-red-50 text-[13px]">
          <div className="font-semibold text-red-700 mb-1">
            <i className="fa-solid fa-triangle-exclamation mr-1"></i> Error
            Details
          </div>
          <div className="text-red-800/90 whitespace-pre-wrap">
            {errorDetailsText}
          </div>
        </div>
      )}

      {/* Body */}
      {details ? (
        <div className="mt-6 space-y-6 text-[13px] mb-4">
          {/* PNR & Booking (compact) */}
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
                v={details.pnr || "-"}
              />
              <Field
                k={
                  <>
                    <i className="fa-solid fa-file-invoice text-black/60"></i>{" "}
                    Booking ID
                  </>
                }
                v={details.bookingId || "—"}
              />
              <Field
                k={
                  <>
                    <i className="fa-solid fa-ticket text-black/60"></i>{" "}
                    Document Type
                  </>
                }
                v={details.documentType || "EMD"}
              />
              <Field
                k={
                  <>
                    <i className="fa-regular fa-clock text-black/60"></i> Date
                    Created
                  </>
                }
                v={formatDate(details.created) || "—"}
              />
              <Field
                k={
                  <>
                    <i className="fa-solid fa-building text-black/60"></i>{" "}
                    Agency IATA
                  </>
                }
                v={details.agencyIata || "—"}
              />
              <Field
                k={
                  <>
                    <i className="fa-solid fa-key text-black/60"></i> PCC
                  </>
                }
                v={details.pcc || "—"}
              />
              <Field
                k={
                  <>
                    <i className="fa-solid fa-warehouse text-black/60"></i> GDS
                  </>
                }
                v={details.gds || "SABRE"}
              />
              <Field
                k={
                  <>
                    <i className="fa-solid fa-tag text-black/60"></i> Brand
                  </>
                }
                v={details.brand || "ECO FLEX"}
              />
            </div>
          </section>

          {/* Passenger Accordions */}
          <section>
            <h4 className="section-title text-[15px]">
              <i className="fa-solid fa-people-group text-brand-red"></i>{" "}
              Passengers, Flight & EMDs
            </h4>

            <div className="space-y-3">
              {details.passengers.map((p, pi) => {
                const needsAttention =
                  isHuman && (p.emds || []).some((e) => e.editable && !e.built);
                const isOpen = openIdx === pi;
                return (
                  <div
                    key={`pax-${pi}`}
                    className={`rounded border ${needsAttention ? "border-red-300 ring-1 ring-red-200" : "border-black/10"} bg-white`}
                  >
                    {/* Accordion Header */}
                    <button
                      type="button"
                      onClick={() => setOpenIdx(isOpen ? -1 : pi)}
                      className={`w-full text-left px-3 py-2 flex items-center justify-between ${needsAttention ? "bg-red-50" : "bg-black/[0.02]"}`}
                    >
                      <div className="font-semibold text-[14px]">
                        {p.name} •{" "}
                        <span className="text-black/70">
                          Ticket {p.ticketNo}
                        </span>
                      </div>
                      <i
                        className={`fa-solid ${isOpen ? "fa-chevron-up" : "fa-chevron-down"} text-black/50`}
                      ></i>
                    </button>

                    {/* Accordion Body */}
                    {isOpen && (
                      <div className="p-3">
                        {/* Traveler & Flight (compact) */}
                        <div className="mb-2">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                            <Field
                              k={
                                <>
                                  <i className="fa-regular fa-user text-black/60"></i>{" "}
                                  Passenger
                                </>
                              }
                              v={p.travelerName || "—"}
                            />
                            <Field
                              k={
                                <>
                                  <i className="fa-solid fa-plane text-black/60"></i>{" "}
                                  Flight No.
                                </>
                              }
                              v={p.flightNo || "—"}
                            />
                            <Field
                              k={
                                <>
                                  <i className="fa-solid fa-tag text-black/60"></i>{" "}
                                  Operating
                                </>
                              }
                              v={p.operating || "—"}
                            />
                            <Field
                              k={
                                <>
                                  <i className="fa-solid fa-location-dot text-black/60"></i>{" "}
                                  Route
                                </>
                              }
                              v={p.route || "—"}
                            />
                            <Field
                              k={
                                <>
                                  <i className="fa-solid fa-plane-departure text-black/60"></i>{" "}
                                  Departure
                                </>
                              }
                              v={formatDate(p.dep) || "—"}
                            />
                            <Field
                              k={
                                <>
                                  <i className="fa-solid fa-plane-arrival text-black/60"></i>{" "}
                                  Arrival
                                </>
                              }
                              v={formatDate(p.arr) || "—"}
                            />
                            <Field
                              k={
                                <>
                                  <i className="fa-solid fa-chair text-black/60"></i>{" "}
                                  Seat
                                </>
                              }
                              v={p.seat || "—"}
                            />
                            <Field
                              k={
                                <>
                                  <i className="fa-solid fa-hashtag text-black/60"></i>{" "}
                                  Ticket No.
                                </>
                              }
                              v={p.ticketNo || "—"}
                            />
                          </div>
                        </div>

                        {/* EMDs for this Passenger */}
                        <div className="space-y-2">
                          {(p.emds || []).map((e, ei) => {
                            const canEdit = isHuman && e.editable && !e.built;
                            return (
                              <div
                                key={`emd-${pi}-${ei}`}
                                className="rounded border border-black/10"
                              >
                                <div className="px-3 py-2 bg-black/[0.02] flex items-center justify-between">
                                  <div className="font-medium text-[13px]">
                                    <i className="fa-solid fa-passport text-brand-red mr-1"></i>
                                    EMD {ei + 1} • {e.emdNo}
                                  </div>
                                  {!canEdit ? (
                                    <span className="text-[12px] text-black/60">
                                      Status: {e.emdStatus || "—"}
                                    </span>
                                  ) : (
                                    <span className="text-[12px] text-red-600 font-medium">
                                      Needs Build AE
                                    </span>
                                  )}
                                </div>

                                <div className="p-3">
                                  {/* Top row: read-only metadata */}
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-2">
                                    <Field
                                      k={
                                        <>
                                          <i className="fa-regular fa-circle-dot text-black/60"></i>{" "}
                                          EMD Status
                                        </>
                                      }
                                      v={e.emdStatus || "—"}
                                    />
                                    <Field
                                      k={
                                        <>
                                          <i className="fa-solid fa-dollar-sign text-black/60"></i>{" "}
                                          EMD Total
                                        </>
                                      }
                                      v={e.emdTotal || "—"}
                                    />
                                    <Field
                                      k={
                                        <>
                                          <i className="fa-solid fa-puzzle-piece text-black/60"></i>{" "}
                                          SSR
                                        </>
                                      }
                                      v={p.ssrCode || "—"}
                                    />
                                    <Field
                                      k={
                                        <>
                                          <i className="fa-regular fa-note-sticky text-black/60"></i>{" "}
                                          Other Info
                                        </>
                                      }
                                      v={details.otherInfo || "—"}
                                    />
                                  </div>

                                  {/* Editable RFIC / RFISC / EMD Desc – no Save buttons; values are kept until Build AE */}
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {/* RFIC */}
                                    <div
                                      className={`rounded p-2 border ${canEdit ? "border-red-400 bg-red-50" : "border-black/10 bg-black/[0.03]"}`}
                                    >
                                      <div className="text-black/60 text-[12px]">
                                        RFIC
                                      </div>
                                      {canEdit ? (
                                        <input
                                          className="input mt-1 font-medium w-full h-8 px-2"
                                          value={e.rfic || ""}
                                          onChange={(ev) =>
                                            handleFieldChange(
                                              pi,
                                              ei,
                                              "rfic",
                                              ev.target.value,
                                            )
                                          }
                                        />
                                      ) : (
                                        <div className="mt-1 font-medium">
                                          {e.rfic || "—"}
                                        </div>
                                      )}
                                    </div>

                                    {/* RFISC */}
                                    <div
                                      className={`rounded p-2 border ${canEdit ? "border-red-400 bg-red-50" : "border-black/10 bg-black/[0.03]"}`}
                                    >
                                      <div className="text-black/60 text-[12px]">
                                        RFISC
                                      </div>
                                      {canEdit ? (
                                        <input
                                          className="input mt-1 font-medium w-full h-8 px-2"
                                          value={e.rfisc || ""}
                                          onChange={(ev) =>
                                            handleFieldChange(
                                              pi,
                                              ei,
                                              "rfisc",
                                              ev.target.value,
                                            )
                                          }
                                        />
                                      ) : (
                                        <div className="mt-1 font-medium">
                                          {e.rfisc || "—"}
                                        </div>
                                      )}
                                    </div>

                                    {/* EMD Desc */}
                                    <div
                                      className={`rounded p-2 border ${canEdit ? "border-red-400 bg-red-50" : "border-black/10 bg-black/[0.03]"}`}
                                    >
                                      <div className="text-black/60 text-[12px]">
                                        EMD Desc
                                      </div>
                                      {canEdit ? (
                                        <input
                                          className="input mt-1 font-medium w-full h-8 px-2"
                                          value={e.emdDesc || ""}
                                          onChange={(ev) =>
                                            handleFieldChange(
                                              pi,
                                              ei,
                                              "emdDesc",
                                              ev.target.value,
                                            )
                                          }
                                        />
                                      ) : (
                                        <div className="mt-1 font-medium">
                                          {e.emdDesc || "—"}
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Build AE per EMD (only when editable & not built) */}
                                  {canEdit && (
                                    <div className="mt-3">
                                      <button
                                        className="btn btn-success h-8 px-3"
                                        title="Build AE with current values for this EMD"
                                        onClick={() => openBuildFor(pi, ei)}
                                      >
                                        <i className="fa-regular fa-paper-plane mr-1"></i>{" "}
                                        Build AE
                                      </button>
                                    </div>
                                  )}

                                  {/* Processed: ADM area per EMD */}
                                  {isProcessed && (
                                    <div className="mt-3 border border-black/10 rounded p-2 bg-black/[0.03]">
                                      <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-4">
                                          <div className="text-[13px] font-medium">
                                            Is this an ADM?
                                          </div>
                                          <label className="inline-flex items-center gap-1 text-[13px]">
                                            <input
                                              type="radio"
                                              name={`adm-${pi}-${ei}`}
                                              className="h-4 w-4"
                                              checked={e.adm.isAdm === false}
                                              onChange={() =>
                                                setDetails((prev) => {
                                                  const next =
                                                    structuredClone(prev);
                                                  next.passengers[pi].emds[
                                                    ei
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
                                              name={`adm-${pi}-${ei}`}
                                              className="h-4 w-4"
                                              checked={e.adm.isAdm === true}
                                              onChange={() =>
                                                setDetails((prev) => {
                                                  const next =
                                                    structuredClone(prev);
                                                  next.passengers[pi].emds[
                                                    ei
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
                                            className="input flex-1 h-8 px-2"
                                            placeholder="Optional feedback"
                                            value={e.adm.feedback || ""}
                                            onChange={(ev) =>
                                              setDetails((prev) => {
                                                const next =
                                                  structuredClone(prev);
                                                next.passengers[pi].emds[
                                                  ei
                                                ].adm.feedback =
                                                  ev.target.value;
                                                return next;
                                              })
                                            }
                                          />
                                          <button
                                            className="btn btn-success h-8 px-3 disabled:opacity-40"
                                            onClick={() =>
                                              openAdmConfirm(pi, ei)
                                            }
                                            title="Submit Feedback"
                                          >
                                            Submit Feedback
                                          </button>
                                        </div>
                                        {e.adm.submitted && (
                                          <div className="text-green-700 text-[12px]">
                                            <i className="fa-regular fa-circle-check mr-1"></i>
                                            Feedback submitted (Is ADM:{" "}
                                            {e.adm.isAdm ? "Yes" : "No"}
                                            {e.adm.feedback
                                              ? `, Note: ${e.adm.feedback}`
                                              : ""}
                                            )
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Human: Process PNR at end (enabled only when all EMDs built) */}
            {isHuman && (
              <div className="flex w-full justify-center mt-4">
                <button
                  className="btn btn-primary h-9 w-full md:w-1/2 lg:w-1/3 justify-center disabled:opacity-40"
                  title={
                    allEmdsBuilt
                      ? "Process this PNR"
                      : "Build AE for all EMDs to enable"
                  }
                  disabled={!allEmdsBuilt || processSubmitting}
                  onClick={processPNR}
                >
                  {processSubmitting ? <Spinner size="sm" /> : <>Process PNR</>}
                </button>
              </div>
            )}
          </section>
        </div>
      ) : (
        <p className="text-black/70">Loading details…</p>
      )}

      {/* Build AE Modal (per EMD) */}
      {buildOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setBuildOpen(false)}
          ></div>
          <div className="relative bg-white w-[95%] max-w-lg rounded shadow-lg p-5">
            <h5 className="text-lg font-semibold mb-3">Confirm Build AE</h5>

            <div className="text-sm">
              <div className="font-medium mb-1">Changed Fields</div>
              {buildDiff.length === 0 ? (
                <div className="text-black/70">
                  No edits detected (RFIC, RFISC, EMD Desc are unchanged).
                </div>
              ) : (
                <ul className="list-disc pl-5 space-y-1">
                  {buildDiff.map((c) => (
                    <li key={c.field}>
                      <span className="font-medium">{c.field}:</span>{" "}
                      <span className="text-black/60 line-through">
                        {c.from}
                      </span>{" "}
                      <i className="fa-solid fa-arrow-right mx-1 text-black/40"></i>
                      <span>{c.to}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium mb-1">
                Optional feedback
              </label>
              <textarea
                className="input w-full h-20"
                placeholder="Add notes for this build (optional)"
                value={buildFeedback}
                onChange={(e) => setBuildFeedback(e.target.value)}
              />
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                className="btn btn-secondary"
                onClick={() => setBuildOpen(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-success"
                onClick={confirmBuildAE}
                disabled={buildSubmitting}
                title="Confirm Build"
              >
                {buildSubmitting ? <Spinner size="sm" /> : "Confirm Build"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADM Submit Confirmation */}
      {admConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={cancelSubmitADM}
          ></div>
          <div className="relative bg-white w-[95%] max-w-md rounded shadow-lg p-5">
            <h5 className="text-lg font-semibold mb-3">Submit Feedback</h5>
            <div className="text-sm text-black/70">
              Are you sure you want to submit this ADM feedback?
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button className="btn btn-secondary" onClick={cancelSubmitADM}>
                Cancel
              </button>
              <button
                className="btn btn-success"
                onClick={confirmSubmitADM}
                disabled={admSubmitting}
              >
                {admSubmitting ? <Spinner size="sm" /> : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove from Queue Confirmation (Error on Processing) */}
      {removeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={cancelRemoveFromQueue}
          ></div>
          <div className="relative bg-white w-[95%] max-w-md rounded shadow-lg p-5">
            <h5 className="text-lg font-semibold mb-3">Remove from Queue</h5>
            <div className="text-sm text-black/70">
              Remove PNR <span className="font-medium">{selected.pnr}</span>{" "}
              from the list?
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
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
      {viewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setViewOpen(false)}
          ></div>
          <div className="relative bg-white w-[95%] max-w-4xl rounded shadow-lg p-5">
            <div className="flex items-center justify-between">
              <h5 className="text-lg font-semibold">PNR Snapshot</h5>
              <button
                className="btn btn-secondary h-8 px-3 text-xs"
                onClick={() => setViewOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-4">
              {viewLoading ? (
                <div className="flex items-center gap-2 text-black/70">
                  <Spinner size="sm" /> Loading snapshot…
                </div>
              ) : viewError ? (
                <div className="text-red-600">{viewError}</div>
              ) : viewJson ? (
                <pre className="bg-black/5 p-3 rounded max-h-[70vh] overflow-auto text-xs leading-relaxed">
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
