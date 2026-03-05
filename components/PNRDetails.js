import { useEffect, useRef, useState } from "react";
import StatusBadge from "./StatusBadge";
import Field from "./Field";
// import Tooltip from "./Tooltip"; // intentionally removed per requirement
import Spinner from "./Spinner";
import PNRDetailsActionBar from "../components/PNRDetailsActionBar";
import formatDate from "../utils/helper";

/** ---------- Helpers (outside component) ---------- */
const norm = (v) => (v ?? "").toString().trim();
function getChangedFields(current, baseline) {
  const diffs = [];
  if (norm(current.rfic) !== norm(baseline.rfic)) {
    diffs.push({ field: "RFIC", from: baseline.rfic, to: current.rfic });
  }
  if (norm(current.rfisc) !== norm(baseline.rfisc)) {
    diffs.push({ field: "RFISC", from: baseline.rfisc, to: current.rfisc });
  }
  if (norm(current.emdDesc) !== norm(baseline.emdDesc)) {
    diffs.push({
      field: "EMD Desc",
      from: baseline.emdDesc,
      to: current.emdDesc,
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
  // Optional action handlers provided by parent
  onRetry, // (pnr) => void
  onRemoveFromQueue, // (pnr) => void
  onSendToQueue, // ({ pnr, queueType, assigneeName }) => void
}) {
  /** -------------------- HOOKS (fixed order) -------------------- */
  const [details, setDetails] = useState(null);

  const [edit, setEdit] = useState({
    rfic: false,
    rfisc: false,
    emdDesc: false,
  });
  const [codes, setCodes] = useState({ rfic: "", rfisc: "", emdDesc: "" });

  // Baselines
  const [orig, setOrig] = useState({ rfic: "", rfisc: "", emdDesc: "" }); // last-saved (for dirty UX)
  const initialBaselineRef = useRef({ rfic: "", rfisc: "", emdDesc: "" }); // original at load (for Build AE modal)

  const [approving, setApproving] = useState(false);

  // Build AE modal
  const [buildOpen, setBuildOpen] = useState(false);
  const [buildFeedback, setBuildFeedback] = useState("");
  const [buildSubmitting, setBuildSubmitting] = useState(false);
  const [buildDiff, setBuildDiff] = useState([]);

  // Processed → ADM
  const [admChecked, setAdmChecked] = useState(false);
  const [admFeedback, setAdmFeedback] = useState("");
  const [admSubmitting, setAdmSubmitting] = useState(false);

  // NEW: View PNR JSON modal
  const [viewOpen, setViewOpen] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState("");
  const [viewJson, setViewJson] = useState(null);

  // Safe handler fallbacks (no-op) to avoid undefined function errors
  const handlers = {
    retry: onRetry ?? (() => {}),
    removeFromQueue: onRemoveFromQueue ?? (() => {}),
    sendToQueue: onSendToQueue ?? (() => {}),
  };

  // Status helpers
  const statusLower = (selected?.status || "").toLowerCase();
  const isHuman =
    statusLower === "human" || statusLower === "human input required";
  const isProcessing = statusLower === "processing";
  const isProcessed = statusLower === "processed";
  const isError = statusLower.includes("error"); // only show error panel on error-like statuses

  // Error details text (from table row preferred)
  const errorDetailsText =
    selected?.errorDetails || selected?.errorDesc || details?.errorDesc || "";

  // Derived
  const dirty = getChangedFields(codes, orig).length > 0;
  const showErrorPanel = isError && !!norm(errorDetailsText);

  /** -------------------- EFFECTS -------------------- */

  // Load details (Sabre JSON for GLEBNY, mock for others)
  useEffect(() => {
    let active = true;

    async function load() {
      if (!selected) {
        setDetails(null);
        return;
      }

      // Reset edit toggles
      setEdit({ rfic: false, rfisc: false, emdDesc: false });

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
        const ticket = (data?.flightTickets || [])[0] || {};
        const ssr = (data?.specialServices || [])[0] || {};

        const obj = {
          pnr: data?.request?.confirmationId || selected.pnr,
          bookingId: data?.bookingId,
          isTicketed: data?.isTicketed,
          agencyIata: data?.creationDetails?.agencyIataNumber,
          pcc: data?.creationDetails?.userWorkPcc,
          created:
            `${data?.creationDetails?.creationDate || ""} ${data?.creationDetails?.creationTime || ""}`.trim(),
          contactEmail,
          contactPhone,
          travelerName:
            `${traveler?.givenName || ""} ${traveler?.middleName || ""} ${traveler?.surname || ""}`
              .replace(/\s+/g, " ")
              .trim(),
          flightNo:
            `${flight?.airlineCode || ""} ${flight?.flightNumber || ""}`.trim(),
          operating:
            `${flight?.operatingAirlineCode || ""} ${flight?.operatingFlightNumber || ""}`.trim(),
          route: `${flight?.fromAirportCode || ""} → ${flight?.toAirportCode || ""}`,
          dep: `${flight?.updatedDepartureDate || flight?.departureDate || ""} ${flight?.updatedDepartureTime || flight?.departureTime || ""}`.trim(),
          arr: `${flight?.updatedArrivalDate || flight?.arrivalDate || ""} ${flight?.updatedArrivalTime || flight?.arrivalTime || ""}`.trim(),
          seat: flight?.seats?.[0]?.number,
          emdNo: anc?.electronicMiscellaneousDocumentNumber,
          rfic: anc?.reasonForIssuanceCode, // e.g., 'C'
          rfisc: anc?.subcode, // e.g., '05Z'
          emdDesc: anc?.commercialName,
          emdStatus: anc?.statusName,
          emdTotal:
            `${emdTotals?.total || ""} ${emdTotals?.currencyCode || ""}`.trim(),
          ssrCode: ssr?.code, // e.g., 'WCHR'
          ticketNo: ticket?.number,
          otherInfo: extractOtherInfoSabre(data),
          errorDesc: data?.errors?.[0]?.description, // best effort
        };

        setDetails(obj);

        const baseline = {
          rfic: obj.rfic || "",
          rfisc: obj.rfisc || "",
          emdDesc: obj.emdDesc || "",
        };
        initialBaselineRef.current = baseline; // frozen baseline for Build AE modal
        setCodes(baseline);
        setOrig(baseline); // last-saved starts same as baseline
      } else {
        const obj = {
          pnr: selected.pnr,
          bookingId: "1SXXX1A2B3C4D",
          isTicketed: true,
          agencyIata: "99119911",
          pcc: "AB12",
          created: "2024-01-09 15:00",
          contactEmail: "travel@sabre.com",
          contactPhone: "+1-555-123-4567",
          travelerName: selected.passenger,
          flightNo: "AA 123",
          operating: "UA 321",
          route: "DFW → HNL",
          dep: "2024-07-09 09:25",
          arr: "2024-07-09 12:38",
          seat: "13A",
          emdNo: "6074333222111",
          rfic: "C",
          rfisc: "05Z",
          emdDesc: "UPTO33LB 15KG BAGGAGE",
          emdStatus: "Confirmed",
          emdTotal: "128.00 USD",
          ssrCode: "WCHR",
          ticketNo: "0167489825830",
          otherInfo: "Unassisted minor international", // mock for non-GLEBNY
          errorDesc: selected?.errorDesc,
        };
        setDetails(obj);

        const baseline = {
          rfic: obj.rfic,
          rfisc: obj.rfisc,
          emdDesc: obj.emdDesc,
        };
        initialBaselineRef.current = baseline;
        setCodes(baseline);
        setOrig(baseline);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [selected]);

  // Keep the diff up to date while Build AE modal is open
  useEffect(() => {
    if (buildOpen) {
      setBuildDiff(getChangedFields(codes, initialBaselineRef.current));
    }
  }, [buildOpen, codes]);

  /** -------------------- Handlers -------------------- */

  async function approveIfClean() {
    if (dirty) return;
    setApproving(true);
    try {
      await new Promise((r) => setTimeout(r, 600));
      onApprove?.({
        pnr: selected.pnr,
        rfic: codes.rfic,
        rfisc: codes.rfisc,
        emdDesc: codes.emdDesc,
      });
    } finally {
      setApproving(false);
    }
  }

  async function saveEdits() {
    setApproving(true);
    try {
      await new Promise((r) => setTimeout(r, 600));
      onApprove?.({
        pnr: selected.pnr,
        rfic: codes.rfic,
        rfisc: codes.rfisc,
        emdDesc: codes.emdDesc,
      });
      // Update last-saved (orig), but DO NOT change initial baseline.
      setOrig({ ...codes });
      setEdit({ rfic: false, rfisc: false, emdDesc: false });
    } finally {
      setApproving(false);
    }
  }

  function openBuildModal() {
    // Snapshot diff against initial baseline at open-time
    setBuildDiff(getChangedFields(codes, initialBaselineRef.current));
    setBuildOpen(true);
  }

  async function confirmBuildAE() {
    setBuildSubmitting(true);
    try {
      // TODO: call your API to build AE here
      await new Promise((r) => setTimeout(r, 800));
      // After a successful build, advance the initial baseline to current values
      initialBaselineRef.current = { ...codes };
      setBuildOpen(false);
      setBuildFeedback("");
    } finally {
      setBuildSubmitting(false);
    }
  }

  async function submitADM() {
    if (!admChecked) return;
    setAdmSubmitting(true);
    try {
      // TODO: call your API to submit ADM here
      await new Promise((r) => setTimeout(r, 700));
      setAdmChecked(false);
      setAdmFeedback("");
    } finally {
      setAdmSubmitting(false);
    }
  }

  function handleErrorAction(action) {
    if (!action) return;
    if (action === "retry") {
      handlers.retry(selected.pnr);
    } else if (action === "assign") {
      handlers.sendToQueue({
        pnr: selected.pnr,
        queueType: "manual",
        assigneeName: "",
      });
    } else if (action === "remove") {
      handlers.removeFromQueue(selected.pnr);
    }
  }

  // NEW: View PNR modal logic — fetch snapshot on open
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

          {/* NEW: View PNR button */}
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

        {/* Right side: Current Status + (conditional) Error Details */}
        <div className="text-sm text-black/60 flex flex-col items-end gap-2 w-full md:w-auto">
          {/* Row 1: Current Status + Action Bar */}
          <div className="flex items-center gap-2">
            <span>Current Status:</span>
            <StatusBadge status={selected.status} />
            {isError ? (
              <div>
                <PNRDetailsActionBar
                  errorDetails={selected.error}
                  onRetry={() => handlers.retry(selected.pnr)}
                  onRemoveFromQueue={() =>
                    handlers.removeFromQueue(selected.pnr)
                  }
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
        </div>
      </div>

      {/* Body */}
      {details ? (
        <div className="mt-8 space-y-8 text-sm mb-4">
          {/* PNR & Booking */}
          <section>
            <h4 className="section-title text-md">
              <i className="fa-solid fa-clipboard-list text-brand-red"></i> PNR
              & Booking
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
                v={"EMD"}
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
                    <i className="fa-regular fa-envelope text-black/60"></i> GDS
                  </>
                }
                v={"SABRE"}
              />
              <Field
                k={
                  <>
                    <i className="fa-solid fa-phone text-black/60"></i> Brand
                  </>
                }
                v={"ECO FLEX"}
              />
            </div>
          </section>

          {/* Traveler & Flight */}
          <section>
            <h4 className="section-title text-md">
              <i className="fa-solid fa-person-walking-luggage text-brand-red"></i>{" "}
              Traveler & Flight
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Field
                k={
                  <>
                    <i className="fa-regular fa-user text-black/60"></i>{" "}
                    Passenger
                  </>
                }
                v={details.travelerName || "—"}
              />
              <Field
                k={
                  <>
                    <i className="fa-solid fa-plane text-black/60"></i> Flight
                    No.
                  </>
                }
                v={details.flightNo || "—"}
              />
              <Field
                k={
                  <>
                    <i className="fa-solid fa-tag text-black/60"></i> Operating
                  </>
                }
                v={details.operating || "—"}
              />
              <Field
                k={
                  <>
                    <i className="fa-solid fa-location-dot text-black/60"></i>{" "}
                    Route
                  </>
                }
                v={details.route || "—"}
              />
              <Field
                k={
                  <>
                    <i className="fa-solid fa-plane-departure text-black/60"></i>{" "}
                    Departure
                  </>
                }
                v={formatDate(details.dep) || "—"}
              />
              <Field
                k={
                  <>
                    <i className="fa-solid fa-plane-arrival text-black/60"></i>{" "}
                    Arrival
                  </>
                }
                v={formatDate(details.arr) || "—"}
              />
              <Field
                k={
                  <>
                    <i className="fa-solid fa-chair text-black/60"></i> Seat
                  </>
                }
                v={details.seat || "—"}
              />
              <Field
                k={
                  <>
                    <i className="fa-solid fa-hashtag text-black/60"></i> Ticket
                    No.
                  </>
                }
                v={details.ticketNo || "—"}
              />
            </div>
          </section>

          {/* EMD & SSR */}
          <section>
            <h4 className="section-title text-md">
              <i className="fa-solid fa-passport text-brand-red"></i> EMD & SSR
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Field
                k={
                  <>
                    <i className="fa-solid fa-ticket text-black/60"></i> EMD No.
                  </>
                }
                v={details.emdNo || "—"}
              />
              <Field
                k={
                  <>
                    <i className="fa-regular fa-circle-dot text-black/60"></i>{" "}
                    EMD Status
                  </>
                }
                v={details.emdStatus || "—"}
              />
              <Field
                k={
                  <>
                    <i className="fa-solid fa-dollar-sign text-black/60"></i>{" "}
                    EMD Total
                  </>
                }
                v={details.emdTotal || "—"}
              />

              {/* EMD Desc (editable when Human Input Required) */}
              <div
                className={`bg-black/5 border ${isHuman ? "border-2 border-red-500" : "border-black/10"} rounded p-3`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="text-md text-black/50">EMD Desc</div>
                    {isHuman && edit.emdDesc ? (
                      <input
                        className="input mt-1 font-medium w-full"
                        value={codes.emdDesc}
                        onChange={(e) =>
                          setCodes({ ...codes, emdDesc: e.target.value })
                        }
                      />
                    ) : (
                      <div className="mt-2 font-medium">
                        {codes.emdDesc || "—"}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-5 shrink-0">
                    {!isHuman ? null : edit.emdDesc ? (
                      <>
                        <button
                          className="btn btn-primary mt-1.5"
                          title="Save changes"
                          onClick={saveEdits}
                        >
                          <i className="fa-solid fa-floppy-disk"></i>
                        </button>
                        <button
                          className="btn btn-secondary mt-1.5"
                          title="Cancel"
                          onClick={() => {
                            setEdit((prev) => ({ ...prev, emdDesc: false }));
                            setCodes({
                              ...codes,
                              emdDesc: details.emdDesc || "",
                            });
                          }}
                        >
                          <i className="fa-solid fa-xmark"></i>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn btn-outline"
                          title="Edit EMD Desc"
                          onClick={() =>
                            setEdit((prev) => ({ ...prev, emdDesc: true }))
                          }
                        >
                          <i className="fa-solid fa-pen"></i>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <Field
                k={
                  <>
                    <i className="fa-solid fa-puzzle-piece text-black/60"></i>{" "}
                    SSR
                  </>
                }
                v={details.ssrCode || "—"}
              />

              {/* RFIC */}
              <div
                className={`bg-black/5 border ${isHuman ? "border-2 border-red-500" : "border-black/10"} rounded p-3`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="text-md text-black/50">RFIC</div>
                    {isHuman && edit.rfic ? (
                      <input
                        className="input mt-1 font-medium w-full"
                        value={codes.rfic}
                        onChange={(e) =>
                          setCodes({ ...codes, rfic: e.target.value })
                        }
                      />
                    ) : (
                      <div className="mt-2 font-medium">
                        {codes.rfic || "—"}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-5 shrink-0">
                    {!isHuman ? null : edit.rfic ? (
                      <>
                        <button
                          className="btn btn-primary mt-1.5"
                          title="Save changes"
                          onClick={saveEdits}
                        >
                          <i className="fa-solid fa-floppy-disk"></i>
                        </button>
                        <button
                          className="btn btn-secondary mt-1.5"
                          title="Cancel"
                          onClick={() => {
                            setEdit((prev) => ({ ...prev, rfic: false }));
                            setCodes({ ...codes, rfic: details.rfic || "" });
                          }}
                        >
                          <i className="fa-solid fa-xmark"></i>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn btn-outline"
                          title="Edit RFIC"
                          onClick={() =>
                            setEdit((prev) => ({ ...prev, rfic: true }))
                          }
                        >
                          <i className="fa-solid fa-pen"></i>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* RFISC */}
              <div
                className={`bg-black/5 border ${isHuman ? "border-2 border-red-500" : "border-black/10"} rounded p-3`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="text-md text-black/50">RFISC</div>
                    {isHuman && edit.rfisc ? (
                      <input
                        className="input mt-1 font-medium w-full"
                        value={codes.rfisc}
                        onChange={(e) =>
                          setCodes({ ...codes, rfisc: e.target.value })
                        }
                      />
                    ) : (
                      <div className="mt-2 font-medium">
                        {codes.rfisc || "—"}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-5 shrink-0">
                    {!isHuman ? null : edit.rfisc ? (
                      <>
                        <button
                          className="btn btn-primary mt-1.5"
                          title="Save changes"
                          onClick={saveEdits}
                        >
                          <i className="fa-solid fa-floppy-disk"></i>
                        </button>
                        <button
                          className="btn btn-secondary mt-1.5"
                          title="Cancel"
                          onClick={() => {
                            setEdit((prev) => ({ ...prev, rfisc: false }));
                            setCodes({ ...codes, rfisc: details.rfisc || "" });
                          }}
                        >
                          <i className="fa-solid fa-xmark"></i>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn btn-outline"
                          title="Edit RFISC"
                          onClick={() =>
                            setEdit((prev) => ({ ...prev, rfisc: true }))
                          }
                        >
                          <i className="fa-solid fa-pen"></i>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Other Info from Sabre JSON */}
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

            {/* Visible note (replaces old tooltips) */}
            <div className="mt-3 text-xs text-black/70 bg-black/5 p-3 rounded">
              <div className="font-semibold mb-1">Note on RFIC/RFISC</div>
              <div>
                Other info <em>"unassisted minor international"</em> maps to
                Qantas airline EMD‑S code.
              </div>
              <div className="mt-1">
                Retrieved from Sabre/Qantas reference:&nbsp;
                <a
                  target="_blank"
                  className="text-blue-600"
                  href="https://www.qantas.com/content/dam/qac/policies-and-guidelines/emd-quick-reference-guide.pdf"
                >
                  Airline EMD Codes (Qantas)
                </a>
              </div>
            </div>

            {/* Human Input Required → Build AE */}
            {isHuman ? (
              <div className="flex w-full justify-center">
                <button
                  className="btn btn-success mt-8 h-[45px] w-full md:w-1/2 lg:w-1/3 justify-center"
                  title="Build AE with current values"
                  onClick={openBuildModal}
                >
                  {buildSubmitting ? (
                    <Spinner size="sm" />
                  ) : (
                    <>
                      <i className="fa-regular fa-paper-plane"></i> Build AE
                    </>
                  )}
                </button>
              </div>
            ) : null}

            {/* Processed → ADM checkbox + feedback + submit */}
            {isProcessed && (
              <div className="mt-6 border border-black/10 rounded p-3 bg-black/5">
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={admChecked}
                      onChange={(e) => setAdmChecked(e.target.checked)}
                    />
                    <span className="font-medium">ADM</span>
                  </label>

                  <input
                    type="text"
                    className="input flex-1"
                    placeholder="Optional feedback"
                    value={admFeedback}
                    onChange={(e) => setAdmFeedback(e.target.value)}
                  />

                  <button
                    className="btn btn-success disabled:opacity-40"
                    disabled={!admChecked || admSubmitting}
                    onClick={submitADM}
                    title="Submit ADM"
                  >
                    {admSubmitting ? <Spinner size="sm" /> : <>Submit ADM</>}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      ) : (
        <p className="text-black/70">Loading details…</p>
      )}

      {/* Build AE Modal */}
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
                        {norm(c.from) || "—"}
                      </span>{" "}
                      <i className="fa-solid fa-arrow-right mx-1 text-black/40"></i>
                      <span>{norm(c.to) || "—"}</span>
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

      {/* NEW: View PNR JSON Modal */}
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
