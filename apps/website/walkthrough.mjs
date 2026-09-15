// Clicks through the website in headless Edge like a person would (DevTools protocol, no extra packages): no plan ->
// refused, pricing -> checkout -> plan, switch plan, batch links, batch uploads, review, copy, Download all, publish
// and schedule, cancel.
// Needs `python dev.py --fake-buffer` + `npm run start` running and fixture data (changes the dev database):
//   cd apps/backend && python dev_fixture.py      -> prints <project id> <media folder>
//   cd apps/website && node walkthrough.mjs <project id> <media folder>
// Screenshots go to <temp>/clipperai-walkthrough. Windows + Edge (the path below); Chrome takes the same flags.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SITE = "http://127.0.0.1:3000";
const [PROJECT, MEDIA] = process.argv.slice(2);
assert.ok(PROJECT && MEDIA, "usage: node walkthrough.mjs <project id> <media folder> (from python dev_fixture.py)");
const DIR = join(tmpdir(), "clipperai-walkthrough") + "/";
mkdirSync(DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (path) =>
  (await fetch(SITE + "/api/" + path, { headers: { "Sec-Fetch-Site": "same-origin" } })).json();

rmSync(`${DIR}edge-cdp`, { recursive: true, force: true });
const edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", [
  "--headless=new", "--disable-gpu", "--no-first-run", `--user-data-dir=${DIR}edge-cdp`,
  "--remote-debugging-port=9333", "about:blank"], { stdio: "ignore" });

let targets = [];
for (let i = 0; i < 100 && !targets.some((t) => t.type === "page"); i++) {
  try { targets = await (await fetch("http://127.0.0.1:9333/json/list")).json(); } catch { await sleep(200); }
}
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let nextId = 0;
const pending = new Map();
ws.onmessage = ({ data }) => {
  const msg = JSON.parse(data);
  if (!msg.id) return;
  const { resolve, reject } = pending.get(msg.id);
  pending.delete(msg.id);
  msg.error ? reject(new Error(`${msg.error.message}`)) : resolve(msg.result);
};
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    pending.set(++nextId, { resolve, reject });
    ws.send(JSON.stringify({ id: nextId, method, params }));
  });

async function js(expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}
async function until(expression, what, ms = 15000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(200)) {
    try { if (await js(expression)) return; } catch {}
  }
  throw new Error(`timed out waiting for ${what}; page says: ${(await js("document.body.innerText")).slice(0, 400)}`);
}
const has = (s, ms) => until(`document.body.innerText.includes(${JSON.stringify(s)})`, `"${s}"`, ms);
const at = (path, ms) => until(`location.pathname === ${JSON.stringify(path)}`, `page ${path}`, ms);
async function go(path) {
  await send("Page.navigate", { url: SITE + path });
  await until(`document.readyState === "complete" && location.href === ${JSON.stringify(SITE + path)}`, `load ${path}`);
}
const click = (label, nth = 0) => js(`(() => {
  const el = [...document.querySelectorAll("a, button")].filter((e) => e.textContent.trim() === ${JSON.stringify(label)})[${nth}];
  if (!el) throw new Error("nothing labelled " + ${JSON.stringify(label)});
  el.click();
  return true;
})()`);
const type = (selector, value) => js(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
})()`);
async function shot(name, width = 1440, dark = false) {
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }] });
  await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
  await sleep(400);
  const height = Math.min(4000, Math.ceil((await send("Page.getLayoutMetrics")).cssContentSize.height));
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  await sleep(300);
  writeFileSync(`${DIR}${name}.png`, Buffer.from((await send("Page.captureScreenshot")).data, "base64"));
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
}
const ok = (what) => console.log("ok  " + what);

try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("DOM.enable");

  // 1. no plan yet
  await go("/settings/billing");
  await has("You don't have a plan yet.");
  await go("/");
  await until(`!!document.querySelector("#source")`, "the form");
  await type("#source", "https://example.com/video-one");
  await click("Make clips");
  await has("Choose a plan to start making clips.");
  await until(`[...document.querySelectorAll("a")].some((a) => a.textContent === "See plans" && a.getAttribute("href") === "/pricing")`, "See plans link");
  ok("without a plan: billing says so, a new project is refused with a link to plans");

  // 2. pricing -> checkout -> active plan
  await go("/pricing");
  await has("Choose Creator");
  assert.ok((await js("document.body.innerText")).includes("$15"), "Creator shows $15");
  await shot("cdp-pricing");
  await click("Choose Creator");
  await at("/checkout");
  await has("Due today");
  const checkout = await js("document.body.innerText");
  assert.ok(checkout.includes("$15.00") && checkout.includes("-$15.00") && checkout.includes("$0.00"), checkout);
  await shot("cdp-checkout");
  await click("Start Creator plan");
  await at("/settings/billing");
  await has("not charged during early access");
  assert.equal((await api("billing")).subscription.plan, "creator");
  ok("pricing -> checkout ($15.00, $0.00 due) -> Creator active");

  // 3. switch plans
  await go("/pricing");
  await has("Your current plan");
  await click("Choose Business");
  await has("This replaces your Creator plan straight away.");
  await click("Start Business plan");
  await at("/settings/billing");
  await until(`document.querySelectorAll("tbody tr").length === 2`, "two history rows");
  const billing = await js("document.body.innerText");
  assert.ok(billing.includes("Business") && billing.includes("Ended") && billing.includes("$0.00"), billing);
  await shot("cdp-billing");
  ok("switched to Business; history shows both plans, $0.00 charged");

  // 4. batch links
  await go("/");
  await until(`!!document.querySelector("#source")`, "the form");
  await type("#source", "https://example.com/video-one\nnot-a-link");
  await click("Make clips");
  await has(`"not-a-link" isn't a link.`);
  const before = (await api("projects?limit=200")).length;
  await type("#source", "https://example.com/video-one\nhttps://example.com/video-two");
  await click("Make clips");
  await at("/dashboard");
  assert.equal((await api("projects?limit=200")).length, before + 2);
  ok("bad line caught; two links -> two projects -> Projects page");

  // 5. batch uploads through the real file picker
  await go("/");
  const { root } = await send("DOM.getDocument", { depth: -1 });
  const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector: "input[type=file]" });
  await send("DOM.setFileInputFiles", { nodeId, files: [join(MEDIA, "clip01.mp4"), join(MEDIA, "clip02.mp4")] });
  await has("clip02.mp4");
  await shot("cdp-files", 390);
  await click("Make clips");
  await at("/dashboard", 60000);
  const projects = await api("projects?limit=200");
  assert.equal(projects.length, before + 4);
  assert.equal(projects.filter((p) => p.source.startsWith("upload:")).length >= 2, true);
  ok("two files uploaded from the picker -> two projects");

  // 6. review: approve, edit, copy, reject, download all
  await go(`/projects/${PROJECT}`);
  await has("Download all");
  await click("Approve");
  await has("1 approved.");
  await click("Edit");
  await until(`!!document.querySelector("input[name=title]")`, "the edit form");
  await type("input[name=title]", "Edited in the browser");
  await click("Save changes");
  await has("Edited in the browser");
  const saved = await api(`projects/${PROJECT}`);
  assert.equal(saved.clips[0].title, "Edited in the browser");
  ok("approve + edit form saved (backend has the new title)");

  // clipboard permission is a browser-level command; headless pages also need focus emulation to write to it
  const browser = new WebSocket((await (await fetch("http://127.0.0.1:9333/json/version")).json()).webSocketDebuggerUrl);
  await new Promise((r) => (browser.onopen = r));
  const granted = new Promise((r) => (browser.onmessage = ({ data }) => r(JSON.parse(data))));
  browser.send(JSON.stringify({ id: 1, method: "Browser.grantPermissions",
    params: { origin: SITE, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] } }));
  console.log("clipboard permission:", JSON.stringify(await granted));
  browser.close();
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await click("Copy TikTok post");
  await until(`/Copied|blocked copying/.test(document.body.innerText)`, "copy feedback");
  if ((await js("document.body.innerText")).includes("Copied")) {
    assert.equal(await js("navigator.clipboard.readText()"), saved.clips[0].posts.tiktok);
    ok("copy button put the TikTok post on the clipboard");
  } else {
    ok("copy blocked by the browser: the page says so (clipboard itself not verified)");
  }

  await click("Reject", 1);
  await has("Download all skips rejected clips.");
  await until(`[...document.querySelectorAll("button")].filter((b) => b.textContent === "Rejected").length === 1`, "clip 2 rejected");
  await shot("cdp-review");
  await shot("cdp-review-phone", 390, true);

  const zip = await js(`fetch(document.querySelector("a[download]").href).then(async (r) => {
    const bytes = new Uint8Array(await r.arrayBuffer());
    return { status: r.status, type: r.headers.get("content-type"), name: r.headers.get("content-disposition"),
             size: bytes.length, magic: String.fromCharCode(bytes[0], bytes[1]) };
  })`);
  assert.deepEqual([zip.status, zip.type, zip.magic], [200, "application/zip", "PK"], JSON.stringify(zip));
  assert.equal(zip.name, 'attachment; filename="content-package.zip"');
  const downloads = join(DIR, "downloads");
  const savedZip = join(downloads, "content-package.zip");
  rmSync(downloads, { recursive: true, force: true });
  mkdirSync(downloads);
  await send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });
  await click("Download all");
  for (let i = 0; i < 50 && !existsSync(savedZip); i++) await sleep(200);
  assert.ok(existsSync(savedZip), `downloads: ${readdirSync(downloads)}`);
  ok(`Download all: ${zip.size} byte ZIP fetched; clicking it saved ${savedZip} (${statSync(savedZip).size} bytes)`);

  // 7. publishing through the fake Buffer: settings page, post now, schedule, unschedule
  await go("/settings/integrations");
  await has("Reconnect it in Buffer");
  const settings = await js("document.body.innerText");
  assert.ok(settings.includes("4 of 7 channels can post clips.") && settings.includes("Clips can't be posted here yet")
            && settings.includes("Needs an Instagram creator or business account"), settings);
  await shot("cdp-integrations");
  await shot("cdp-integrations-phone", 390, true);
  ok("Publishing page: connected, 4 of 7 channels ready, the disconnected, unsupported and personal ones say why");

  await go(`/projects/${PROJECT}`);
  await has("Download all");
  const publishButtons = await js(`[...document.querySelectorAll("button")].filter((b) => b.textContent === "Publish").length`);
  assert.equal(publishButtons, 1, "only the approved clip can be published");
  await click("Publish");
  await has("Clips can't be posted here yet");
  const tick = (value) => js(`document.querySelector("input[value=${value}]").click() || true`);
  await tick("channel-tiktok");
  await tick("channel-youtube");
  await shot("cdp-publish-form");
  await click("Post now");
  const postList = (text) => until(`document.querySelector("section[aria-label=Posts]")?.innerText.includes(${JSON.stringify(text)})`, `"${text}" in the post list`);
  await postList("Posting...");
  let posts = (await api(`projects/${PROJECT}/publications`)).publications;
  assert.deepEqual(posts.map((p) => `${p.service} ${p.status}`).sort(), ["tiktok sending", "youtube sending"]);
  ok("Post now to TikTok and YouTube: both show Posting... and exist in Buffer");

  await click("Publish");
  await has("Already posted");
  await tick("channel-twitter");
  await js(`document.querySelectorAll("input[name=when]")[1].click() || true`);
  await until(`!!document.querySelector("input[name=due_at]")`, "the date field");
  const due = await js(`(() => { const d = new Date(Date.now() + 2 * 86400000);
    return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); })()`);
  await type("input[name=due_at]", due);
  await shot("cdp-schedule-form", 390);
  await click("Schedule");
  await postList("Scheduled for");
  posts = (await api(`projects/${PROJECT}/publications`)).publications;
  const x = posts.find((p) => p.service === "twitter");
  assert.ok(x.status === "scheduled" && Math.abs(new Date(x.due_at) - (Date.now() + 2 * 86400000)) < 120000, JSON.stringify(x));
  await shot("cdp-posts");
  await shot("cdp-posts-phone", 390, true);
  await js("window.confirm = () => true");
  await click("Unschedule");
  await until(`!document.body.innerText.includes("Scheduled for")`, "the scheduled post to go");
  posts = (await api(`projects/${PROJECT}/publications`)).publications;
  assert.deepEqual(posts.map((p) => p.service).sort(), ["tiktok", "youtube"]);
  ok(`Schedule X for ${due}: shows Scheduled for, Unschedule removes it`);

  // 8. cancel the plan
  await go("/settings/billing");
  await has("Cancel plan");
  await js("window.confirm = () => true");
  await click("Cancel plan");
  await has("You don't have a plan yet.");
  assert.equal((await api("billing")).subscription, null);
  await shot("cdp-billing-cancelled", 390, true);
  ok("cancel plan -> no plan");
} finally {
  try { await send("Browser.close"); } catch {}
  edge.kill();
}
