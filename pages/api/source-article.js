export default async function handler(req, res) {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({
        message: "Missing url",
      });
    }

    const response = await fetch(url);

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
