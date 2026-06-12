import { NextResponse } from "next/server";

// Change to your actual backend private hostname
const BACKEND_BASE =
  "https://app-backend-sup-ai-dev-cac01.privatelink.azurewebsites.net";

async function forwardRequest(request, params) {
  const path = params.path.join("/");
  const url = `${BACKEND_BASE}/${path}${request.nextUrl.search}`;

  const headers = new Headers(request.headers);

  // Optional: remove host header to prevent mismatch issues
  headers.delete("host");

  let body = null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = await request.text();
  }

  const backendResponse = await fetch(url, {
    method: request.method,
    headers,
    body,
  });

  const text = await backendResponse.text();

  return new NextResponse(text, {
    status: backendResponse.status,
    headers: backendResponse.headers,
  });
}

export async function GET(req, context) {
  return forwardRequest(req, context.params);
}

export async function POST(req, context) {
  return forwardRequest(req, context.params);
}

export async function PUT(req, context) {
  return forwardRequest(req, context.params);
}

export async function PATCH(req, context) {
  return forwardRequest(req, context.params);
}

export async function DELETE(req, context) {
  return forwardRequest(req, context.params);
}
