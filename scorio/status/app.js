"use strict";

const REFRESH_MS = 30000;
const ISSUES_URL = "https://jetson-thor.tail0a6858.ts.net:8443/api/issues";
const ISSUES_REFRESH_MS = 60000;
const FEED = "https://raw.githubusercontent.com/swaub/scorio-status-feed/main/status.json";
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

function day(ymd) {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return esc(ymd);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
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
const REPORT_STATUS = {
  new: ["New", "p-next"],
  investigating: ["Looking into it", "p-waiting"],
  confirmed: ["Confirmed", "p-running"],
  fixed: ["Fixed", "p-done"],
  not_a_bug: ["Not a bug", "p-next"],
};
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


function pct(a, b) {
  return b ? Math.max(0, Math.min(100, Math.round((a / b) * 100))) : 0;
}

function gb(bytes) {
  return `${(bytes / 1e9).toFixed(1)} GB`;
}

function renderLive(s) {
  const L = s.live || {};
  const ws = L.workstreams || [];
  $("work-sub").textContent = ws.length ? `${ws.filter((w) => w.active).length} active` : "";
  $("work").innerHTML = ws.length
    ? ws.map((w) => `<div class="item"><span class="pill ${w.active ? "p-running" : "p-next"}">${w.active ? "Working" : "Waiting"}</span><div><b>${esc(w.title)}</b><p>${esc(w.area)}${w.last_activity ? ` · last change ${ago(w.last_activity)}` : ""}</p></div></div>`).join("")
    : `<p class="empty">Nothing running right now.</p>`;

  const t = L.training;
  const d = L.datasets;
  let th = "";
  if (t) {
    const state = t.active ? "Training now" : t.result === "accepted" ? "Finished, passed the quality gate" : t.result === "refused" ? "Finished, did not pass the quality gate" : "Idle";
    $("train-sub").textContent = t.updated ? `${state} · ${ago(t.updated)}` : state;
    th += t.train_rows ? `<p class="body">Training on <b>${t.train_rows.toLocaleString()}</b> examples, checked against <b>${(t.holdout_rows || 0).toLocaleString()}</b> real test cases it never sees in training.</p>` : "";
    for (const st of t.stages || []) {
      const label = st.name === "teacher" ? "Teacher model (stays on the training machine)" : "Shipped model (learns from the teacher)";
      const p = pct(st.done, st.total);
      const losses = (st.losses || []).map((x) => x.toFixed(3)).join(" → ");
      th += `<div class="stage"><div class="stage-head"><b>${esc(label)}</b><span>${st.parameters ? `${st.parameters.toLocaleString()} parameters · ` : ""}round ${st.done} of ${st.total || "?"}</span></div><div class="bar"><div style="width:${p}%"></div></div><p class="sub">Error per round (lower is better): ${esc(losses || "starting")}</p></div>`;
    }
  } else {
    $("train-sub").textContent = "";
  }
  if (d) {
    const names = { "cesnet-quic22": "CESNET-QUIC22 (real web and video traffic)", vlc: "VLC Data (real calls, streaming, gaming)" };
    th += `<div class="stage"><div class="stage-head"><b>Public training data</b><span>${d.active ? "processing now" : "ready"}</span></div><p class="sub">${esc((d.sources || []).map((x) => names[x] || x).join(", "))} · ${gb(d.bytes || 0)} downloaded · ${d.converted_files || 0} files converted</p></div>`;
  }
  $("train").innerHTML = th || `<p class="empty">No training has run yet.</p>`;

  const v = L.vmsuite;
  const so = L.soak;
  let vh = "";
  const PH = { prep: "Preparing a clean Windows", unit: "Engine unit tests", "modules-system": "Checking every feature", "modules-console": "Checking signed-in user features", teardown: "Revert and uninstall cleanup" };
  if (v) {
    const p = pct(v.phases_done, v.phases_total);
    $("vm-sub").textContent = v.active ? `running · started ${ago(v.started)}` : `last run ${ago(v.updated)}`;
    vh += `<div class="stage"><div class="stage-head"><b>Full Windows test suite</b><span>${p}%</span></div><div class="bar"><div style="width:${p}%"></div></div><p class="sub">${v.active ? `Now: ${esc(PH[v.current] || v.current || "running")} · ` : ""}step ${Math.min(v.phases_done + (v.active ? 1 : 0), v.phases_total)} of ${v.phases_total} · <span class="good">${v.passed} passed</span> · <span class="${v.failed ? "bad" : "dim"}">${v.failed} failed</span></p></div>`;
  }
  if (so) {
    const hrs = so.started ? ((new Date(so.updated) - new Date(so.started)) / 3600000).toFixed(1) : "?";
    vh += `<div class="stage"><div class="stage-head"><b>Soak test (long run with restarts)</b><span>${so.active ? "running" : "finished"}</span></div><p class="sub">${hrs} hours · ${so.reboots} restarts · <span class="${so.failures ? "bad" : "good"}">${so.failures} failures</span></p></div>`;
  }
  $("vm").innerHTML = vh || `<p class="empty">No test runs yet.</p>`;
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
    const r = await fetch(`${FEED}?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    const s = await r.json();
    window.__updated = s.updated;
    lastGood = Date.now();
    render(s);
    renderLive(s);
  } catch {
    const el = $("live");
    el.className = "live off";
    el.querySelector("span").textContent = "Reconnecting";
  }
  liveText();
}

function reportedRow(i) {
  const [label, cls] = REPORT_STATUS[i.status] || REPORT_STATUS.new;
  const fixed = i.fixed_in ? (i.status === "fixed" ? ` · fixed in ${esc(i.fixed_in)}` : ` · fix planned for ${esc(i.fixed_in)}`) : "";
  return `<div class="rep"><code>${esc(i.code)}</code><div><p>${esc(i.summary)}</p><small>Reported on version ${esc(i.version)} · received ${day(i.received)}${fixed}</small></div><span class="pill ${cls}">${label}</span></div>`;
}

function renderReported(list) {
  const card = $("reported-card");
  if (!Array.isArray(list)) {
    card.hidden = true;
    return;
  }
  if (!list.length) {
    $("reported-sub").textContent = "none yet";
    $("reported").innerHTML = "";
    card.hidden = false;
    return;
  }
  const open = list.filter((i) => i.status !== "fixed" && i.status !== "not_a_bug").length;
  $("reported-sub").textContent = `${list.length} reported · ${open} open`;
  $("reported").innerHTML = list.map(reportedRow).join("");
  card.hidden = false;
}

async function loadReported() {
  try {
    const r = await fetch(ISSUES_URL, { cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    const body = await r.json();
    renderReported(body.issues);
  } catch {
  }
}

window.addEventListener("hashchange", () => show(location.hash.slice(1)));
show(location.hash.slice(1));
load();
loadReported();
setInterval(load, REFRESH_MS);
setInterval(loadReported, ISSUES_REFRESH_MS);
setInterval(liveText, 5000);
