export default async function handler(req, res) {
  try {
    const BACKEND_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(
      /\/+$/,
      "",
    );

    const { path = [] } = req.query;

    // Extract query params WITHOUT "path"
    const query = { ...req.query };
    delete query.path;

    // Build proper query string
    const queryString = new URLSearchParams(query).toString();

    const targetUrl = `${BACKEND_BASE}/api/${path.join("/")}${
      queryString ? `?${queryString}` : ""
    }`;

    console.log("Proxying to:", targetUrl);

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        ...req.headers,
        host: undefined, // prevent host mismatch
      },
      body:
        req.method !== "GET" && req.method !== "HEAD"
          ? JSON.stringify(req.body)
          : undefined,
    });

    const data = await response.text();

    res.status(response.status).send(data);
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: err.message });
  }
}
