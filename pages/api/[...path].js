import { serverLogger } from "../../utils/serverLogger";

const MAX_BODY_SIZE = 1024 * 1024; // 1MB

export default async function handler(req, res) {
  try {
    // Security Headers (apply to ALL responses)
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Permissions-Policy",
      "geolocation=(), microphone=(), camera=()",
    );
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "connect-src 'self' https:",
        "frame-ancestors 'none'",
      ].join("; "),
    );
    res.setHeader("Cache-Control", "no-store");

    const origin = req.headers.origin || `https://${req.headers.host}`;

    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");

    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    // Request size guard
    if (req.body && JSON.stringify(req.body).length > MAX_BODY_SIZE) {
      return res.status(413).json({ error: "Request too large" });
    }

    const BACKEND_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(
      /\/+$/,
      "",
    );

    const { path = [] } = req.query;
    const query = { ...req.query };
    delete query.path;

    const queryString = new URLSearchParams(query).toString();

    const targetUrl = `${BACKEND_BASE}/api/${path.join("/")}${
      queryString ? `?${queryString}` : ""
    }`;

    serverLogger.info("API_PROXY_REQUEST", {
      method: req.method,
      path: path.join("/"),
      targetUrl,
    });

    const startedAt = Date.now();

    // Sanitize forwarded headers (IMPORTANT)
    const allowedHeaders = {
      Authorization: req.headers.authorization,
      "Content-Type": req.headers["content-type"],
    };

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: allowedHeaders,
      body:
        req.method !== "GET" && req.method !== "HEAD"
          ? JSON.stringify(req.body)
          : undefined,
    });

    const durationMs = Date.now() - startedAt;

    serverLogger.info("API_PROXY_RESPONSE", {
      method: req.method,
      status: response.status,
      durationMs,
    });

    // Response handling
    const contentType = response.headers.get("content-type");
    const data = await response.arrayBuffer();

    res.status(response.status);

    // Force safe content-type only
    if (contentType?.includes("application/json")) {
      res.setHeader("Content-Type", "application/json");
    } else if (contentType?.includes("text/")) {
      res.setHeader("Content-Type", contentType);
    } else {
      res.setHeader("Content-Type", "application/octet-stream");
    }

    res.send(Buffer.from(data));
  } catch (err) {
    serverLogger.error("API_PROXY_ERROR", {
      method: req.method,
      message: err?.message || "Unknown proxy error",
      stack: err?.stack,
    });

    res.status(500).json({ error: "Internal Server Error" });
  }
}
