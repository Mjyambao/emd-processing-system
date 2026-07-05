const LOG_ENDPOINT = "/api/logs";

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
    "accessToken",
    "idToken",
    "refreshToken",
    "authorization",
    "cookie",
    "email",
    "phone",
    "contactEmail",
    "contactPhone",
  ]);

  const output = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (blockedKeys.has(String(key).toLowerCase())) {
      output[key] = "[redacted]";
    } else {
      output[key] = value;
    }
  }

  return output;
}

function send(level, event, metadata = {}) {
  if (typeof window === "undefined") return;

  try {
    const session = getSession();

    const payload = {
      level,
      event,
      route: getRoute(),
      userId: session?.userId || session?.user?.userId || "",
      userName: session?.name || session?.user?.name || "",
      sessionId: createSessionId(),
      metadata: redact(metadata),
      timestamp: new Date().toISOString(),
    };

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
