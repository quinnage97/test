// Product 2: work out whether a block's communal heating is likely to be in
// scope, produce the registration information pack, and track the ongoing
// conditions afterwards.
//
// The questions, the reasoning, the list of things a registration needs, and
// the condition set are all declared in the template files. None of them are
// settled yet, and all of them will move. This module reads them and does the
// bookkeeping; it does not know what a heat network is.

import { db, today, longDate, daysUntil } from "../db.js";
import * as T from "./templates.js";
import * as law from "./law.js";

const pad = (s, n) => {
  const v = String(s ?? "");
  return v.length >= n ? v.slice(0, n - 1) + " " : v.padEnd(n);
};

export const scopeTemplate = () => T.current("heat.scope-test");
export const packTemplate = () => T.current("heat.registration-pack");
export const conditionsTemplate = () => T.current("heat.conditions");

export const questions = () => scopeTemplate().questions || [];
export const fields = () => packTemplate().fields || [];
export const conditionSet = () => conditionsTemplate().conditions || [];

// --- Answers ----------------------------------------------------------------

export function answers(buildingId) {
  const rows = db.prepare("SELECT question_id, answer FROM heat_answers WHERE building_id = ?")
    .all(buildingId);
  return Object.fromEntries(rows.map((r) => [r.question_id, r.answer]));
}

export function saveAnswers(buildingId, given) {
  const stmt = db.prepare(`
    INSERT INTO heat_answers (building_id, question_id, answer, answered_on)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(building_id, question_id)
    DO UPDATE SET answer = excluded.answer, answered_on = excluded.answered_on`);
  const valid = new Set(questions().map((q) => q.id));
  const run = db.transaction(() => {
    for (const [qid, answer] of Object.entries(given)) {
      if (!valid.has(qid)) continue;                 // a question from an older version
      if (!["yes", "no", "unknown"].includes(answer)) continue;
      stmt.run(buildingId, qid, answer, today());
    }
  });
  run();
}

// --- The scope test ---------------------------------------------------------

const matches = (when, given) =>
  Object.entries(when).every(([qid, want]) => given[qid] === want);

// Deliberately says "likely". It is a first sort, not a determination, and the
// difference matters: getting this wrong in the confident direction is how
// somebody ends up committing an offence they were told they were safe from.
export function assess(buildingId) {
  const t = scopeTemplate();
  const given = answers(buildingId);
  const required = t.required || [];
  const missing = required.filter((q) => !given[q] || given[q] === "unknown");

  const asked = questions().map((q) => ({
    id: q.id, text: q.text,
    answer: given[q.id] ? { yes: "Yes", no: "No", unknown: "Not known yet" }[given[q.id]]
                        : "Not answered",
  }));
  const unanswered = questions()
    .filter((q) => !given[q.id] || given[q.id] === "unknown")
    .map((q) => q.text);

  if (missing.length) {
    return {
      result: "unclear", template: t, asked, unanswered,
      reasons: [
        "The questions this test turns on have not all been answered.",
        ...missing.map((qid) => `Still open: ${questions().find((q) => q.id === qid)?.text || qid}`),
      ],
      roleNotes: [],
    };
  }

  const rule = (t.rules || []).find((r) => matches(r.when, given));
  const result = rule ? rule.result : "unclear";
  const reasons = rule
    ? [rule.because]
    : ["The answers given do not match any of the patterns this version of the test knows about."];

  const roleNotes = result === "likely_in_scope"
    ? (t.role_rules || []).filter((r) => matches(r.when, given)).map((r) => r.role)
    : [];

  return { result, template: t, asked, unanswered, reasons, roleNotes };
}

const HEADLINE = {
  likely_in_scope: "This building's heating is LIKELY to be in scope.",
  likely_out: "This building's heating is LIKELY to be out of scope.",
  unclear: "This test cannot say yet.",
};

const EXPLANATION = {
  likely_in_scope:
    "That means registration is expected to be needed, and the company or its agent is " +
    "expected to be the one that has to do it. Work through the registration pack next, " +
    "and confirm the position against Ofgem's own material before relying on it.",
  likely_out:
    "That means registration is not expected to be needed for this building. Keep this " +
    "assessment: if the heating arrangements change, run the test again.",
  unclear:
    "Answer the outstanding questions and run it again. Where an answer depends on what " +
    "the leases or the contracts say, that is worth finding out properly rather than guessing.",
};

const NEXT_STEP = {
  likely_in_scope: "Open the registration pack for this building and fill in the gaps it lists.",
  likely_out: "Nothing, unless the heating arrangements change.",
  unclear: "Answer the outstanding questions above.",
};

// --- The deadline -----------------------------------------------------------
//
// Read out of the law registry rather than written here, so that correcting it
// is a one-line change in a file a non-programmer can read.

export function deadline() {
  const p = law.provision("heat.registration-deadline");
  const date = p.date || null;
  const days = date ? daysUntil(date) : null;
  const sentence = date
    ? `Registration is expected to be required by ${longDate(date)}` +
      (days === null ? "." :
       days > 0 ? `, which is ${days} days away.` :
       days === 0 ? ", which is today." :
       `, which was ${Math.abs(days)} days ago.`) +
      " " + law.citationLine(p)
    : "No registration deadline is recorded. " + law.citationLine(p);
  return { provision: p, date, days, sentence };
}

// --- Facts for the registration pack ----------------------------------------

export function facts(buildingId) {
  const rows = db.prepare("SELECT key, value FROM heat_facts WHERE building_id = ?").all(buildingId);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function saveFacts(buildingId, given) {
  const stmt = db.prepare(`
    INSERT INTO heat_facts (building_id, key, value, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(building_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);
  const known = new Set(fields().map((f) => f.key));
  const run = db.transaction(() => {
    for (const [key, value] of Object.entries(given)) {
      if (!known.has(key)) continue;
      stmt.run(buildingId, key, String(value ?? "").trim() || null, today());
    }
  });
  run();
}

export function gaps(buildingId) {
  const have = facts(buildingId);
  return fields().filter((f) => f.required && !have[f.key]);
}

// --- Conditions -------------------------------------------------------------

export function conditions(buildingId) {
  const saved = Object.fromEntries(
    db.prepare("SELECT * FROM conditions WHERE building_id = ?").all(buildingId)
      .map((r) => [r.condition_id, r]));

  return conditionSet().map((c) => {
    const row = saved[c.id] || {};
    const due = row.due || (c.due_from ? law.provision(c.due_from).date : null) || null;
    return {
      ...c,
      status: row.status || "not_started",
      due,
      days: due ? daysUntil(due) : null,
      evidence: row.evidence || "",
      updated_at: row.updated_at || null,
    };
  });
}

export function saveCondition(buildingId, conditionId, { status, due, evidence }) {
  if (!conditionSet().some((c) => c.id === conditionId)) return false;
  db.prepare(`
    INSERT INTO conditions (building_id, condition_id, status, due, evidence, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(building_id, condition_id) DO UPDATE SET
      status = excluded.status, due = excluded.due,
      evidence = excluded.evidence, updated_at = excluded.updated_at`)
    .run(buildingId, conditionId, status || "not_started", due || null,
         evidence || null, today());
  return true;
}

// --- Documents --------------------------------------------------------------

function common(building, template) {
  return {
    produced_on: longDate(today()),
    not_advice: law.NOT_ADVICE,
    basis: law.basisBlock(template.basis),
    format_note:
      "The statutory detail behind this document has not been settled. What you are reading " +
      `is Blockclerk's working layout, version ${template.version}, dated ${longDate(template.dated)}. ` +
      "The source, and how settled it is, are set out below.",
    meta: {
      template_id: template.id, template_version: template.version,
      template_dated: longDate(template.dated),
    },
    building: {
      name: building.name,
      address: [building.address, building.postcode].filter(Boolean).join(", "),
    },
    deadline: { sentence: deadline().sentence },
  };
}

export function scopeDocument(building) {
  const t = scopeTemplate();
  const a = assess(building.id);
  const data = {
    ...common(building, t),
    outcome: {
      headline: HEADLINE[a.result],
      explanation: EXPLANATION[a.result],
      next_step: NEXT_STEP[a.result],
      reasons: a.reasons,
      role_notes: a.roleNotes,
      role_notes_any: a.roleNotes.length > 0,
    },
    answers: a.asked,
    unknowns: a.unanswered,
    unknowns_any: a.unanswered.length > 0,
  };
  const { text, missing } = T.render(t, data, { strict: false });
  return { template: t, kind: t.kind, title: t.title, text, missing, assessment: a };
}

export function registrationDocument(building) {
  const t = packTemplate();
  const have = facts(building.id);
  const a = assess(building.id);

  const groups = [];
  for (const f of fields()) {
    const name = f.group || "Details";
    let g = groups.find((x) => x.name === name);
    if (!g) groups.push((g = { name, rows: [] }));
    g.rows.push({
      label_col: pad(f.label, 42),
      value: have[f.key] || (f.required ? "— still needed —" : "— not given —"),
    });
  }

  const missingFields = gaps(building.id).map((f) => f.label);
  const data = {
    ...common(building, t),
    groups,
    gaps: missingFields,
    gaps_any: missingFields.length > 0,
    scope: {
      summary: `${HEADLINE[a.result]} ${a.reasons[0] || ""} ` +
               `(Scope test version ${a.template.version}, dated ${longDate(a.template.dated)}.)`,
    },
  };
  const { text, missing } = T.render(t, data, { strict: false });
  return { template: t, kind: t.kind, title: t.title, text, missing, gaps: missingFields };
}

const MARK = { done: "x", in_progress: "~", not_started: " ", n_a: "-" };

export function conditionsDocument(building) {
  const t = conditionsTemplate();
  const rows = conditions(building.id);
  const tally = { done: 0, in_progress: 0, not_started: 0, n_a: 0 };
  for (const r of rows) tally[r.status] = (tally[r.status] || 0) + 1;

  const data = {
    ...common(building, t),
    tally: Object.fromEntries(Object.entries(tally).map(([k, v]) => [k, String(v)])),
    conditions: rows.map((r) => ({
      ...r,
      mark: MARK[r.status] || " ",
      due_line: r.due ? `Due: ${longDate(r.due)}` : "",
      evidence_line: r.evidence ? `Record: ${r.evidence}` : "",
    })),
  };
  const { text, missing } = T.render(t, data, { strict: false });
  return { template: t, kind: t.kind, title: t.title, text, missing, rows, tally };
}
