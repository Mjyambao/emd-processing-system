import { serverLogger } from "../../utils/serverLogger";

const MAX_BODY_SIZE = 25_000;

function truncate(value, max = 500) {
  if (value == null) return value;
  const s = String(value);
  return s.length > max ? `${s.slice(0, max)}…[truncated]` : s;
}

function sanitizeMetadata(metadata = {}) {
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res
      .status(405)
      .json({ success: false, error: "Method not allowed" });
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

    if (level === "error") serverLogger.error(event, base);
    else if (level === "warn") serverLogger.warn(event, base);
    else if (level === "debug") serverLogger.debug(event, base);
    else serverLogger.info(event, base);

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
