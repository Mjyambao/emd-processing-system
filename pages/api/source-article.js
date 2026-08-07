export default async function handler(req, res) {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({
        message: "Missing url",
      });
    }

    let parsedUrl;

    try {
      parsedUrl = new URL(url);
    } catch {
      return res.status(400).json({
        message: "Invalid URL",
      });
    }

    if (
      parsedUrl.protocol !== "https:" ||
      !parsedUrl.hostname.endsWith(".blob.core.windows.net")
    ) {
      return res.status(403).json({
        message: "Invalid source",
      });
    }

    const response = await fetch(parsedUrl.toString());

    if (!response.ok) {
      return res.status(response.status).json({
        message: "Failed to load document",
      });
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    res.setHeader(
      "Content-Type",
      response.headers.get("content-type") || "application/octet-stream",
    );

    res.setHeader("Content-Disposition", "inline");

    res.send(buffer);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Unable to retrieve source article",
    });
  }
}
