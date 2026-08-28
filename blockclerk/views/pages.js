import { layout, esc, pill, field, warningList, docBlock, notAdviceNote } from "./render.js";
import { pounds, percent } from "../lib/money.js";
import { longDate } from "../db.js";
import * as law from "../lib/law.js";

const ENTITY = [["rmc", "Resident management company (RMC)"],
                ["rtm", "RTM company"],
                ["freeholder", "Freeholder"],
                ["agent", "Managing agent"]];

const METHOD = [["post", "By post"], ["email", "By email"], ["hand", "By hand"]];

const crumb = (b) =>
  `<p class="meta"><a href="/buildings/${b.id}">${esc(b.name)}</a></p>`;

// --- Dashboard --------------------------------------------------------------

export function dashboard({ buildings, deadline, staleCount }) {
  const countdown = `
    <div class="countdown">
      <div class="big">${deadline.days === null ? "—"
        : deadline.days > 0 ? `${deadline.days} days`
        : deadline.days === 0 ? "Today"
        : `${Math.abs(deadline.days)} days ago`}</div>
      <div>until the heat network registration date currently recorded
        (${esc(longDate(deadline.date))}).</div>
      <div class="src">${esc(law.citationLine(deadline.provision))}</div>
    </div>`;

  const cards = buildings.map((b) => `
    <div class="card">
      <h4><a href="/buildings/${b.id}">${esc(b.name)}</a></h4>
      <p class="meta">${esc([b.address, b.postcode].filter(Boolean).join(", ") || "No address yet")}</p>
      <p class="meta">${b.unit_count} ${b.unit_count === 1 ? "flat" : "flats"}
        · ${b.year_count} accounting ${b.year_count === 1 ? "year" : "years"}
        · ${b.issued_count} document${b.issued_count === 1 ? "" : "s"} issued</p>
      <p>${b.communal_heating
        ? `${pill("expected", "Communal heating")} <a href="/buildings/${b.id}/heat">heat network →</a>`
        : `<span class="pill plain">No communal heating recorded</span>`}</p>
    </div>`).join("");

  const body = `
    <h2 class="day">Your buildings</h2>
    <p class="sub">Service charge documents, and heat network registration, for blocks of flats
      in England.</p>
    ${countdown}
    ${staleCount ? `<div class="note look"><b>${staleCount} of the rules behind these documents
      ${staleCount === 1 ? "has" : "have"} not been re-checked lately</b>
      Nothing is settled until the statutory instruments are made.
      <div class="fix"><a href="/law">Open what the law says</a> and confirm before you issue anything.</div>
      </div>` : ""}
    ${buildings.length
      ? `<div class="grid">${cards}</div>`
      : `<div class="empty"><h3>No buildings yet</h3>
         <p>Add the block you are responsible for and Blockclerk can start on its documents.</p></div>`}
    <div class="actions"><a class="btn go" href="/buildings/new">Add a building</a></div>`;

  return layout({ title: "Buildings", tab: "/", body });
}

// --- A building -------------------------------------------------------------

export function buildingForm(b = {}, action, title) {
  return layout({ title, tab: "/", body: `
    <h2 class="day">${esc(title)}</h2>
    <form method="POST" action="${esc(action)}">
      <h3>The block</h3>
      ${field("name", "What the block is called", b.name)}
      ${field("address", "Address", b.address)}
      ${field("postcode", "Postcode", b.postcode)}
      <div class="row">
        <div>${field("units_count", "How many flats", b.units_count, { type: "number" })}</div>
        <div>${field("year_end", "Accounting year end", b.year_end,
          { hint: "As MM-DD, for example 03-31 for 31 March" })}</div>
      </div>

      <h3>Who demands the service charge</h3>
      <p class="sub">${esc(law.provision("sc.demand.name-address").statement)}</p>
      ${field("entity_kind", "What kind of body it is", b.entity_kind, { options: ENTITY })}
      ${field("entity_name", "Its full name", b.entity_name,
        { hint: "Exactly as it appears at Companies House" })}
      ${field("entity_address", "Its address for the service of notices", b.entity_address,
        { hint: "This has to be an address in England or Wales", rows: 2 })}
      ${field("agent_name", "Managing agent, if there is one", b.agent_name)}

      <h3>Heating</h3>
      ${field("communal_heating", "Is heating or hot water shared from one source?",
        String(b.communal_heating ?? 0),
        { options: [["0", "No — every flat has its own boiler"],
                    ["1", "Yes — there is a shared boiler, plant room or district connection"]],
          hint: "If yes, the block may be a heat network. Blockclerk will help you work that out." })}

      <h3>Insurance</h3>
      <div class="row">
        <div>${field("insurer", "Insurer", b.insurer)}</div>
        <div>${field("broker", "Broker", b.broker)}</div>
      </div>
      <div class="row">
        <div>${field("policy_number", "Policy number", b.policy_number)}</div>
        <div>${field("policy_start", "Cover from", b.policy_start, { type: "date" })}</div>
        <div>${field("policy_end", "Cover to", b.policy_end, { type: "date" })}</div>
      </div>
      <div class="row">
        <div>${field("sum_insured", "Sum insured", b.sum_insured_pence ? pounds(b.sum_insured_pence) : "")}</div>
        <div>${field("premium", "Premium for the year", b.premium_pence ? pounds(b.premium_pence) : "")}</div>
      </div>
      ${field("insured_risks", "What the policy covers", b.insured_risks, { rows: 3 })}
      ${field("commission_note", "Commission and other payments", b.commission_note,
        { rows: 3, hint: "Who receives what out of the premium. Leaseholders are entitled to ask." })}

      ${field("notes", "Anything else worth recording", b.notes, { rows: 3 })}
      <div class="actions">
        <button class="go" type="submit">Save</button>
        <a class="btn" href="${b.id ? `/buildings/${b.id}` : "/"}">Cancel</a>
      </div>
    </form>` });
}

export function buildingPage({ building: b, units, years, shareTotal, heat, documents }) {
  const unitRows = units.map((u) => `
    <tr>
      <td><strong>${esc(u.ref)}</strong></td>
      <td>${esc(u.leaseholder || "—")}</td>
      <td class="num">${esc(percent(u.share_percent))}</td>
      <td>${esc((METHOD.find((m) => m[0] === u.method) || [, u.method])[1])}</td>
      <td><a href="/units/${u.id}">Change</a></td>
    </tr>`).join("");

  const yearRows = years.map((y) => `
    <tr>
      <td><a href="/years/${y.id}"><strong>${esc(longDate(y.period_start))} to
        ${esc(longDate(y.period_end))}</strong></a></td>
      <td>${y.line_count} line${y.line_count === 1 ? "" : "s"}</td>
      <td class="num">${esc(pounds(y.total_pence))}</td>
      <td>${y.status === "issued" ? pill("in_force", "Issued") : `<span class="pill plain">Draft</span>`}</td>
      <td><a href="/years/${y.id}/pack">Documents</a></td>
    </tr>`).join("");

  const shareOff = Math.abs(shareTotal - 100) > 0.005;

  const body = `
    <h2 class="day">${esc(b.name)}</h2>
    <p class="sub">${esc([b.address, b.postcode].filter(Boolean).join(", "))}</p>

    <div class="actions">
      <a class="btn" href="/buildings/${b.id}/edit">Edit the building</a>
      <a class="btn" href="/buildings/${b.id}/units/new">Add a flat</a>
      <a class="btn go" href="/buildings/${b.id}/years/new">Start an accounting year</a>
    </div>

    <h3>The flats (${units.length})</h3>
    ${units.length ? `<table>
      <tr><th>Flat</th><th>Leaseholder</th><th class="num">Share</th><th>Demands sent</th><th></th></tr>
      ${unitRows}
      <tr><td><strong>Total</strong></td><td></td>
          <td class="num"><strong>${esc(percent(shareTotal))}</strong></td><td colspan="2"></td></tr>
    </table>
    ${shareOff ? `<div class="note look"><b>The shares do not add up to 100%</b>
      They come to ${esc(percent(shareTotal))}. Check them against the leases.
      <div class="fix">If they genuinely do not total 100%, the difference falls somewhere —
      usually on the company.</div></div>` : ""}`
    : `<p class="sub">No flats yet. Blockclerk needs them, and their shares, before it can
       work out a demand.</p>`}

    <h3>Accounting years</h3>
    ${years.length ? `<table>
      <tr><th>Period</th><th>Figures</th><th class="num">Spent</th><th></th><th></th></tr>
      ${yearRows}</table>`
    : `<p class="sub">No years yet.</p>`}

    <h3>Heat network</h3>
    <div class="card">
      ${b.communal_heating
        ? `<p><strong>${esc(heat.headline)}</strong></p>
           <p class="meta">${esc(heat.sub)}</p>
           <div class="actions">
             <a class="btn" href="/buildings/${b.id}/heat">The scope test</a>
             <a class="btn" href="/buildings/${b.id}/heat/registration">Registration pack</a>
             <a class="btn" href="/buildings/${b.id}/heat/conditions">Ongoing conditions</a>
           </div>`
        : `<p>No shared heating is recorded for this block, so nothing here applies.</p>
           <p class="meta">If that is wrong, change it on the building page. A block with a
           communal boiler is likely to be a heat network.</p>`}
    </div>

    <h3>Documents produced (${documents.length})</h3>
    ${documents.length ? `<table>
      <tr><th>Document</th><th>Produced</th><th>Issued to</th></tr>
      ${documents.map((d) => `<tr>
        <td><a href="/documents/${d.id}">${esc(d.title)}</a></td>
        <td>${esc(d.created_at.slice(0, 10))}</td>
        <td>${d.issue_count ? `${d.issue_count} recipient${d.issue_count === 1 ? "" : "s"}`
                            : `<span class="pill plain">not issued</span>`}</td>
      </tr>`).join("")}</table>`
    : `<p class="sub">Nothing has been produced for this building yet.</p>`}`;

  return layout({ title: b.name, tab: "/", body });
}

export function unitForm(b, u = {}, action, title) {
  return layout({ title, tab: "/", body: `
    ${crumb(b)}
    <h2 class="day">${esc(title)}</h2>
    <form method="POST" action="${esc(action)}">
      ${field("ref", "Which flat", u.ref, { hint: "For example: Flat 12, or 12A" })}
      ${field("leaseholder", "Leaseholder's name", u.leaseholder,
        { hint: "As it appears on the lease. If it is jointly held, put both names." })}
      ${field("share_percent", "Their share of the service charge", u.share_percent,
        { type: "number", hint: "As a percentage, from the lease. All the flats should add to 100." })}
      ${field("correspondence", "Where demands go, if not the flat", u.correspondence, { rows: 2 })}
      ${field("email", "Email", u.email, { type: "email" })}
      ${field("method", "How they prefer to receive things", u.method || "post", { options: METHOD })}
      <div class="actions">
        <button class="go" type="submit">Save</button>
        <a class="btn" href="/buildings/${b.id}">Cancel</a>
        ${u.id ? `<button class="quiet" type="submit" name="archive" value="1"
                   formnovalidate>Remove this flat</button>` : ""}
      </div>
    </form>` });
}

// --- A year of figures ------------------------------------------------------

export function yearForm(b, y = {}, action, title) {
  return layout({ title, tab: "/", body: `
    ${crumb(b)}
    <h2 class="day">${esc(title)}</h2>
    <form method="POST" action="${esc(action)}">
      <div class="row">
        <div>${field("period_start", "The year runs from", y.period_start, { type: "date" })}</div>
        <div>${field("period_end", "to", y.period_end, { type: "date" })}</div>
      </div>
      ${field("on_account", "Total demanded on account during the year",
        y.on_account_pence ? pounds(y.on_account_pence) : "",
        { hint: "Everything you asked the flats for in advance, added together." })}
      <h3>Reserve fund</h3>
      <div class="row">
        <div>${field("reserve_open", "Held at the start", y.reserve_open_pence ? pounds(y.reserve_open_pence) : "")}</div>
        <div>${field("reserve_in", "Paid in", y.reserve_in_pence ? pounds(y.reserve_in_pence) : "")}</div>
        <div>${field("reserve_out", "Spent", y.reserve_out_pence ? pounds(y.reserve_out_pence) : "")}</div>
      </div>
      <h3>Who prepared it</h3>
      <div class="row">
        <div>${field("prepared_by", "Prepared by", y.prepared_by)}</div>
        <div>${field("prepared_on", "on", y.prepared_on, { type: "date" })}</div>
      </div>
      <div class="row">
        <div>${field("examined_by", "Accountant who reported on the accounts", y.examined_by)}</div>
        <div>${field("examined_on", "on", y.examined_on, { type: "date" })}</div>
      </div>
      ${field("notes", "Notes about the year", y.notes, { rows: 3 })}
      <div class="actions">
        <button class="go" type="submit">Save</button>
        <a class="btn" href="${y.id ? `/years/${y.id}` : `/buildings/${b.id}`}">Cancel</a>
      </div>
    </form>` });
}

export function yearPage({ building: b, year: y, expenditure, income, totals, warnings }) {
  const lineRow = (l) => `
    <tr>
      <td><strong>${esc(l.category)}</strong>
        ${l.description ? `<br><span class="meta">${esc(l.description)}</span>` : ""}
        ${l.qualifying_works ? ` <span class="pill ${l.consulted ? "in_force" : "expected"}">${
          l.consulted ? "works, consulted" : "works, not consulted"}</span>` : ""}</td>
      <td>${esc(l.incurred_on ? longDate(l.incurred_on) : "no date")}</td>
      <td class="num">${esc(pounds(l.amount_pence))}</td>
      <td><a href="/lines/${l.id}">Change</a></td>
    </tr>`;

  const body = `
    ${crumb(b)}
    <h2 class="day">${esc(longDate(y.period_start))} to ${esc(longDate(y.period_end))}</h2>
    <p class="sub">Enter what the building spent and what it received. Everything else follows
      from these figures.</p>

    ${warningList(warnings)}

    <h3>What the building spent</h3>
    ${expenditure.length ? `<table>
      <tr><th>What it was</th><th>When it was incurred</th><th class="num">Amount</th><th></th></tr>
      ${expenditure.map(lineRow).join("")}
      <tr><td><strong>Total</strong></td><td></td>
        <td class="num"><strong>${esc(pounds(totals.expTotal))}</strong></td><td></td></tr>
    </table>` : `<p class="sub">Nothing yet.</p>`}

    <h3>What the building received</h3>
    ${income.length ? `<table>
      <tr><th>What it was</th><th>When</th><th class="num">Amount</th><th></th></tr>
      ${income.map(lineRow).join("")}
      <tr><td><strong>Total</strong></td><td></td>
        <td class="num"><strong>${esc(pounds(totals.incTotal))}</strong></td><td></td></tr>
    </table>` : `<p class="sub">Nothing beyond the service charge itself.</p>`}

    <div class="actions">
      <a class="btn" href="/years/${y.id}/lines/new">Add something spent</a>
      <a class="btn" href="/years/${y.id}/lines/new?kind=income">Add income</a>
      <a class="btn" href="/years/${y.id}/edit">Edit the year</a>
      <a class="btn go" href="/years/${y.id}/pack">Produce the documents</a>
    </div>`;

  return layout({ title: "Accounting year", tab: "/", body });
}

export function lineForm(b, y, l = {}, action, title) {
  const kind = l.kind || "expenditure";
  return layout({ title, tab: "/", body: `
    ${crumb(b)}
    <h2 class="day">${esc(title)}</h2>
    <form method="POST" action="${esc(action)}">
      <input type="hidden" name="kind" value="${esc(kind)}">
      ${field("category", kind === "income" ? "What the money was for" : "What it was spent on",
        l.category, { hint: "Short, and the same wording each year: Cleaning, Lift maintenance, Insurance." })}
      ${field("description", "A bit more detail", l.description,
        { hint: "This appears on the annual report, so write it for a leaseholder." })}
      ${field("amount", "Amount", l.amount_pence ? pounds(l.amount_pence) : "")}
      ${field("incurred_on", "When it was incurred", l.incurred_on, { type: "date",
        hint: "Not when it was paid. The 18-month rule runs from when the cost was incurred." })}
      ${field("supplier", "Who to", l.supplier)}
      ${kind === "expenditure" ? `
        ${field("qualifying_works", "Is this a piece of works rather than routine running?",
          String(l.qualifying_works ?? 0),
          { options: [["0", "No, routine"], ["1", "Yes, a works project"]] })}
        ${field("consulted", "Were leaseholders consulted about it?", String(l.consulted ?? 0),
          { options: [["0", "No, or not recorded"], ["1", "Yes"]],
            hint: "Consultation is needed where one leaseholder's share would be over £250." })}` : ""}
      ${field("notes", "Notes", l.notes, { rows: 2 })}
      <div class="actions">
        <button class="go" type="submit">Save</button>
        <a class="btn" href="/years/${y.id}">Cancel</a>
        ${l.id ? `<button class="quiet" type="submit" name="delete" value="1" formnovalidate>Delete</button>` : ""}
      </div>
    </form>` });
}

// --- The pack ---------------------------------------------------------------

export function packPage({ building: b, year: y, pack, saved }) {
  const blocked = pack.warnings.some((w) => w.level === "stop");

  const list = pack.docs.map((d, i) => `
    <div class="card">
      <div style="display:flex;gap:12px;justify-content:space-between;flex-wrap:wrap;align-items:baseline">
        <h4 style="flex:1 1 300px">${esc(d.title)}</h4>
        ${pill(d.template.status)}
      </div>
      <p class="meta">Template ${esc(d.template.id)} version ${esc(d.template.version)},
        wording dated ${esc(longDate(d.template.dated))}${d.missing.length
          ? ` · <strong>needs ${esc(d.missing.join(", "))}</strong>` : ""}</p>
      <div class="actions"><a class="btn" href="/years/${y.id}/pack/${i}">Read it</a></div>
    </div>`).join("");

  const body = `
    ${crumb(b)}
    <h2 class="day">Documents for ${esc(longDate(y.period_start))} to ${esc(longDate(y.period_end))}</h2>
    <p class="sub">${pack.docs.length} documents, produced from the figures you entered.</p>

    ${saved ? `<div class="note good"><b>Saved to the record</b>
      ${saved} document${saved === 1 ? " was" : "s were"} frozen exactly as they read now, with the
      template version and what the law was understood to say today.
      <div class="fix"><a href="/documents">See what has been issued</a></div></div>` : ""}

    ${warningList(pack.warnings)}
    ${notAdviceNote()}

    ${list}

    <form method="POST" action="/years/${y.id}/pack">
      <div class="actions">
        <button class="go" type="submit" ${blocked ? "disabled" : ""}>Save this pack to the record</button>
        <a class="btn" href="/years/${y.id}">Back to the figures</a>
      </div>
      ${blocked ? `<p class="meta">There is something above marked <strong>deal with this first</strong>.
        Blockclerk will not freeze a pack while that is outstanding.</p>`
      : `<p class="meta">Saving freezes the wording. You then record who each document went to,
        and when, on its own page.</p>`}
    </form>`;

  return layout({ title: "Documents", tab: "/", body, wide: true });
}

export function packDocPage({ building: b, year: y, doc, index, count }) {
  const body = `
    <p class="meta no-print"><a href="/years/${y.id}/pack">← all ${count} documents</a></p>
    <h2 class="day">${esc(doc.title)}</h2>
    <p class="sub">${esc(doc.template.title)} · ${pill(doc.template.status)}
      · version ${esc(doc.template.version)}, dated ${esc(longDate(doc.template.dated))}</p>
    ${docBlock(doc, index + 1 < count
      ? `<a class="btn" href="/years/${y.id}/pack/${index + 1}">Next document</a>` : "")}`;
  return layout({ title: doc.title, tab: "/", body, wide: true });
}

// --- Saved documents and the issue record -----------------------------------

export function documentPage({ doc, building: b, unit, issues, basis }) {
  const issueRows = issues.map((i) => `
    <tr>
      <td><strong>${esc(i.recipient)}</strong></td>
      <td>${esc((METHOD.find((m) => m[0] === i.method) || [, i.method])[1])}</td>
      <td>${esc(longDate(i.issued_on))}</td>
      <td>${esc(i.issued_by || "")}${i.note ? `<br><span class="meta">${esc(i.note)}</span>` : ""}</td>
    </tr>`).join("");

  const body = `
    ${crumb(b)}
    <h2 class="day">${esc(doc.title)}</h2>
    <p class="sub">Produced ${esc(doc.created_at)} from template ${esc(doc.template_id)}
      version ${esc(doc.template_version)} ${pill(doc.template_status)}, wording dated
      ${esc(longDate(doc.template_dated))}.</p>

    ${docBlock({ text: doc.body, missing: [] })}

    <h3>Who it went to (${issues.length})</h3>
    ${issues.length ? `<table>
      <tr><th>Recipient</th><th>How</th><th>When</th><th>Recorded by</th></tr>
      ${issueRows}</table>`
    : `<p class="sub">Not recorded as issued to anybody yet.</p>`}

    <div class="card no-print">
      <h4>Record that this was issued</h4>
      <p class="meta">Nothing here is ever edited or deleted. If you get it wrong, record it
        again — both entries stay.</p>
      <form method="POST" action="/documents/${doc.id}/issue">
        ${field("recipient", "Who it went to",
          unit ? `${unit.leaseholder || ""}${unit.leaseholder ? ", " : ""}${unit.ref}` : "")}
        <div class="row">
          <div>${field("method", "How", unit?.method || "post", { options: METHOD })}</div>
          <div>${field("issued_on", "When", new Date().toISOString().slice(0, 10), { type: "date" })}</div>
        </div>
        ${field("issued_by", "Recorded by", "")}
        ${field("note", "Anything worth noting", "", { rows: 2 })}
        <div class="actions"><button class="go" type="submit">Record it</button></div>
      </form>
    </div>

    <h3>What this document rested on when it was produced</h3>
    <p class="sub">Frozen at the moment it was produced, so it still explains itself after the
      law and the templates have moved on.</p>
    ${basis.map((p) => `<div class="card">
      <div style="display:flex;gap:12px;justify-content:space-between;flex-wrap:wrap;align-items:baseline">
        <h4 style="flex:1 1 320px">${esc(p.statement)}</h4>${pill(p.status)}</div>
      <p class="meta">${esc(p.source)} · checked ${esc(longDate(p.checked_on))}</p>
    </div>`).join("")}`;

  return layout({ title: doc.title, tab: "/documents", body, wide: true });
}

export function documentsPage({ rows }) {
  const body = `
    <h2 class="day">What has been issued</h2>
    <p class="sub">Every document produced, and every record of it going out. This is the trail
      you will be asked for.</p>
    <div class="actions"><a class="btn" href="/documents/export">Download it all as a spreadsheet</a></div>
    ${rows.length ? `<table>
      <tr><th>Document</th><th>Building</th><th>Produced</th><th>Issued</th></tr>
      ${rows.map((r) => `<tr>
        <td><a href="/documents/${r.id}">${esc(r.title)}</a>
          <br><span class="meta">${esc(r.template_id)} v${esc(r.template_version)}</span></td>
        <td>${esc(r.building_name)}</td>
        <td>${esc(r.created_at.slice(0, 10))}</td>
        <td>${r.issue_count
          ? `${r.issue_count} · last ${esc(longDate(r.last_issued))}`
          : `<span class="pill plain">not issued</span>`}</td>
      </tr>`).join("")}</table>`
    : `<div class="empty"><h3>Nothing yet</h3><p>Produce a pack for an accounting year and it
       will appear here.</p></div>`}`;
  return layout({ title: "Issued", tab: "/documents", body, wide: true });
}
