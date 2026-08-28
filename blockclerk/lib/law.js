// What the law says, and how settled it is.
//
// The hard rule this file exists to enforce: the app never states a statutory
// format or date as settled. It cannot, because there is no way to put a legal
// statement on a page except by citing an id from law/provisions.json, and
// every citation carries its status, its source, and the date it was checked.
//
// If you want the app to say something new about the law, add a row to that
// file. If you cannot honestly fill in the status and the source, the app
// should not be saying it.

import fs from "node:fs";
import path from "node:path";
import { here, daysSince, longDate } from "../db.js";

const file = path.join(here, "law", "provisions.json");
const raw = JSON.parse(fs.readFileSync(file, "utf8"));

export const registry = raw;

const byId = new Map(raw.provisions.map((p) => [p.id, Object.freeze(p)]));

export class UnknownProvisionError extends Error {}

// Look one up. Throws rather than returning undefined: a missing citation is a
// bug that must not reach a document quietly.
export function provision(id) {
  const p = byId.get(id);
  if (!p) {
    throw new UnknownProvisionError(
      `No provision "${id}" in law/provisions.json. ` +
      `The app is not allowed to state a rule that is not listed there.`);
  }
  return p;
}

export const provisions = (ids = []) => ids.map(provision);

export function byTopic(topic) {
  return raw.provisions.filter((p) => p.topic === topic);
}

// A provision is stale when nobody has checked it for a while. Everything
// marked "expected" is waiting on a statutory instrument that could be made
// any week, so going quiet on it is the failure mode that matters.
export const reviewEveryDays = raw.review_every_days ?? 90;

export function ageDays(p) {
  return daysSince(p.checked_on || raw.checked_on) ?? 0;
}

export function isStale(p) {
  return ageDays(p) > reviewEveryDays;
}

export const staleProvisions = () => raw.provisions.filter(isStale);

// How a provision is described wherever it appears. One place, so the wording
// of the hedge cannot drift between pages.
export function statusLabel(p) {
  if (p.status === "in_force") return "In force";
  if (p.status === "expected") return "Expected — not settled";
  return "Not confirmed";
}

export function statusNote(p) {
  if (p.status === "in_force") {
    return p.confidence === "high"
      ? "This applies now."
      : "Believed to apply now. Confirm against the source before relying on it.";
  }
  return "This has not been settled. The wording, the format and the dates can all still change. " +
         "Confirm against the source before relying on it.";
}

// One line of provenance, for the foot of a generated document.
export function citationLine(p) {
  const bits = [`${statusLabel(p)}.`, p.source];
  if (p.url) bits.push(p.url);
  bits.push(`Checked ${longDate(p.checked_on || raw.checked_on)}.`);
  if (isStale(p)) bits.push("NOT RE-CHECKED SINCE — verify before use.");
  return bits.join(" ");
}

// The block of provenance that goes at the foot of every generated document.
// A document is only defensible if it can still explain itself next year.
export function basisBlock(ids) {
  const list = provisions(ids);
  const lines = list.map((p) => `- ${p.statement}\n  ${citationLine(p)}`);
  return lines.join("\n");
}

// Frozen into each document row, so a document produced today still shows what
// was believed today even after this file is updated.
export function basisSnapshot(ids) {
  return provisions(ids).map((p) => ({
    id: p.id, statement: p.statement, status: p.status, confidence: p.confidence,
    source: p.source, url: p.url, checked_on: p.checked_on || raw.checked_on,
  }));
}

// A date that comes from the law, rather than from the user's own diary.
// Returns null when the provision does not carry one, which is the normal case
// and must not be papered over with a guess.
export function provisionDate(id) {
  const p = provision(id);
  return p.date || null;
}

// The standing note that goes on everything this app produces. It is not
// decoration: the product's first hard rule is that nothing here is advice.
export const NOT_ADVICE =
  "This document was produced from figures and details you entered. " +
  "It is not legal advice and it is not a legal opinion. " +
  "Blockclerk does not check whether your lease allows a charge, whether a cost is reasonable, " +
  "or whether you have met an obligation. If something turns on those questions, take advice.";
