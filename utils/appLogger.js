const LOG_ENDPOINT = "/api/logs";

function createRandomId() {
  try {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const values = new Uint32Array(2);
      crypto.getRandomValues(values);

      // Datadog trace/span IDs are commonly represented as decimal strings.
      const id = (BigInt(values[0]) << 32n) + BigInt(values[1]);
      return id.toString();
    }
  } catch {
    // fallback below
  }

  return `${Date.now()}${Math.floor(Math.random() * 1000000)}`;
}

function createSessionId() {
  try {
    const key = "app_session_id";
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;

    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    sessionStorage.setItem(key, id);
    return id;
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function getSessionTraceId() {
  try {
    const key = "app_trace_id";
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;

    const traceId = createRandomId();
    sessionStorage.setItem(key, traceId);
    return traceId;
  } catch {
    return createRandomId();
  }
}

function getSession() {
  try {
    const raw = localStorage.getItem("session") || "{}";
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function getRoute() {
  if (typeof window === "undefined") return "";
  return `${window.location.pathname}${window.location.search}`;
}

function redact(metadata = {}) {
  if (!metadata || typeof metadata !== "object") return {};

  const blockedKeys = new Set([
    "password",
    "token",
    "accesstoken",
    "idtoken",
    "refreshtoken",
    "authorization",
    "cookie",
    "email",
    "phone",
    "contactemail",
    "contactphone",
    "secret",
    "apikey",
    "api_key",
    "dd_api_key",
  ]);

  if (Array.isArray(metadata)) {
    return metadata.map((item) =>
      item && typeof item === "object" ? redact(item) : item,
    );
  }

  const output = {};

  for (const [key, value] of Object.entries(metadata)) {
    const normalizedKey = String(key).toLowerCase();

    if (blockedKeys.has(normalizedKey)) {
      output[key] = "[redacted]";
    } else if (value && typeof value === "object") {
      output[key] = redact(value);
    } else {
      output[key] = value;
    }
  }

  return output;
}

function getUserId(session) {
  return session?.userId || session?.user?.userId || "";
}

function writeToConsole(level, event, metadata) {
  if (level === "error") {
    console.error(event, metadata);
    return;
  }

  if (level === "warn") {
    console.warn(event, metadata);
    return;
  }

  if (level === "debug") {
    console.debug(event, metadata);
    return;
  }

  // console.log(event, metadata);
}

function send(level, event, metadata = {}) {
  if (typeof window === "undefined") return;

  try {
    const session = getSession();
    const redactedMetadata = redact(metadata);

    const traceId = metadata?.traceId || getSessionTraceId();
    const spanId = metadata?.spanId || createRandomId();

    const payload = {
      level,
      event,
      route: getRoute(),

      // Avoid sending display name/email. Use ID only if available.
      userId: getUserId(session),

      sessionId: createSessionId(),

      // Trace-like correlation IDs for Datadog logs.
      // These help group frontend logs even before full APM is enabled.
      traceId,
      spanId,

      metadata: redactedMetadata,
      timestamp: new Date().toISOString(),
    };

    writeToConsole(level, event, redactedMetadata);

    const body = JSON.stringify(payload);

    // sendBeacon is ideal for logout/navigation because it does not block the UI.
    if (navigator?.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(LOG_ENDPOINT, blob);
      return;
    }

    fetch(LOG_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      // never break UI because logging failed
    });
  } catch {
    // never break UI because logging failed
  }
}

export const appLogger = {
  info: (event, metadata) => send("info", event, metadata),
  warn: (event, metadata) => send("warn", event, metadata),
  error: (event, metadata) => send("error", event, metadata),
  debug: (event, metadata) => {
    if (process.env.NODE_ENV !== "production") {
      send("debug", event, metadata);
    }
  },
};
