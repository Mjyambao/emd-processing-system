import { serverLogger } from "../../utils/serverLogger";

const ALLOWED_CONTENT_TYPES = [
  "application/json",
  "application/pdf",
  "application/octet-stream",
];

export default async function handler(req, res) {
  try {
    const BACKEND_BASE = (process.env.API_BASE_URL || "").replace(/\/+$/, "");

    const { path = [] } = req.query;

    const query = { ...req.query };
    delete query.path;

    const queryString = new URLSearchParams(query).toString();

    const targetUrl = `${BACKEND_BASE}/api/${path.join("/")}${
      queryString ? `?${queryString}` : ""
    }`;

    console.log("Proxying to:", targetUrl);

    serverLogger.info("API_PROXY_REQUEST", {
      method: req.method,
      path: path.join("/"),
      hasQueryString: Boolean(queryString),
      targetUrl,
    });

    const startedAt = Date.now();

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        ...req.headers,
        host: undefined,
      },
      body:
        req.method !== "GET" && req.method !== "HEAD"
          ? JSON.stringify(req.body)
          : undefined,
    });

    const durationMs = Date.now() - startedAt;

    serverLogger.info("API_PROXY_RESPONSE", {
      method: req.method,
      path: path.join("/"),
      status: response.status,
      durationMs,
    });

    const contentType =
      response.headers.get("content-type")?.toLowerCase() || "";

    // Block HTML and any unsupported content type
    if (
      contentType &&
      !ALLOWED_CONTENT_TYPES.some((type) => contentType.startsWith(type))
    ) {
      serverLogger.warn("API_PROXY_BLOCKED_CONTENT_TYPE", {
        contentType,
        targetUrl,
      });

      return res.status(403).json({
        error: "Unsupported content type",
      });
    }

    const data = await response.arrayBuffer();

    // Safely handle JSON responses
    if (contentType.startsWith("application/json")) {
      const json = JSON.parse(Buffer.from(data).toString("utf8"));

      return res.status(response.status).json(json);
    }

    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }

    res.status(response.status).send(Buffer.from(data));
  } catch (err) {
    serverLogger.error("API_PROXY_ERROR", {
      method: req.method,
      message: err?.message || "Unknown proxy error",
      stack: err?.stack,
    });

    res.status(500).json({
      error: "Internal proxy error",
    });
  }
}
