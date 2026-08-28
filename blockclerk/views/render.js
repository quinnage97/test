// Server-rendered HTML. No build step, no framework, no client-side app: this
// has to still run in five years on whatever machine a volunteer director has.

import * as law from "../lib/law.js";
import { longDate } from "../db.js";

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const NAV = [
  ["/", "Buildings"],
  ["/documents", "Issued"],
  ["/law", "What the law says"],
  ["/settings", "Settings"],
];

export function layout({ title, tab = "", body, wide = false }) {
  const nav = NAV.map(([href, label]) =>
    `<a href="${href}" class="${tab === href ? "on" : ""}">${label}</a>`).join("");

  return `<!doctype html><html lang="en-GB"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — Blockclerk</title><link rel="stylesheet" href="/app.css">
</head><body>
<header class="bar"><div class="wrap"><h1><a href="/">Blockclerk</a></h1><nav>${nav}</nav></div></header>
<main class="wrap"${wide ? ' style="max-width:1100px"' : ""}>${body}</main>
<div class="toast" id="toast"></div>
<script>
function toast(m){const t=document.getElementById('toast');t.textContent=m;t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2200);}
async function copyDoc(btn){
  const text = btn.closest('.docwrap').querySelector('pre.doc').textContent;
  try { await navigator.clipboard.writeText(text); toast('Copied.'); }
  catch(e){ toast('Select the text and copy it.'); }
}
</script>
</body></html>`;
}

// --- Small pieces -----------------------------------------------------------

export const pill = (status, text) =>
  `<span class="pill ${esc(status)}">${esc(text || law.statusLabel({ status }))}</span>`;

export function warningList(warnings) {
  if (!warnings.length) {
    return `<div class="note good"><b>Nothing flagged.</b>
      The checks Blockclerk makes came back clean. They are not a verdict on
      whether this charge is payable under the lease.</div>`;
  }
  return warnings.map((w) => `
    <div class="note ${esc(w.level)}">
      <b>${w.level === "stop" ? "Deal with this first" : "Worth a look"}</b>
      ${esc(w.text)}
      ${w.fix ? `<div class="fix">${esc(w.fix)}</div>` : ""}
    </div>`).join("");
}

// The one thing every generated document carries. Deliberately not styled to
// look like fine print.
export const notAdviceNote = () =>
  `<div class="note"><b>This is a document, not advice</b>${esc(law.NOT_ADVICE)}</div>`;

export function field(name, label, value = "", { type = "text", hint = "", rows = 0, options = null } = {}) {
  const l = `<label for="${esc(name)}">${esc(label)}${hint ? `<span class="hint">${esc(hint)}</span>` : ""}</label>`;
  if (options) {
    return l + `<select id="${esc(name)}" name="${esc(name)}">` +
      options.map(([v, t]) =>
        `<option value="${esc(v)}"${String(value) === String(v) ? " selected" : ""}>${esc(t)}</option>`).join("") +
      `</select>`;
  }
  if (rows) return l + `<textarea id="${esc(name)}" name="${esc(name)}" rows="${rows}">${esc(value)}</textarea>`;
  return l + `<input type="${type}" id="${esc(name)}" name="${esc(name)}" value="${esc(value)}">`;
}

export const docBlock = (doc, extra = "") => `
  <div class="docwrap">
    <div class="actions no-print">
      <button onclick="copyDoc(this)">Copy the text</button>
      <button onclick="window.print()">Print or save as PDF</button>
      ${extra}
    </div>
    ${doc.missing && doc.missing.length ? `
      <div class="note stop"><b>This document is not finished</b>
        It still needs: ${esc(doc.missing.join(", "))}.
        Blockclerk will not treat it as issued until those are filled in.</div>` : ""}
    <pre class="doc">${esc(doc.text)}</pre>
  </div>`;

// --- The law page -----------------------------------------------------------

export function lawPage() {
  const groups = [
    ["service-charge", "Service charges"],
    ["heat-network", "Heat networks"],
  ];

  const rows = groups.map(([topic, heading]) => `
    <h3>${esc(heading)}</h3>
    ${law.byTopic(topic).map((p) => `
      <div class="card">
        <div style="display:flex;gap:12px;align-items:baseline;justify-content:space-between;flex-wrap:wrap">
          <h4 style="flex:1 1 320px">${esc(p.statement)}</h4>
          ${pill(p.status)}
        </div>
        <p class="meta">${esc(p.source)}</p>
        ${p.note ? `<p>${esc(p.note)}</p>` : ""}
        <p class="meta">
          Checked ${esc(longDate(p.checked_on))}${law.isStale(p) ? " — <strong>overdue a re-check</strong>" : ""}
          ${p.confidence === "check" ? " · not yet confirmed against the source" : ""}
          ${p.url ? ` · <a href="${esc(p.url)}" rel="noreferrer noopener" target="_blank">source</a>` : ""}
        </p>
      </div>`).join("")}`).join("");

  const expected = law.registry.provisions.filter((x) => x.status === "expected").length;
  const stale = law.staleProvisions().length;

  return layout({
    title: "What the law says", tab: "/law", body: `
    <h2 class="day">What the law says</h2>
    <p class="sub">Everything Blockclerk asserts about the law is on this page. Nothing else in
      the app is allowed to state a rule that is not here.</p>

    <div class="note ${stale ? "look" : ""}">
      <b>${expected} of these ${law.registry.provisions.length} are not settled</b>
      The statutory instruments behind the service charge reforms, and the detail of the heat
      network rules, were not final when this was last reviewed. Anything marked
      ${pill("expected", "Expected")} may change — its wording, its format and its dates.
      ${stale ? `<div class="fix">${stale} ${stale === 1 ? "has" : "have"} not been re-checked
        for over ${law.reviewEveryDays} days. Re-check them before issuing anything.</div>` : ""}
    </div>

    <div class="note"><b>How to keep this current</b>
      This page is generated from <code>law/provisions.json</code>. Edit that file — it is
      plain text, one entry per rule — and update <code>checked_on</code> when you have looked.
      Then run <code>npm run check</code>.</div>

    ${rows}` });
}
