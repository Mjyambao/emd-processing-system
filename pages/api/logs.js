import { serverLogger } from "../../utils/serverLogger";

const MAX_BODY_SIZE = 25_000;

function truncate(value, max = 500) {
  if (value == null) return value;

  const s = String(value);

  return s.length > max ? `${s.slice(0, max)}...[truncated]` : s;
}

function sanitizeMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== "object") {
    return {};
  }

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

  const output = {};

  for (const [key, value] of Object.entries(metadata)) {
    const normalizedKey = String(key).toLowerCase();

    if (blockedKeys.has(normalizedKey)) {
      output[key] = "[redacted]";
      continue;
    }

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      output[key] = truncate(value);
      continue;
    }

    if (value == null) {
      output[key] = value;
      continue;
    }

    try {
      output[key] = truncate(JSON.stringify(value), 1000);
    } catch {
      output[key] = "[unserializable]";
    }
  }

  return output;
}

function datadogLogsEnabled() {
  return process.env.DD_LOGS_ENABLED?.toLowerCase() === "true";
}

function getDatadogLogsUrl() {
  const site = process.env.DD_SITE || "us3.datadoghq.com";

  return `https://http-intake.logs.${site}/api/v2/logs`;
}

async function sendToDatadog(level, event, base) {
  try {
    if (!datadogLogsEnabled()) {
      return;
    }

    const apiKey = process.env.DD_API_KEY;

    if (!apiKey) {
      console.error("[DATADOG] DD_API_KEY not configured");
      return;
    }

    const tags = [
      process.env.DD_TAGS || "",
      process.env.DD_ENV ? `env:${process.env.DD_ENV}` : "",
      process.env.DD_SERVICE ? `service:${process.env.DD_SERVICE}` : "",
      process.env.DD_VERSION ? `version:${process.env.DD_VERSION}` : "",
    ]
      .filter(Boolean)
      .join(",");

    const datadogLog = {
      message: event,

      status: level,

      service: process.env.DD_SERVICE || "tix-ui",

      env: process.env.DD_ENV || "dev",

      version: process.env.DD_VERSION || "1.0",

      ddsource: "nextjs",

      ddtags: tags,

      hostname: "azure-app-service",

      route: base.route,
      session_id: base.sessionId,
      user_id: base.userId,
      correlation_id: base.correlationId,

      userAgent: base.userAgent,
      ip: base.ip,

      metadata: base.metadata,

      frontend: {
        source: base.source,
        route: base.route,
        timestamp: new Date().toISOString(),
      },
    };

    const response = await fetch(getDatadogLogsUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "DD-API-KEY": apiKey,
      },
      body: JSON.stringify([datadogLog]),
    });

    if (!response.ok) {
      const errorText = await response.text();

      console.error("[DATADOG] Log intake failed", {
        status: response.status,
        error: errorText,
      });
    }
  } catch (error) {
    console.error("[DATADOG] Failed to send log", error);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }

  try {
    const rawSize = Buffer.byteLength(JSON.stringify(req.body || {}), "utf8");

    if (rawSize > MAX_BODY_SIZE) {
      serverLogger.warn("CLIENT_LOG_REJECTED_TOO_LARGE", {
        rawSize,
        ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "",
      });

      return res.status(413).json({
        success: false,
        error: "Log payload too large",
      });
    }

    const body = req.body || {};

    const level = ["info", "warn", "error", "debug"].includes(body.level)
      ? body.level
      : "info";

    const event =
      typeof body.event === "string" && body.event.trim()
        ? body.event.trim()
        : "CLIENT_ACTIVITY";

    const base = {
      source: "client",

      route: truncate(body.route || ""),

      userId: truncate(body.userId || ""),

      userName: truncate(body.userName || ""),

      sessionId: truncate(body.sessionId || ""),

      correlationId: truncate(body.correlationId || ""),

      userAgent: truncate(req.headers["user-agent"] || "", 300),

      ip: truncate(
        req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "",
        200,
      ),

      metadata: sanitizeMetadata(body.metadata || {}),
    };

    // Existing logger
    if (level === "error") {
      serverLogger.error(event, base);
    } else if (level === "warn") {
      serverLogger.warn(event, base);
    } else if (level === "debug") {
      serverLogger.debug(event, base);
    } else {
      serverLogger.info(event, base);
    }

    // Datadog forwarding
    await sendToDatadog(level, event, base);

    return res.status(204).end();
  } catch (err) {
    serverLogger.error("CLIENT_LOG_ENDPOINT_FAILED", {
      message: err?.message || "Unknown error",
      stack: err?.stack,
    });

    return res.status(500).json({
      success: false,
      error: "Failed to write log",
    });
  }
}
