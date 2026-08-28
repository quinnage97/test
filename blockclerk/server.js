import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import path from "node:path";

import { db, here, setting, setSetting, today, longDate } from "./db.js";
import { pounds, parseMoney } from "./lib/money.js";
import * as SC from "./lib/servicecharge.js";
import * as H from "./lib/heat.js";
import * as T from "./lib/templates.js";
import * as law from "./lib/law.js";
import { layout, esc, field, lawPage } from "./views/render.js";
import * as P from "./views/pages.js";
import * as HP from "./views/heat-pages.js";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());
app.use(express.static(path.join(here, "public")));

// --- Sign in ----------------------------------------------------------------
// One password, one long-lived cookie. It exists because the database holds
// leaseholders' names and addresses. Leave APP_PASSWORD unset for local use.
const PASSWORD = process.env.APP_PASSWORD;
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const sign = (v) => v + "." + crypto.createHmac("sha256", SECRET).update(v).digest("hex");
const valid = (c) => {
  if (!c) return false;
  const i = c.lastIndexOf(".");
  if (i < 0) return false;
  const expected = sign(c.slice(0, i));
  return expected.length === c.length &&
         crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(c));
};

app.use((req, res, next) => {
  if (!PASSWORD) return next();
  if (req.path === "/login" || req.path === "/app.css") return next();
  if (valid(req.cookies.auth)) return next();
  res.redirect("/login");
});

app.get("/login", (req, res) => res.send(layout({
  title: "Sign in", body: `
  <h2 class="day">Sign in</h2>
  <form method="POST" action="/login">
    ${field("password", "Password", "", { type: "password" })}
    <div class="actions"><button class="go" type="submit">Sign in</button></div>
  </form>` })));

app.post("/login", (req, res) => {
  if (req.body.password === PASSWORD) {
    res.cookie("auth", sign("ok"), {
      httpOnly: true, sameSite: "lax", maxAge: 365 * 86400_000,
      secure: process.env.NODE_ENV === "production",
    });
    return res.redirect("/");
  }
  res.redirect("/login");
});

// --- Loading helpers --------------------------------------------------------

const getBuilding = (id) => db.prepare("SELECT * FROM buildings WHERE id = ?").get(id);
const getYear = (id) => db.prepare("SELECT * FROM years WHERE id = ?").get(id);
const notFound = (res) => res.status(404).send(layout({
  title: "Not found", body: `<div class="empty"><h3>That page isn't here</h3>
    <p><a href="/">Back to your buildings</a></p></div>` }));

function heatSummary(building) {
  const a = H.assess(building.id);
  const gaps = H.gaps(building.id).length;
  const headline = {
    likely_in_scope: "Likely to be in scope, so registration is expected to be needed.",
    likely_out: "Likely to be out of scope.",
    unclear: "Not enough answered yet to say.",
  }[a.result];
  const sub = a.result === "likely_in_scope"
    ? `${gaps ? `${gaps} thing${gaps === 1 ? "" : "s"} still needed for the registration pack.`
              : "The registration pack has everything it asks for."}`
    : a.result === "unclear"
      ? `${a.unanswered.length} question${a.unanswered.length === 1 ? "" : "s"} outstanding.`
      : "Run the test again if the heating arrangements change.";
  return { headline, sub, assessment: a };
}

// --- Buildings --------------------------------------------------------------

app.get("/", (req, res) => {
  const buildings = db.prepare(`
    SELECT b.*,
      (SELECT COUNT(*) FROM units u WHERE u.building_id = b.id AND u.archived = 0) unit_count,
      (SELECT COUNT(*) FROM years y WHERE y.building_id = b.id) year_count,
      (SELECT COUNT(*) FROM issues i WHERE i.building_id = b.id) issued_count
    FROM buildings b WHERE b.archived = 0 ORDER BY b.name`).all();
  res.send(P.dashboard({
    buildings, deadline: H.deadline(), staleCount: law.staleProvisions().length,
  }));
});

const BUILDING_FIELDS = ["name", "address", "postcode", "entity_kind", "entity_name",
  "entity_address", "agent_name", "units_count", "year_end", "communal_heating",
  "insurer", "broker", "policy_number", "policy_start", "policy_end",
  "insured_risks", "commission_note", "notes"];

function buildingValues(body) {
  const v = Object.fromEntries(BUILDING_FIELDS.map((k) => [k, body[k]?.trim() || null]));
  v.communal_heating = body.communal_heating === "1" ? 1 : 0;
  v.units_count = body.units_count ? Number(body.units_count) : null;
  v.sum_insured_pence = parseMoney(body.sum_insured) || null;
  v.premium_pence = parseMoney(body.premium) || null;
  return v;
}
const BUILDING_COLS = [...BUILDING_FIELDS, "sum_insured_pence", "premium_pence"];

app.get("/buildings/new", (req, res) =>
  res.send(P.buildingForm({ entity_kind: "rmc" }, "/buildings/new", "Add a building")));

app.post("/buildings/new", (req, res) => {
  const v = buildingValues(req.body);
  if (!v.name) return res.redirect("/buildings/new");
  const id = db.prepare(`INSERT INTO buildings (${BUILDING_COLS.join(",")})
    VALUES (${BUILDING_COLS.map((k) => "@" + k).join(",")})`).run(v).lastInsertRowid;
  res.redirect(`/buildings/${id}`);
});

app.get("/buildings/:id/edit", (req, res) => {
  const b = getBuilding(req.params.id);
  if (!b) return notFound(res);
  res.send(P.buildingForm(b, `/buildings/${b.id}/edit`, `Edit ${b.name}`));
});

app.post("/buildings/:id/edit", (req, res) => {
  const b = getBuilding(req.params.id);
  if (!b) return notFound(res);
  db.prepare(`UPDATE buildings SET ${BUILDING_COLS.map((k) => `${k}=@${k}`).join(",")}
              WHERE id=@id`).run({ ...buildingValues(req.body), id: b.id });
  res.redirect(`/buildings/${b.id}`);
});

app.get("/buildings/:id", (req, res) => {
  const b = getBuilding(req.params.id);
  if (!b) return notFound(res);
  const units = db.prepare(
    "SELECT * FROM units WHERE building_id = ? AND archived = 0 ORDER BY id").all(b.id);
  const years = db.prepare(`
    SELECT y.*,
      (SELECT COUNT(*) FROM lines l WHERE l.year_id = y.id) line_count,
      (SELECT COALESCE(SUM(l.amount_pence),0) FROM lines l
        WHERE l.year_id = y.id AND l.kind = 'expenditure') total_pence
    FROM years y WHERE y.building_id = ? ORDER BY y.period_end DESC`).all(b.id);
  const documents = db.prepare(`
    SELECT d.id, d.title, d.created_at,
      (SELECT COUNT(*) FROM issues i WHERE i.document_id = d.id) issue_count
    FROM documents d WHERE d.building_id = ? ORDER BY d.id DESC LIMIT 50`).all(b.id);

  res.send(P.buildingPage({
    building: b, units, years, documents,
    shareTotal: units.reduce((t, u) => t + (Number(u.share_percent) || 0), 0),
    heat: heatSummary(b),
  }));
});

// --- Flats ------------------------------------------------------------------

const UNIT_FIELDS = ["ref", "leaseholder", "correspondence", "email", "method"];
const unitValues = (body) => ({
  ...Object.fromEntries(UNIT_FIELDS.map((k) => [k, body[k]?.trim() || null])),
  share_percent: Number(body.share_percent) || 0,
});

app.get("/buildings/:id/units/new", (req, res) => {
  const b = getBuilding(req.params.id);
  if (!b) return notFound(res);
  res.send(P.unitForm(b, {}, `/buildings/${b.id}/units/new`, "Add a flat"));
});

app.post("/buildings/:id/units/new", (req, res) => {
  const b = getBuilding(req.params.id);
  if (!b) return notFound(res);
  const v = unitValues(req.body);
  if (!v.ref) return res.redirect(`/buildings/${b.id}/units/new`);
  db.prepare(`INSERT INTO units (building_id, ref, leaseholder, correspondence, email,
              method, share_percent)
              VALUES (@building_id, @ref, @leaseholder, @correspondence, @email,
                      @method, @share_percent)`).run({ ...v, building_id: b.id });
  res.redirect(`/buildings/${b.id}`);
});

app.get("/units/:id", (req, res) => {
  const u = db.prepare("SELECT * FROM units WHERE id = ?").get(req.params.id);
  if (!u) return notFound(res);
  res.send(P.unitForm(getBuilding(u.building_id), u, `/units/${u.id}`, u.ref));
});

app.post("/units/:id", (req, res) => {
  const u = db.prepare("SELECT * FROM units WHERE id = ?").get(req.params.id);
  if (!u) return notFound(res);
  // Flats are archived, never deleted: a demand already issued has to keep
  // pointing at somebody.
  if (req.body.archive) db.prepare("UPDATE units SET archived = 1 WHERE id = ?").run(u.id);
  else db.prepare(`UPDATE units SET ref=@ref, leaseholder=@leaseholder,
    correspondence=@correspondence, email=@email, method=@method,
    share_percent=@share_percent WHERE id=@id`).run({ ...unitValues(req.body), id: u.id });
  res.redirect(`/buildings/${u.building_id}`);
});

// --- Accounting years -------------------------------------------------------

const yearValues = (body) => ({
  period_start: body.period_start || null,
  period_end: body.period_end || null,
  on_account_pence: parseMoney(body.on_account) || 0,
  reserve_open_pence: parseMoney(body.reserve_open) || 0,
  reserve_in_pence: parseMoney(body.reserve_in) || 0,
  reserve_out_pence: parseMoney(body.reserve_out) || 0,
  prepared_by: body.prepared_by?.trim() || null,
  prepared_on: body.prepared_on || null,
  examined_by: body.examined_by?.trim() || null,
  examined_on: body.examined_on || null,
  notes: body.notes?.trim() || null,
});

app.get("/buildings/:id/years/new", (req, res) => {
  const b = getBuilding(req.params.id);
  if (!b) return notFound(res);
  res.send(P.yearForm(b, {}, `/buildings/${b.id}/years/new`, "Start an accounting year"));
});

app.post("/buildings/:id/years/new", (req, res) => {
  const b = getBuilding(req.params.id);
  if (!b) return notFound(res);
  const v = yearValues(req.body);
  if (!v.period_start || !v.period_end) {
    return res.redirect(`/buildings/${b.id}/years/new`);
  }
  const id = db.prepare(`INSERT INTO years (building_id, period_start, period_end,
    on_account_pence, reserve_open_pence, reserve_in_pence, reserve_out_pence,
    prepared_by, prepared_on, examined_by, examined_on, notes)
    VALUES (@building_id, @period_start, @period_end, @on_account_pence,
      @reserve_open_pence, @reserve_in_pence, @reserve_out_pence, @prepared_by,
      @prepared_on, @examined_by, @examined_on, @notes)`)
    .run({ ...v, building_id: b.id }).lastInsertRowid;
  res.redirect(`/years/${id}`);
});

app.get("/years/:id/edit", (req, res) => {
  const y = getYear(req.params.id);
  if (!y) return notFound(res);
  res.send(P.yearForm(getBuilding(y.building_id), y, `/years/${y.id}/edit`, "Edit the year"));
});

app.post("/years/:id/edit", (req, res) => {
  const y = getYear(req.params.id);
  if (!y) return notFound(res);
  const v = yearValues(req.body);
  db.prepare(`UPDATE years SET period_start=@period_start, period_end=@period_end,
    on_account_pence=@on_account_pence, reserve_open_pence=@reserve_open_pence,
    reserve_in_pence=@reserve_in_pence, reserve_out_pence=@reserve_out_pence,
    prepared_by=@prepared_by, prepared_on=@prepared_on, examined_by=@examined_by,
    examined_on=@examined_on, notes=@notes WHERE id=@id`).run({ ...v, id: y.id });
  res.redirect(`/years/${y.id}`);
});

app.get("/years/:id", (req, res) => {
  const loaded = SC.loadYear(req.params.id);
  if (!loaded) return notFound(res);
  res.send(P.yearPage({
    building: loaded.building, year: loaded.year,
    expenditure: loaded.expenditure, income: loaded.income,
    totals: SC.figures(loaded), warnings: SC.checks(loaded),
  }));
});

// --- Lines of figures -------------------------------------------------------

const lineValues = (body) => ({
  kind: body.kind === "income" ? "income" : "expenditure",
  category: body.category?.trim() || null,
  description: body.description?.trim() || null,
  amount_pence: parseMoney(body.amount) || 0,
  incurred_on: body.incurred_on || null,
  qualifying_works: body.qualifying_works === "1" ? 1 : 0,
  consulted: body.consulted === "1" ? 1 : 0,
  supplier: body.supplier?.trim() || null,
  notes: body.notes?.trim() || null,
});

app.get("/years/:id/lines/new", (req, res) => {
  const y = getYear(req.params.id);
  if (!y) return notFound(res);
  res.send(P.lineForm(getBuilding(y.building_id), y,
    { kind: req.query.kind === "income" ? "income" : "expenditure" },
    `/years/${y.id}/lines/new`,
    req.query.kind === "income" ? "Add income" : "Add something spent"));
});

app.post("/years/:id/lines/new", (req, res) => {
  const y = getYear(req.params.id);
  if (!y) return notFound(res);
  const v = lineValues(req.body);
  if (!v.category) return res.redirect(`/years/${y.id}/lines/new`);
  db.prepare(`INSERT INTO lines (year_id, kind, category, description, amount_pence,
    incurred_on, qualifying_works, consulted, supplier, notes)
    VALUES (@year_id, @kind, @category, @description, @amount_pence, @incurred_on,
      @qualifying_works, @consulted, @supplier, @notes)`).run({ ...v, year_id: y.id });
  res.redirect(`/years/${y.id}`);
});

app.get("/lines/:id", (req, res) => {
  const l = db.prepare("SELECT * FROM lines WHERE id = ?").get(req.params.id);
  if (!l) return notFound(res);
  const y = getYear(l.year_id);
  res.send(P.lineForm(getBuilding(y.building_id), y, l, `/lines/${l.id}`, l.category));
});

app.post("/lines/:id", (req, res) => {
  const l = db.prepare("SELECT * FROM lines WHERE id = ?").get(req.params.id);
  if (!l) return notFound(res);
  if (req.body.delete) db.prepare("DELETE FROM lines WHERE id = ?").run(l.id);
  else db.prepare(`UPDATE lines SET kind=@kind, category=@category, description=@description,
    amount_pence=@amount_pence, incurred_on=@incurred_on, qualifying_works=@qualifying_works,
    consulted=@consulted, supplier=@supplier, notes=@notes WHERE id=@id`)
    .run({ ...lineValues(req.body), id: l.id });
  res.redirect(`/years/${l.year_id}`);
});

// --- The document pack ------------------------------------------------------

app.get("/years/:id/pack", (req, res) => {
  const pack = SC.buildPack(req.params.id, { strict: false });
  if (!pack) return notFound(res);
  res.send(P.packPage({
    building: pack.loaded.building, year: pack.loaded.year, pack,
    saved: req.query.saved ? Number(req.query.saved) : 0,
  }));
});

app.get("/years/:id/pack/:index", (req, res) => {
  const pack = SC.buildPack(req.params.id, { strict: false });
  if (!pack) return notFound(res);
  const index = Number(req.params.index);
  const doc = pack.docs[index];
  if (!doc) return notFound(res);
  res.send(P.packDocPage({
    building: pack.loaded.building, year: pack.loaded.year,
    doc, index, count: pack.docs.length,
  }));
});

app.post("/years/:id/pack", (req, res) => {
  const pack = SC.buildPack(req.params.id, { strict: false });
  if (!pack) return notFound(res);
  // A document with an unfilled slot, or a "deal with this first" warning
  // outstanding, does not get frozen into the record.
  if (pack.warnings.some((w) => w.level === "stop")) {
    return res.redirect(`/years/${pack.loaded.year.id}/pack`);
  }
  const save = db.transaction(() => {
    let n = 0;
    for (const doc of pack.docs) {
      if (doc.missing.length) continue;
      SC.saveDocument({
        buildingId: pack.loaded.building.id,
        yearId: pack.loaded.year.id,
        unitId: doc.unit ? doc.unit.id : null,
        doc, warnings: pack.warnings,
      });
      n++;
    }
    db.prepare("UPDATE years SET status = 'issued' WHERE id = ?").run(pack.loaded.year.id);
    return n;
  });
  const n = save();
  res.redirect(`/years/${pack.loaded.year.id}/pack?saved=${n}`);
});

// --- Documents and the issue record ----------------------------------------

app.get("/documents", (req, res) => {
  const rows = db.prepare(`
    SELECT d.id, d.title, d.template_id, d.template_version, d.created_at,
      b.name building_name,
      (SELECT COUNT(*) FROM issues i WHERE i.document_id = d.id) issue_count,
      (SELECT MAX(i.issued_on) FROM issues i WHERE i.document_id = d.id) last_issued
    FROM documents d JOIN buildings b ON b.id = d.building_id
    ORDER BY d.id DESC LIMIT 500`).all();
  res.send(P.documentsPage({ rows }));
});

// The record somebody will eventually ask for, in the format they will ask for.
app.get("/documents/export", (req, res) => {
  const rows = db.prepare(`
    SELECT b.name AS building, d.title, d.kind, d.template_id, d.template_version,
           d.template_status, d.created_at AS produced_at,
           i.recipient, i.method, i.issued_on, i.issued_by, i.note
    FROM documents d
    JOIN buildings b ON b.id = d.building_id
    LEFT JOIN issues i ON i.document_id = d.id
    ORDER BY d.id, i.id`).all();
  const header = ["building", "document", "kind", "template", "template_version",
                  "template_status", "produced_at", "issued_to", "how", "issued_on",
                  "recorded_by", "note"];
  const csv = [header.join(","), ...rows.map((r) => Object.values(r)
    .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="blockclerk-issued-${today()}.csv"`);
  res.send(csv);
});

app.get("/documents/:id", (req, res) => {
  const doc = db.prepare("SELECT * FROM documents WHERE id = ?").get(req.params.id);
  if (!doc) return notFound(res);
  const issues = db.prepare(
    "SELECT * FROM issues WHERE document_id = ? ORDER BY id").all(doc.id);
  let basis = [];
  try { basis = JSON.parse(doc.basis || "[]"); } catch { basis = []; }
  res.send(P.documentPage({
    doc, building: getBuilding(doc.building_id),
    unit: doc.unit_id ? db.prepare("SELECT * FROM units WHERE id = ?").get(doc.unit_id) : null,
    issues, basis,
  }));
});

app.post("/documents/:id/issue", (req, res) => {
  const doc = db.prepare("SELECT * FROM documents WHERE id = ?").get(req.params.id);
  if (!doc) return notFound(res);
  const recipient = req.body.recipient?.trim();
  if (!recipient) return res.redirect(`/documents/${doc.id}`);
  db.prepare(`INSERT INTO issues (document_id, building_id, unit_id, recipient, method,
    issued_on, issued_by, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(doc.id, doc.building_id, doc.unit_id,
         recipient, req.body.method || "post", req.body.issued_on || today(),
         req.body.issued_by?.trim() || setting("issued_by") || null,
         req.body.note?.trim() || null);
  res.redirect(`/documents/${doc.id}`);
});

// --- Heat networks ----------------------------------------------------------

app.get("/buildings/:id/heat", (req, res) => {
  const b = getBuilding(req.params.id);
  if (!b) return notFound(res);
  res.send(HP.scopePage({
    building: b, questions: H.questions(), given: H.answers(b.id),
    assessment: H.assess(b.id), deadline: H.deadline(), doc: H.scopeDocument(b),
  }));
});

app.post("/buildings/:id/heat", (req, res) => {
  const b = getBuilding(req.params.id);
  if (!b) return notFound(res);
  H.saveAnswers(b.id, req.body);
  res.redirect(`/buildings/${b.id}/heat`);
});

app.get("/buildings/:id/heat/registration", (req, res) => {
  const b = getBuilding(req.params.id);
  if (!b) return notFound(res);
  res.send(HP.registrationPage({
    building: b, fields: H.fields(), values: H.facts(b.id),
    doc: H.registrationDocument(b), deadline: H.deadline(), gaps: H.gaps(b.id),
  }));
});

app.post("/buildings/:id/heat/registration", (req, res) => {
  const b = getBuilding(req.params.id);
  if (!b) return notFound(res);
  H.saveFacts(b.id, req.body);
  res.redirect(`/buildings/${b.id}/heat/registration`);
});

app.post("/buildings/:id/heat/registration/save", (req, res) => {
  const b = getBuilding(req.params.id);
  if (!b) return notFound(res);
  const doc = H.registrationDocument(b);
  const id = SC.saveDocument({ buildingId: b.id, doc, warnings: [] });
  res.redirect(`/documents/${id}`);
});

app.get("/buildings/:id/heat/conditions", (req, res) => {
  const b = getBuilding(req.params.id);
  if (!b) return notFound(res);
  const doc = H.conditionsDocument(b);
  res.send(HP.conditionsPage({
    building: b, rows: doc.rows, tally: doc.tally, doc, deadline: H.deadline(),
  }));
});

app.post("/buildings/:id/heat/conditions", (req, res) => {
  const b = getBuilding(req.params.id);
  if (!b) return notFound(res);
  const id = req.body.condition_id;
  H.saveCondition(b.id, id, {
    status: req.body[`status_${id}`],
    due: req.body[`due_${id}`],
    evidence: req.body[`evidence_${id}`]?.trim(),
  });
  res.redirect(`/buildings/${b.id}/heat/conditions`);
});

app.post("/buildings/:id/heat/conditions/save", (req, res) => {
  const b = getBuilding(req.params.id);
  if (!b) return notFound(res);
  const doc = H.conditionsDocument(b);
  const id = SC.saveDocument({ buildingId: b.id, doc, warnings: [] });
  res.redirect(`/documents/${id}`);
});

// --- The law, and settings --------------------------------------------------

app.get("/law", (req, res) => res.send(lawPage()));

const SETTINGS = ["rights_summary_text", "payment_terms", "payment_details", "issued_by"];

app.get("/settings", (req, res) => res.send(HP.settingsPage({
  values: Object.fromEntries(SETTINGS.map((k) => [k, setting(k, "")])),
  templates: T.ids().map((id) => T.current(id)),
})));

app.post("/settings", (req, res) => {
  for (const k of SETTINGS) {
    if (req.body[k] === undefined) continue;
    const value = String(req.body[k]).trim();
    setSetting(k, value);
    // When the prescribed wording is entered, remember the day it was entered:
    // the document that wraps it says so, and that has to be true.
    if (k === "rights_summary_text" && value) setSetting("rights_summary_entered_on", today());
  }
  res.redirect("/settings");
});

// --- Problems ---------------------------------------------------------------

app.use((req, res) => notFound(res));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send(layout({ title: "Problem", body: `
    <div class="empty"><h3>Something went wrong</h3>
    <p>Nothing you entered has been lost. Try again in a moment.</p>
    <p style="margin-top:20px"><a class="btn" href="/">Back to your buildings</a></p></div>` }));
});

// Start on PORT (or 4700), and walk up if something already has that port.
const wanted = Number(process.env.PORT) || 4700;

function listen(port, attemptsLeft = 15) {
  const server = app.listen(port, () =>
    console.log(`\n  Blockclerk is running.\n  Open this in your browser:  http://localhost:${port}\n`));
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE" && attemptsLeft > 0) {
      console.log(`  Port ${port} is busy, trying ${port + 1}...`);
      return listen(port + 1, attemptsLeft - 1);
    }
    throw err;
  });
}

listen(wanted);
