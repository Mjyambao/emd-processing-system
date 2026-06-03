function normalizeStatus(v) {
  return (v ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export default function StatusBadge({ status }) {
  const raw = status ?? "";
  const normalized = normalizeStatus(raw);

  let className =
    "inline-flex items-center gap-1 border rounded-md px-3 py-2 text-xs w-[180px] justify-center";
  let icon = null;
  let label = raw || "—";

  // IMPORTANT: check error-like statuses BEFORE processing
  if (
    normalized === "sent_back_to_oasis" ||
    normalized === "sent back to oasis"
  ) {
    className += " bg-blue-100 text-blue-800 border-blue-200 ";
    icon = <i className="fa-solid fa-circle-exclamation" />;
    label = "Sent back to Oasis Queue";
  } else if (normalized.includes("error")) {
    className += " bg-red-50 text-red-700 border-red-200";
    icon = <i className="fa-solid fa-triangle-exclamation" />;
    label = "Error on processing";
  } else if (normalized === "human" || normalized === "human input required") {
    className += " bg-slate-200 text-slate-700 border-slate-200";
    icon = <i className="fa-solid fa-user-pen" />;
    label = "Human Input Required";
  } else if (normalized === "processed") {
    className += " bg-green-100 text-green-700 border-green-200";
    icon = <i className="fa-solid fa-circle-check" />;
    label = "Processed";
  } else if (normalized === "processing") {
    className += " bg-amber-50 text-amber-700 border-amber-200";
    icon = <i className="fa-solid fa-spinner fa-spin" />;
    label = "Processing";
  } else {
    className += " bg-black/5 text-black/70 border-black/10";
    icon = <i className="fa-regular fa-circle" />;
    label = raw || "—";
  }

  return (
    <span className={className}>
      {icon}
      <span>{label}</span>
    </span>
  );
}
