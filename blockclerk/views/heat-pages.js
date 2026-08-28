import { layout, esc, pill, field, docBlock, notAdviceNote } from "./render.js";
import { longDate } from "../db.js";
import * as law from "../lib/law.js";

const crumb = (b) => `<p class="meta"><a href="/buildings/${b.id}">${esc(b.name)}</a></p>`;

const tabs = (b, on) => `
  <div class="actions">
    ${[["", "Scope test"], ["/registration", "Registration pack"], ["/conditions", "Ongoing conditions"]]
      .map(([href, label]) =>
        `<a class="btn ${on === href ? "go" : ""}" href="/buildings/${b.id}/heat${href}">${label}</a>`)
      .join("")}
  </div>`;

function countdown(deadline) {
  return `<div class="countdown">
    <div class="big">${deadline.days === null ? "—"
      : deadline.days > 0 ? `${deadline.days} days`
      : deadline.days === 0 ? "Today"
      : `${Math.abs(deadline.days)} days ago`}</div>
    <div>until the registration date currently recorded (${esc(longDate(deadline.date))}).</div>
    <div class="src">${esc(law.citationLine(deadline.provision))}</div>
  </div>`;
}

const RESULT_PILL = {
  likely_in_scope: ["expected", "Likely in scope"],
  likely_out: ["in_force", "Likely out of scope"],
  unclear: ["plain", "Cannot say yet"],
};

// --- The scope test ---------------------------------------------------------

export function scopePage({ building: b, questions, given, assessment, deadline, doc }) {
  const [cls, label] = RESULT_PILL[assessment.result];

  const rows = questions.map((q) => `
    <div class="qrow">
      <div class="q">${esc(q.text)}</div>
      ${q.help ? `<div class="help">${esc(q.help)}</div>` : ""}
      <div class="choices">
        ${[["yes", "Yes"], ["no", "No"], ["unknown", "I don't know yet"]].map(([v, t]) => `
          <label><input type="radio" name="${esc(q.id)}" value="${v}"
            ${given[q.id] === v ? "checked" : ""}><span>${t}</span></label>`).join("")}
      </div>
    </div>`).join("");

  const body = `
    ${crumb(b)}
    <h2 class="day">Heat network — is this block caught?</h2>
    <p class="sub">Six questions. They give you a likely answer and the reasoning, not a
      determination.</p>
    ${tabs(b, "")}
    ${countdown(deadline)}

    <div class="card">
      <div style="display:flex;gap:12px;justify-content:space-between;flex-wrap:wrap;align-items:baseline">
        <h4 style="flex:1 1 300px">Where this block stands</h4>
        ${pill(cls, label)}
      </div>
      ${assessment.reasons.map((r) => `<p>${esc(r)}</p>`).join("")}
      ${assessment.roleNotes.length ? `<p class="meta">${
        assessment.roleNotes.map(esc).join("<br>")}</p>` : ""}
    </div>

    <div class="note look"><b>Why this matters</b>
      ${esc(law.provision("heat.unauthorised-offence").statement)}
      <div class="fix">${esc(law.citationLine(law.provision("heat.unauthorised-offence")))}</div>
    </div>

    <form method="POST" action="/buildings/${b.id}/heat">
      <h3>The questions</h3>
      ${rows}
      <div class="actions">
        <button class="go" type="submit">Save these answers</button>
      </div>
    </form>

    <h3>The assessment, written out</h3>
    ${docBlock(doc)}
    ${notAdviceNote()}`;

  return layout({ title: "Heat network scope", tab: "/", body, wide: true });
}

// --- The registration pack --------------------------------------------------

export function registrationPage({ building: b, fields, values, doc, deadline, gaps }) {
  const groups = [];
  for (const f of fields) {
    const name = f.group || "Details";
    let g = groups.find((x) => x.name === name);
    if (!g) groups.push((g = { name, rows: [] }));
    g.rows.push(f);
  }

  const form = groups.map((g) => `
    <h3>${esc(g.name)}</h3>
    ${g.rows.map((f) => field(f.key, f.label + (f.required ? "" : " (if you have it)"),
        values[f.key] || "", { hint: f.help || "", rows: (values[f.key] || "").length > 60 ? 2 : 0 }))
      .join("")}`).join("");

  const body = `
    ${crumb(b)}
    <h2 class="day">Registration information pack</h2>
    <p class="sub">Everything the registration is expected to ask for, gathered in one place so
      you are not hunting for it on the day.</p>
    ${tabs(b, "/registration")}
    ${countdown(deadline)}

    ${gaps.length ? `<div class="note look"><b>${gaps.length} still to fill in</b>
      ${esc(gaps.map((g) => g.label).join(", "))}.
      <div class="fix">The pack will produce with those gaps marked, so you can see what is left.</div>
      </div>`
    : `<div class="note good"><b>Nothing missing</b>
      Every entry this pack asks for has been filled in. Check it against Ofgem's own list before
      you register — theirs is expected to differ from this one.</div>`}

    <form method="POST" action="/buildings/${b.id}/heat/registration">
      ${form}
      <div class="actions"><button class="go" type="submit">Save</button></div>
    </form>

    <h3>The pack</h3>
    ${docBlock(doc, `<form method="POST" action="/buildings/${b.id}/heat/registration/save"
       style="display:inline"><button type="submit">Save it to the record</button></form>`)}
    ${notAdviceNote()}`;

  return layout({ title: "Registration pack", tab: "/", body, wide: true });
}

// --- Ongoing conditions -----------------------------------------------------

const STATUS = [["not_started", "Not started"], ["in_progress", "In progress"],
                ["done", "Done"], ["n_a", "Does not apply"]];

export function conditionsPage({ building: b, rows, tally, doc, deadline }) {
  const cards = rows.map((c) => `
    <div class="card">
      <div style="display:flex;gap:12px;justify-content:space-between;flex-wrap:wrap;align-items:baseline">
        <h4 style="flex:1 1 300px">${esc(c.title)}</h4>
        ${pill(c.status === "done" ? "in_force" : c.status === "not_started" ? "expected" : "plain",
               (STATUS.find((s) => s[0] === c.status) || [, c.status])[1])}
      </div>
      <p>${esc(c.what)}</p>
      ${c.due ? `<p class="meta">Due ${esc(longDate(c.due))}${
        c.days !== null ? c.days >= 0 ? ` — ${c.days} days away` : ` — ${Math.abs(c.days)} days ago` : ""
      }</p>` : ""}
      <form method="POST" action="/buildings/${b.id}/heat/conditions">
        <input type="hidden" name="condition_id" value="${esc(c.id)}">
        <div class="row">
          <div>${field(`status_${c.id}`, "Where it stands", c.status, { options: STATUS })}</div>
          <div>${field(`due_${c.id}`, "Due by", c.due || "", { type: "date" })}</div>
        </div>
        ${field(`evidence_${c.id}`, "What you did, and where the record is", c.evidence, { rows: 2 })}
        <div class="actions"><button type="submit">Save</button></div>
      </form>
    </div>`).join("");

  const body = `
    ${crumb(b)}
    <h2 class="day">Ongoing conditions</h2>
    <p class="sub">Registering is the start. These are the obligations that are expected to run
      afterwards, for as long as the network operates.</p>
    ${tabs(b, "/conditions")}
    ${countdown(deadline)}

    <div class="note"><b>${tally.done} done · ${tally.in_progress} in progress ·
      ${tally.not_started} not started · ${tally.n_a} not applicable</b>
      ${esc(law.provision("heat.conditions").statement)}
      <div class="fix">${esc(law.citationLine(law.provision("heat.conditions")))}</div>
    </div>

    ${cards}

    <h3>The position, written out</h3>
    ${docBlock(doc, `<form method="POST" action="/buildings/${b.id}/heat/conditions/save"
       style="display:inline"><button type="submit">Save it to the record</button></form>`)}
    ${notAdviceNote()}`;

  return layout({ title: "Ongoing conditions", tab: "/", body, wide: true });
}

// --- Settings ---------------------------------------------------------------

export function settingsPage({ values, templates }) {
  const rows = templates.map((t) => `
    <tr>
      <td><strong>${esc(t.title)}</strong><br><span class="meta">${esc(t.id)}</span></td>
      <td>${esc(t.version)}</td>
      <td>${esc(longDate(t.dated))}</td>
      <td>${pill(t.status)}</td>
      <td><span class="meta">${esc(t.file)}</span></td>
    </tr>`).join("");

  const body = `
    <h2 class="day">Settings</h2>

    <h3>Summary of rights and obligations</h3>
    <div class="note ${values.rights_summary_text ? "good" : "stop"}">
      <b>${values.rights_summary_text ? "Entered" : "Not entered yet"}</b>
      ${esc(law.provision("sc.demand.summary-of-rights").statement)}
      <div class="fix">Blockclerk does not reproduce this from memory. The wording is prescribed
        word for word, and an approximation of a prescribed form is worth nothing. Copy it from
        <a href="${esc(law.provision("sc.demand.summary-of-rights").url)}" target="_blank"
           rel="noreferrer noopener">the regulations</a> and paste it below. You only do this once.</div>
    </div>

    <form method="POST" action="/settings">
      ${field("rights_summary_text", "The prescribed wording",
        values.rights_summary_text || "", { rows: 14 })}
      <h3>Wording that goes on every demand</h3>
      ${field("payment_terms", "Payment terms", values.payment_terms || "",
        { hint: "Take this from the lease. Blockclerk does not know what your lease says." })}
      ${field("payment_details", "How to pay", values.payment_details || "", { rows: 2 })}
      ${field("issued_by", "Who normally records documents as issued", values.issued_by || "")}
      <div class="actions"><button class="go" type="submit">Save</button></div>
    </form>

    <h3>The document formats in use</h3>
    <p class="sub">Every statutory format lives in a file, versioned and dated. Replacing one is
      a matter of adding a file — no part of a format is written into the program.</p>
    <table>
      <tr><th>Document</th><th>Version</th><th>Wording dated</th><th>Status</th><th>File</th></tr>
      ${rows}
    </table>
    <p class="meta">Run <code>npm run check</code> after changing any of them. It refuses any
      template that gives advice, or that states unsettled law as settled.</p>`;

  return layout({ title: "Settings", tab: "/settings", body, wide: true });
}
