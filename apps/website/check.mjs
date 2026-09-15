// Proxy checks against a running site + backend (no paid calls): `node check.mjs [http://127.0.0.1:3000]`
import assert from "node:assert/strict";

const site = process.argv[2] ?? "http://127.0.0.1:3000";
const call = (path, init = {}) =>
  fetch(`${site}${path}`, { ...init, headers: { "Sec-Fetch-Site": "same-origin", ...init.headers } });
const missing = "00000000-0000-4000-8000-000000000000";

let response = await call("/api/projects?limit=1");
assert.equal(response.status, 200, "the proxy must add the backend key");
assert.ok(Array.isArray(await response.json()));

response = await call("/api/projects", { method: "POST", body: "{}", headers: { "Sec-Fetch-Site": "cross-site" } });
assert.equal(response.status, 403, "other sites must not be able to act through the proxy");

response = await call(`/api/projects/${missing}`);
assert.equal(response.status, 404);
assert.equal((await response.json()).detail, "project not found", "backend errors pass through");

assert.equal((await call(`/api/projects/${missing}`, { method: "DELETE" })).status, 404);
response = await call(`/api/projects/${missing}/clips/1`, { method: "PATCH", body: '{"review": "approved"}' });
assert.equal(response.status, 404);

response = await call("/api/projects", { method: "POST", body: '{"source": "http://localhost/video.mp4"}' });
assert.equal(response.status, 422, "bodies reach the backend as JSON and get validated there");

assert.equal((await call(`/api/projects/${missing}/package`)).status, 404);

response = await call("/api/billing");
assert.equal(response.status, 200);
assert.deepEqual((await response.json()).plans.map((p) => p.price_cents), [1500, 3900, 9900], "plans reach the site");
response = await call("/api/billing/subscribe", { method: "POST", body: '{"plan": "free"}' });
assert.equal(response.status, 422, "unknown plans are refused");

response = await call("/api/publishing/channels"); // 200 with a working Buffer key, else a readable reason
const channels = await response.json();
assert.ok(response.status === 200 ? Array.isArray(channels) : typeof channels.detail === "string", JSON.stringify(channels));
assert.equal((await call(`/api/projects/${missing}/publications`)).status, 404);
assert.equal((await call(`/api/publications/${missing}`, { method: "DELETE" })).status, 404);
response = await call(`/api/projects/${missing}/clips/1/publish`, { method: "POST", body: '{"channels": []}' });
assert.equal(response.status, 422, "at least one channel");
response = await call(`/api/projects/${missing}/clips/1/publish`, { method: "POST", body: '{"channels": ["a"]}' });
assert.equal(response.status, 404, "a missing clip is refused before Buffer is asked anything");

const calendar = { channels: ["a"], days: [1, 3, 5], times: ["09:00"], start: "2026-09-21", timezone: "Europe/London" };
response = await call(`/api/projects/${missing}/calendar/plan`, { method: "POST", body: JSON.stringify(calendar) });
assert.equal(response.status, 404, "a missing project's calendar is refused before Buffer is asked anything");
response = await call(`/api/projects/${missing}/calendar`, { method: "POST", body: JSON.stringify({ ...calendar, timezone: "Mars/Olympus" }) });
assert.equal(response.status, 422, "unknown time zones are refused");

for (const page of ["/", "/dashboard", "/projects/new", `/projects/${missing}`, `/projects/${missing}/calendar`, "/pricing",
                    "/checkout?plan=pro", "/settings/billing", "/settings/integrations"]) {
  assert.equal((await fetch(`${site}${page}`)).status, 200, page);
}
console.log("ok");
