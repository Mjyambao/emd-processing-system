export function formatDate(date) {
  if (date != null) {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    return new Date(date)
      .toLocaleString("en-GB", {
        timeZone:
          // timezone === "Asia/Shanghai" ? "Asia/Shanghai" : "Australia/Brisbane",
          "Australia/Brisbane",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
      .replace(/\//g, "-");
  } else {
    return "—";
  }
}

export function formatDatetime(date) {
  if (date != null) {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    return new Date(date)
      .toLocaleString("en-GB", {
        timeZone:
          // timezone === "Asia/Shanghai" ? "Asia/Shanghai" : "Australia/Brisbane",
          "Australia/Brisbane",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
      .replace(/\//g, "-");
  } else {
    return "—";
  }
}

export function toYYYYMMDD(input) {
  if (!input) return "";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}-${day}-${y}`;
}
