// Forwards /api/* to the FastAPI backend with the secret key, so the browser never sees BACKEND_API_KEY.
// ponytail: no sign-in yet, so anyone who can reach this site can use the backend through it. `npm run dev`/`start`
// bind to 127.0.0.1; do not deploy publicly until accounts exist (Phase 9), then check the user here.
async function forward(request: Request, { params }: RouteContext<"/api/[...path]">) {
  // CSRF: browsers label where a request came from; only this site's own pages (or a typed-in URL) may call through
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return Response.json({ detail: "Cross-site requests are not allowed." }, { status: 403 });
  }
  const { BACKEND_URL, BACKEND_API_KEY } = process.env;
  if (!BACKEND_URL || !BACKEND_API_KEY) {
    return Response.json({ detail: "Set BACKEND_URL and BACKEND_API_KEY in apps/website/.env.local." }, { status: 500 });
  }
  const { path } = await params;
  const url = `${BACKEND_URL}/api/${path.map(encodeURIComponent).join("/")}${new URL(request.url).search}`;
  try {
    const response = await fetch(url, {
      method: request.method,
      headers: { Authorization: `Bearer ${BACKEND_API_KEY}`, "Content-Type": "application/json" },
      body: request.method === "GET" ? undefined : await request.text(),
      cache: "no-store",
    });
    const headers = new Headers({ "Content-Type": response.headers.get("Content-Type") ?? "application/json" });
    const disposition = response.headers.get("Content-Disposition"); // downloads keep their file name
    if (disposition) headers.set("Content-Disposition", disposition);
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return Response.json({ detail: "Can't reach the ClipperAi backend. Is it running?" }, { status: 502 });
  }
}

export { forward as GET, forward as POST, forward as PATCH, forward as DELETE };
