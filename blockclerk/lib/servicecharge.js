// Product 1: take a building's year-end figures, produce the leaseholder
// document pack, and record what was issued to whom and when.
//
// The arithmetic lives here. The wording does not - every document is a
// template file, and this module's only job is to hand it a filled-in set of
// figures and let it do the talking.

import { db, today, longDate, daysBetween, setting } from "../db.js";
import { pounds, sum, apportion, percent } from "./money.js";
import * as T from "./templates.js";
import * as law from "./law.js";
import { checkUserText } from "./guard.js";

// --- Little layout helpers --------------------------------------------------
// Plain text documents, so columns are spaces. The template decides where the
// columns go; these just make the values the right width.
const LABEL = 40;
const AMT = 13;
const pad = (s, n) => {
  const v = String(s ?? "");
  return v.length >= n ? v.slice(0, n - 1) + " " : v.padEnd(n);
};
const right = (s, n = AMT) => String(s ?? "").padStart(n);

const ENTITY_ROLE = {
  rmc: "resident management company",
  rtm: "RTM company",
  freeholder: "freeholder",
  agent: "managing agent",
};

// --- Reading a year ---------------------------------------------------------

export function loadYear(yearId) {
  const year = db.prepare("SELECT * FROM years WHERE id = ?").get(yearId);
  if (!year) return null;
  const building = db.prepare("SELECT * FROM buildings WHERE id = ?").get(year.building_id);
  const units = db.prepare(
    "SELECT * FROM units WHERE building_id = ? AND archived = 0 ORDER BY id").all(building.id);
  const rows = db.prepare("SELECT * FROM lines WHERE year_id = ? ORDER BY id").all(yearId);
  return {
    year, building, units,
    expenditure: rows.filter((r) => r.kind === "expenditure"),
    income: rows.filter((r) => r.kind === "income"),
  };
}

// --- The figures ------------------------------------------------------------

export function figures(loaded) {
  const { year, units, expenditure, income } = loaded;
  const expTotal = sum(expenditure);
  const incTotal = sum(income);
  const net = expTotal - incTotal;

  // Each flat's share of the net cost, split so the parts add back to the whole.
  const shares = apportion(net, units);
  const onAccount = apportion(year.on_account_pence, units);

  const perUnit = units.map((u, i) => ({
    unit: u,
    share_pence: shares[i],
    on_account_pence: onAccount[i],
    balance_pence: shares[i] - onAccount[i],
  }));

  const reserveClose =
    year.reserve_open_pence + year.reserve_in_pence - year.reserve_out_pence;

  return {
    expTotal, incTotal, net, perUnit,
    sharePercentTotal: units.reduce((t, u) => t + (Number(u.share_percent) || 0), 0),
    result: year.on_account_pence - net,      // positive = surplus, negative = deficit
    reserve: {
      open: year.reserve_open_pence, in: year.reserve_in_pence,
      out: year.reserve_out_pence, close: reserveClose,
      any: Boolean(year.reserve_open_pence || year.reserve_in_pence ||
                   year.reserve_out_pence || reserveClose),
    },
  };
}

// --- The checks -------------------------------------------------------------
//
// Not a compliance verdict. A short list of the things that most often make a
// service charge document fail, phrased so a volunteer director can act on it.
// "stop" means it will probably cost you; "look" means read it and decide.

export function checks(loaded, f = figures(loaded)) {
  const { year, building, units, expenditure } = loaded;
  const out = [];
  const stop = (text, fix) => out.push({ level: "stop", text, fix });
  const look = (text, fix) => out.push({ level: "look", text, fix });

  if (!units.length) stop("This building has no flats on it yet, so no demand can be worked out.",
                          "Add the flats and their shares.");

  if (units.length) {
    const total = f.sharePercentTotal;
    if (Math.abs(total - 100) > 0.005) {
      const over = total > 100;
      look(`The flats' shares add up to ${percent(total)}, not 100%. ` +
           `That means the building is ${over ? "collecting more than it spends" : "carrying a shortfall itself"}.`,
           "Check the shares in the leases. If they genuinely do not total 100%, that is worth writing down.");
    }
    const noName = units.filter((u) => !u.leaseholder).length;
    if (noName) look(`${noName} ${noName === 1 ? "flat has" : "flats have"} no leaseholder name.`,
                     "A demand addressed to nobody is hard to defend. Fill the names in.");
  }

  if (!building.entity_name || !building.entity_address) {
    stop("The demand has nowhere to put the name and address of whoever is demanding the charge.",
         "Fill in the company name and its address for service on the building page. " +
         law.provision("sc.demand.name-address").statement);
  }

  const rights = setting("rights_summary_text");
  if (!rights) {
    stop("The summary of rights and obligations has not been entered, so it cannot go out with the demand.",
         "Paste the wording from the 2007 Regulations into Settings once. " +
         law.provision("sc.demand.summary-of-rights").statement);
  }

  if (!expenditure.length) stop("There are no expenditure figures for this year.",
                                "Add what the building spent.");

  // The 18-month rule. Measured from today, because the demand goes out today.
  const late = expenditure.filter(
    (l) => l.incurred_on && daysBetween(l.incurred_on, today()) > 548);
  if (late.length) {
    look(`${late.length} ${late.length === 1 ? "cost was" : "costs were"} incurred more than 18 months ago ` +
         `(${late.slice(0, 3).map((l) => l.category).join(", ")}${late.length > 3 ? ", and others" : ""}).`,
         law.provision("sc.eighteen-month-rule").statement +
         " Check whether leaseholders were told in writing at the time.");
  }
  const undated = expenditure.filter((l) => !l.incurred_on).length;
  if (undated) look(`${undated} ${undated === 1 ? "cost has" : "costs have"} no date on them, ` +
                    "so the 18-month rule cannot be checked against them.",
                    "Put the date the cost was incurred against each line.");

  // Consultation. The threshold bites on one leaseholder's share, not the total.
  const biggestShare = Math.max(0, ...units.map((u) => Number(u.share_percent) || 0)) / 100;
  for (const l of expenditure.filter((x) => x.qualifying_works && !x.consulted)) {
    const worst = Math.round(l.amount_pence * biggestShare);
    if (worst > 25000) {
      look(`"${l.category}" (${pounds(l.amount_pence)}) is marked as works and as not consulted on. ` +
           `The largest single share of it is ${pounds(worst)}.`,
           law.provision("sc.consultation").statement);
    }
  }

  if (!building.insurer || !building.sum_insured_pence) {
    look("The building's insurance details are incomplete, so the insurance document will have gaps.",
         "Fill in the insurer, policy number, period and sum insured on the building page.");
  }

  if (year.period_end > today()) {
    look(`This year does not end until ${longDate(year.period_end)}.`,
         "Year-end documents are usually produced after the year has finished.");
  }

  // Anything the user typed that reads as advice, or states unsettled law flatly.
  const typed = {};
  expenditure.forEach((l, i) => { if (l.notes) typed[`note on "${l.category}"`] = l.notes; });
  if (year.notes) typed["the year's notes"] = year.notes;
  if (building.commission_note) typed["the insurance commission note"] = building.commission_note;
  for (const hit of checkUserText(typed)) {
    look(`In ${hit.subject}: "${hit.phrase}"`, hit.why);
  }

  // Law that has not been looked at lately.
  const stale = law.staleProvisions();
  if (stale.length) {
    look(`${stale.length} of the rules behind these documents ${stale.length === 1 ? "has" : "have"} ` +
         `not been re-checked for over ${law.reviewEveryDays} days.`,
         "Open 'What the law says' and confirm nothing has moved before you issue anything.");
  }

  return out;
}

// --- Turning the figures into what a template wants -------------------------

function formatNote(t) {
  if (t.status === "in_force") {
    return "This format follows wording that is prescribed today. The source is set out below.";
  }
  return "The statutory format for this document has not been published. What you are " +
         `reading is Blockclerk's working layout, version ${t.version}, dated ${longDate(t.dated)}. ` +
         "It is expected to be replaced once the form is made. The source, and how settled it is, " +
         "are set out below.";
}

function buildingData(b) {
  return {
    name: b.name,
    address: [b.address, b.postcode].filter(Boolean).join(", "),
    postcode: b.postcode,
    units_count: String(b.units_count ?? db.prepare(
      "SELECT COUNT(*) n FROM units WHERE building_id = ? AND archived = 0").get(b.id).n),
    entity_name: b.entity_name,
    entity_address: b.entity_address,
    entity_role: ENTITY_ROLE[b.entity_kind] || b.entity_kind,
    agent_line: b.agent_name ? `Managing agent: ${b.agent_name}` : "",
  };
}

function lineRows(rows, perUnitShare = null, netTotal = 0) {
  return rows.map((l) => {
    const share = perUnitShare === null || !netTotal
      ? null
      : Math.round((l.amount_pence / netTotal) * perUnitShare);
    return {
      category: l.category,
      category_col: pad(l.category, LABEL),
      description: l.description || "",
      description_line: l.description ? `    ${l.description}` : "",
      supplier: l.supplier || "",
      amount: pounds(l.amount_pence),
      amount_col: right(pounds(l.amount_pence)),
      share: share === null ? "" : pounds(share),
      share_col: share === null ? "" : right(pounds(share)),
    };
  });
}

function insuranceData(b) {
  const period = b.policy_start && b.policy_end
    ? `${longDate(b.policy_start)} to ${longDate(b.policy_end)}` : "";
  const block = b.insurer
    ? [`Insurer: ${b.insurer}`,
       b.broker ? `Broker: ${b.broker}` : null,
       b.policy_number ? `Policy number: ${b.policy_number}` : null,
       period ? `Period of cover: ${period}` : null,
       b.sum_insured_pence ? `Sum insured: ${pounds(b.sum_insured_pence)}` : null,
       b.premium_pence ? `Premium for the year: ${pounds(b.premium_pence)}` : null,
      ].filter(Boolean).join("\n")
    : "No insurance details have been entered for this building.";
  return {
    block,
    insurer: b.insurer || "",
    broker_line: b.broker ? pad("Broker", 27) + b.broker : "",
    policy_number: b.policy_number || "",
    period,
    sum_insured: b.sum_insured_pence ? pounds(b.sum_insured_pence) : "",
    premium: b.premium_pence ? pounds(b.premium_pence) : "",
    risks: b.insured_risks || "",
    commission: b.commission_note ||
      "No commission or other payment to the company or its agent has been recorded against this policy.",
  };
}

// The full set of figures a service charge template can ask for. Built once and
// handed to every template; each takes what it needs and ignores the rest.
export function templateData(loaded, template, { unit = null } = {}) {
  const { year, building, units, expenditure, income } = loaded;
  const f = figures(loaded);

  const per = unit ? f.perUnit.find((p) => p.unit.id === unit.id) : null;
  const label = `${longDate(year.period_start)} to ${longDate(year.period_end)}`;

  const data = {
    produced_on: longDate(today()),
    not_advice: law.NOT_ADVICE,
    basis: law.basisBlock(template.basis),
    format_note: formatNote(template),
    meta: {
      template_id: template.id, template_version: template.version,
      template_dated: longDate(template.dated),
    },

    building: buildingData(building),
    year: {
      label,
      start: longDate(year.period_start),
      end: longDate(year.period_end),
      prepared_by_line: year.prepared_by ? ` by ${year.prepared_by}` : "",
      prepared_by_or_dash: year.prepared_by || "the company",
    },

    totals: {
      expenditure: pounds(f.expTotal),
      expenditure_col: right(pounds(f.expTotal)),
      income: pounds(f.incTotal),
      income_col: right(pounds(f.incTotal)),
      income_any: f.incTotal !== 0,
      income_sentence: f.incTotal
        ? ` The building received ${pounds(f.incTotal)} of income, leaving ${pounds(f.net)} to share.`
        : "",
      net: pounds(f.net),
      net_col: right(pounds(f.net)),
      label_col: pad("Total", LABEL),
      income_label_col: pad("Total income", LABEL),
      income_total_col: right(pounds(f.incTotal + year.on_account_pence)),
      income_total_label_col: pad("Total income", LABEL),
    },

    lines: lineRows(expenditure, per ? per.share_pence : null, f.net),
    income_lines: lineRows(income),
    income_lines_any: income.length > 0,

    onaccount: {
      label_col: pad("Service charge demanded on account", LABEL),
      amount_col: right(pounds(year.on_account_pence)),
    },

    result: {
      label_col: pad(f.result >= 0 ? "Surplus carried forward" : "Deficit to recover", LABEL),
      amount_col: right(pounds(Math.abs(f.result))),
      sentence: f.result === 0
        ? "The money collected on account matched what the building spent."
        : f.result > 0
          ? `The building collected ${pounds(f.result)} more on account than it spent.`
          : `The building spent ${pounds(-f.result)} more than it collected on account.`,
    },

    reserve: {
      any: f.reserve.any,
      open_col: right(pounds(f.reserve.open)),
      in_col: right(pounds(f.reserve.in)),
      out_col: right(pounds(f.reserve.out)),
      close_col: right(pounds(f.reserve.close)),
    },

    works: (() => {
      const rows = expenditure.filter((l) => l.qualifying_works);
      return {
        any: rows.length > 0,
        rows: rows.map((l) => ({
          category: l.category,
          amount: pounds(l.amount_pence),
          description: l.description || "",
          consultation: l.consulted
            ? "Leaseholders were consulted."
            : "Not recorded as consulted on.",
        })),
      };
    })(),

    unit_shares: f.perUnit.map((p) => ({
      ref_col: pad(p.unit.ref, 24),
      share_col: right(percent(p.unit.share_percent), 12),
      amount_col: right(pounds(p.share_pence)),
    })),
    shares: {
      label_col: pad("Total", 24),
      percent_col: right(percent(f.sharePercentTotal), 12),
      warning: Math.abs(f.sharePercentTotal - 100) > 0.005
        ? `Note: the shares recorded for this building add up to ${percent(f.sharePercentTotal)}, not 100%.`
        : "",
    },

    insurance: insuranceData(building),

    accountant: {
      line: year.examined_by
        ? `These accounts were reported on by ${year.examined_by}` +
          (year.examined_on ? ` on ${longDate(year.examined_on)}.` : ".")
        : "No accountant has reported on these accounts. A report by an accountant is " +
          "expected to be required once the 2024 Act's accounts provisions are brought in.",
    },

    attachments: [
      "- A summary of your rights and obligations as a leaseholder.",
      "- The service charge accounts for the year.",
      "- The annual report for the building.",
    ].join("\n"),

    rights_summary_text: setting("rights_summary_text") || "",
    rights_summary_entered_on: longDate(setting("rights_summary_entered_on") || ""),
  };

  if (per) {
    const onAccountAny = year.on_account_pence !== 0;
    const bal = per.balance_pence;
    data.unit = {
      ref: per.unit.ref,
      leaseholder: per.unit.leaseholder || "",
      address: per.unit.correspondence || "",
      share: percent(per.unit.share_percent),
    };
    data.demand = {
      headline_label: pad(onAccountAny
        ? (bal >= 0 ? "Balance now due" : "Credit to carry forward")
        : "Your share of the year", LABEL),
      headline: right(pounds(Math.abs(onAccountAny ? bal : per.share_pence))),
      share_col: right(pounds(per.share_pence)),
      on_account_any: onAccountAny,
      on_account_col: right(pounds(per.on_account_pence)),
      balance_label: pad(bal >= 0 ? "Balance now due" : "Credit to carry forward", LABEL),
      balance_col: right(pounds(Math.abs(bal))),
      due_line: setting("payment_terms")
        ? `Payment terms: ${setting("payment_terms")}` : "",
      pay_line: setting("payment_details")
        ? `How to pay: ${setting("payment_details")}` : "",
      outcome_sentence: onAccountAny
        ? (f.result >= 0
            ? `Each flat's account is in credit against what it paid on account.`
            : `A balancing charge is due from each flat.`)
        : "",
    };
  }

  return data;
}

// --- The pack ---------------------------------------------------------------

// One demand per flat, and one of everything else per building.
export const PACK = ["sc.demand", "sc.rights-summary", "sc.accounts",
                     "sc.annual-report", "sc.insurance"];

export function buildPack(yearId, { templateIds = PACK, strict = false } = {}) {
  const loaded = loadYear(yearId);
  if (!loaded) return null;
  const warnings = checks(loaded);
  const docs = [];

  for (const id of templateIds) {
    const template = T.current(id);
    const targets = template.one_per === "unit" ? loaded.units : [null];
    for (const unit of targets) {
      const data = templateData(loaded, template, { unit });
      const { text, missing } = T.render(template, data, { strict });
      docs.push({
        template, unit, text, missing,
        kind: template.kind,
        title: template.one_per === "unit"
          ? `${template.title} — ${unit.ref}` : template.title,
      });
    }
  }

  return { loaded, figures: figures(loaded), warnings, docs };
}

// Freeze a document into the record. The wording, the template version, and
// what the law was understood to say are all stored with it: a document
// produced this year has to still explain itself next year, after the
// templates and the law have both moved on.
export function saveDocument({ buildingId, yearId, unitId, doc, warnings = [] }) {
  const info = db.prepare(`
    INSERT INTO documents (building_id, year_id, unit_id, kind, title, template_id,
                           template_version, template_status, template_dated, basis,
                           body, warnings)
    VALUES (@building_id, @year_id, @unit_id, @kind, @title, @template_id,
            @template_version, @template_status, @template_dated, @basis, @body, @warnings)`)
    .run({
      building_id: buildingId,
      year_id: yearId ?? null,
      unit_id: unitId ?? null,
      kind: doc.kind,
      title: doc.title,
      template_id: doc.template.id,
      template_version: doc.template.version,
      template_status: doc.template.status,
      template_dated: doc.template.dated,
      basis: JSON.stringify(law.basisSnapshot(doc.template.basis)),
      body: doc.text,
      warnings: JSON.stringify(warnings),
    });
  return info.lastInsertRowid;
}
