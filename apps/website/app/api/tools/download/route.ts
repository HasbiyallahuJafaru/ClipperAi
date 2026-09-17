// Public downloader proxy: unlike /api/[...path] this forwards WITHOUT a Clerk session — the free downloader is
// for signed-out visitors. Same-origin check like the signed proxy; the backend rate-limits by IP.
async function forward(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return Response.json({ detail: "Cross-site requests are not allowed." }, { status: 403 });
  }
  const { BACKEND_URL } = process.env;
  if (!BACKEND_URL) return Response.json({ detail: "Set BACKEND_URL in apps/website/.env.local." }, { status: 500 });
  const url = `${BACKEND_URL}/api/tools/download${new URL(request.url).search}`;
  try {
    const response = await fetch(url, {
      method: request.method,
      headers: { "Content-Type": "application/json" },
      body: request.method === "GET" ? undefined : await request.text(),
      cache: "no-store",
    });
    const headers = new Headers({ "Content-Type": response.headers.get("Content-Type") ?? "application/json" });
    for (const header of ["Content-Disposition", "Content-Length"]) {
      if (response.headers.get(header)) headers.set(header, response.headers.get(header)!);
    }
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return Response.json({ detail: "Can't reach YT-Clipper right now. Try again in a minute." }, { status: 502 });
  }
}

export { forward as GET, forward as POST };
