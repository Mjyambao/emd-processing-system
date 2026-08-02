function parseTags(tagsValue = "") {
  const tags = {};

  String(tagsValue)
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .forEach((tag) => {
      const [key, ...rest] = tag.split(":");

      if (key && rest.length) {
        tags[key] = rest.join(":");
      }
    });

  return tags;
}

try {
  if (process.env.DD_TRACE_ENABLED === "true") {
    require("dd-trace").init({
      service: process.env.DD_SERVICE || "frontend-ui",
      env: process.env.DD_ENV || "uat",
      version: process.env.DD_VERSION || "1.0",
      logInjection: process.env.DD_LOGS_INJECTION === "true",
      startupLogs: true,
    });

    console.log("[DATADOG] initialized");
  } else {
    console.log("[DATADOG] disabled");
  }
} catch (err) {
  console.error("[DATADOG] initialization failed", err);
}
