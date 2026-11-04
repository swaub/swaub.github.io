"use strict";

const REFRESH_MS = 30000;
const VIEWS = ["overview", "next", "model", "tests", "issues", "changelog"];
const $ = (id) => document.getElementById(id);
let lastGood = 0;

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function when(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return esc(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function ago(iso) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

const TONE = { good: "good", warn: "warn", bad: "bad", dim: "dim" };
const PILL = { done: "Done", running: "Running", next: "Up next", waiting: "Waiting", failed: "Failed" };
const DOT = { fixed: "var(--good)", minor: "var(--warn)", major: "var(--bad)" };

function tile(t) {
  return `<div class="tile"><small>${esc(t.label)}</small><b class="${TONE[t.tone] || ""}">${esc(t.value)}</b><span>${esc(t.detail)}</span></div>`;
}

function show(view) {
  const v = VIEWS.includes(view) ? view : "overview";
  for (const id of VIEWS) $(`view-${id}`).classList.toggle("on", id === v);
  for (const a of document.querySelectorAll("#nav a")) {
    if (a.dataset.view === v) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
}

function render(s) {
  const cur = s.current || {};
  const nx = s.next || {};
  const m = s.model || {};
  const items = nx.items || [];
  const done = items.filter((i) => i.state === "done").length;

  $("tiles").innerHTML = [
    { label: "Current version", value: cur.version, detail: cur.released ? `Released ${when(cur.released)}` : "" },
    { label: "Next update", value: nx.version, detail: nx.eta || "" },
    { label: "AI model", value: m.state_label, detail: m.state_detail, tone: m.tone },
    { label: "Windows tests", value: s.tests && s.tests.windows ? s.tests.windows.value : "", detail: s.tests && s.tests.windows ? s.tests.windows.detail : "", tone: s.tests && s.tests.windows ? s.tests.windows.tone : "" },
  ].map(tile).join("");

  const acts = s.activity || [];
  $("activity").innerHTML = acts.length
    ? acts.slice(0, 12).map((a) => `<div class="act"><time>${when(a.at)}</time><div>${esc(a.text)}</div></div>`).join("")
    : `<p class="empty">Nothing yet.</p>`;

  $("next-title").textContent = nx.version ? `Next update: ${nx.version}` : "Next update";
  $("next-eta").textContent = nx.eta ? `ETA ${nx.eta}` : "";
  $("next-count").textContent = items.length ? `${done} of ${items.length} done` : "";
  $("nav-next").textContent = items.length ? `${done}/${items.length}` : "";
  $("next-bar").style.width = items.length ? `${Math.round((done / items.length) * 100)}%` : "0";
  $("next-items").innerHTML = items.length
    ? items.map((i) => `<div class="item"><span class="pill p-${esc(i.state)}">${esc(PILL[i.state] || i.state)}</span><div><b>${esc(i.title)}</b><p>${esc(i.detail)}</p></div></div>`).join("")
    : `<p class="empty">Nothing planned yet.</p>`;
  $("next-gate").textContent = nx.gate || "";

  $("model-tiles").innerHTML = (m.tiles || []).map(tile).join("");
  $("model-phase").textContent = m.phase || "";
  const classes = m.classes || [];
  $("model-chart").innerHTML = classes.length
    ? classes.map((c) => `<div class="cls"><span>${esc(c.name)}</span><div class="pair"><i class="old" style="width:${Math.round(c.before * 100)}%"></i><i class="new" style="width:${Math.round(c.after * 100)}%"></i></div><b>${Math.round(c.before * 100)}% → ${Math.round(c.after * 100)}%</b></div>`).join("")
    : `<p class="empty">No results yet.</p>`;
  $("model-last").textContent = classes.length ? "Old model vs new model" : "";
  $("model-gate").textContent = m.gate || "";

  const t = s.tests || {};
  $("tests-sub").textContent = t.version ? `For version ${t.version}.` : "";
  $("tests").innerHTML = (t.cards || []).map(tile).join("");
  const lab = t.lab || [];
  $("lab").innerHTML = lab.length
    ? `<div class="lab h"><span>Scenario</span><span>Without Scorio</span><span>With Scorio</span><span>Result</span></div>` +
      lab.map((r) => `<div class="lab"><span>${esc(r.scenario)}</span><span>${esc(r.before)}</span><span>${esc(r.after)}</span><span class="${TONE[r.tone] || ""}">${esc(r.result)}</span></div>`).join("")
    : `<p class="empty">${esc(t.lab_note || "Lab results appear here once the lab runs.")}</p>`;

  const issues = s.issues || [];
  $("nav-issues").textContent = issues.filter((i) => i.severity !== "fixed").length || "";
  $("issues").innerHTML = issues.length
    ? issues.map((i) => `<div class="issue"><span class="dot" style="background:${DOT[i.severity] || "var(--muted)"}"></span><div><b>${esc(i.title)}</b><p>${esc(i.detail)}</p></div><span class="sub">${esc(i.fix || "")}</span></div>`).join("")
    : `<p class="empty">No known issues.</p>`;

  const log = s.changelog || [];
  $("changelog").innerHTML = log.map((v) => `<div class="ver"><b>${esc(v.version)}</b><time>${when(v.date)}</time><p>${esc(v.text)}</p></div>`).join("");
}

function liveText() {
  const el = $("live");
  if (!lastGood) return;
  const fresh = Date.now() - lastGood < REFRESH_MS * 3;
  el.className = `live ${fresh ? "on" : "off"}`;
  el.querySelector("span").textContent = fresh ? `Live · ${ago(window.__updated)}` : "Reconnecting";
}

async function load() {
  try {
    const r = await fetch(`status.json?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    const s = await r.json();
    window.__updated = s.updated;
    lastGood = Date.now();
    render(s);
  } catch {
    const el = $("live");
    el.className = "live off";
    el.querySelector("span").textContent = "Reconnecting";
  }
  liveText();
}

window.addEventListener("hashchange", () => show(location.hash.slice(1)));
show(location.hash.slice(1));
load();
setInterval(load, REFRESH_MS);
setInterval(liveText, 5000);
