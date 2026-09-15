// Signed-out checks against a running site + backend (no paid calls): `node check.mjs [http://localhost:3000]`.
// Signed-in API behaviour (404s, validation, plans, publishing) is covered by walkthrough.mjs, which signs in.
import assert from "node:assert/strict";

const site = process.argv[2] ?? "http://localhost:3000";
const call = (path, init = {}) =>
  fetch(`${site}${path}`, { redirect: "manual", ...init, headers: { "Sec-Fetch-Site": "same-origin", ...init.headers } });
const missing = "00000000-0000-4000-8000-000000000000";

let response = await call("/api/projects?limit=1");
assert.equal(response.status, 401, "the proxy must not reach the backend without a signed-in user");
assert.equal((await response.json()).detail, "Sign in to continue.");
for (const [method, path] of [["POST", "/api/projects"], ["DELETE", `/api/projects/${missing}`], ["GET", "/api/billing"],
                              ["POST", `/api/projects/${missing}/calendar`], ["GET", "/api/publishing/channels"]]) {
  assert.equal((await call(path, { method, body: method === "GET" ? undefined : "{}" })).status, 401, `${method} ${path}`);
}

response = await call("/api/projects", { method: "POST", body: "{}", headers: { "Sec-Fetch-Site": "cross-site" } });
assert.equal(response.status, 403, "other sites must not be able to act through the proxy");

// plain requests: with browser headers a Clerk development instance first bounces every page through its handshake
const page = (path) => call(path);
for (const path of ["/", "/pricing", "/sign-in", "/sign-up"]) {
  assert.equal((await page(path)).status, 200, path);
}
for (const path of ["/dashboard", "/projects/new", `/projects/${missing}`, `/projects/${missing}/calendar`,
                    "/checkout?plan=pro", "/settings/billing", "/settings/integrations"]) {
  response = await page(path);
  assert.ok([302, 307].includes(response.status) && response.headers.get("location")?.includes("/sign-in"),
            `${path} must send signed-out visitors to sign in (got ${response.status} ${response.headers.get("location")})`);
}
console.log("ok");
