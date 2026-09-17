// Public downloader-status proxy: like ../route.ts (no Clerk — signed-out visitors poll this), but the backend
// path is /api/tools/download/status.
async function forward(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return Response.json({ detail: "Cross-site requests are not allowed." }, { status: 403 });
  }
  const { BACKEND_URL } = process.env;
  if (!BACKEND_URL) return Response.json({ detail: "Set BACKEND_URL in apps/website/.env.local." }, { status: 500 });
  try {
    const response = await fetch(`${BACKEND_URL}/api/tools/download/status${new URL(request.url).search}`, {
      method: request.method, cache: "no-store",
    });
    return Response.json(await response.json(), { status: response.status });
  } catch {
    return Response.json({ detail: "Can't reach YT-Clipper right now. Try again in a minute." }, { status: 502 });
  }
}

export { forward as GET };
