// npm test
//
// Not a test suite. The half-dozen things that, if they broke quietly, would
// put a wrong number or an overconfident sentence in front of a leaseholder.

import assert from "node:assert/strict";
import { pounds, parseMoney, apportion } from "../lib/money.js";
import * as T from "../lib/templates.js";
import * as law from "../lib/law.js";
import { checkWording, isHedged } from "../lib/guard.js";
import { sentences } from "../lib/prose.js";

let ran = 0, failed = 0;
function test(name, fn) {
  ran++;
  try { fn(); console.log(`  \x1b[32mok\x1b[0m   ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31mFAIL\x1b[0m ${name}\n       ${e.message}`); }
}

console.log("\nMoney\n");

test("pounds and parseMoney round-trip what people actually type", () => {
  assert.equal(parseMoney("£1,234.56"), 123456);
  assert.equal(parseMoney(" 1234 "), 123400);
  assert.equal(parseMoney("abc"), null);
  assert.equal(pounds(123456), "£1,234.56");
  assert.equal(pounds(-5), "-£0.05");
  assert.equal(pounds(0), "£0.00");
});

test("shares always add back up to the total, whatever the rounding", () => {
  for (const [total, shares] of [
    [100000, [33.3333, 33.3333, 33.3333]],
    [10000, Array(7).fill(1)],
    [5057300, [...Array(8).fill(9), ...Array(4).fill(7)]],
    [1, [50, 50]],
    [-12345, [40, 35, 25]],
  ]) {
    const units = shares.map((share_percent) => ({ share_percent }));
    const split = apportion(total, units);
    assert.equal(split.reduce((a, b) => a + b, 0), total,
      `${total} split ${shares.length} ways did not add back up`);
  }
});

console.log("\nThe law registry\n");

test("a rule the app does not have cannot be cited", () => {
  assert.throws(() => law.provision("made.up.rule"), law.UnknownProvisionError);
});

test("nothing unsettled is described as settled", () => {
  for (const p of law.registry.provisions.filter((x) => x.status === "expected")) {
    assert.match(law.statusLabel(p), /not settled/i, `${p.id} was labelled as settled`);
    assert.ok(isHedged(p.statement),
      `${p.id}: an unsettled rule must be hedged in its own words, not only by its label`);
  }
});

test("every provision carries a source and the date it was checked", () => {
  for (const p of law.registry.provisions) {
    assert.ok(p.source, `${p.id} has no source`);
    assert.match(p.checked_on || "", /^\d{4}-\d{2}-\d{2}$/, `${p.id} has no checked_on date`);
  }
});

console.log("\nThe template layer\n");

test("every template rests on provisions that exist", () => {
  for (const t of T.all) t.basis.forEach(law.provision);
});

test("a template that says it is in force does not rest on unsettled law", () => {
  for (const t of T.all.filter((x) => x.status === "in_force")) {
    for (const id of t.basis) {
      assert.equal(law.provision(id).status, "in_force",
        `${t.file} claims to be in force but rests on ${id}`);
    }
  }
});

test("an unfilled slot stops the document rather than producing a gap", () => {
  const t = T.current("sc.insurance");
  assert.throws(() => T.render(t, {}), T.MissingSlotError);
  const loose = T.render(t, {}, { strict: false });
  assert.ok(loose.missing.length > 0, "a draft render must still say what is missing");
});

test("repeated rows do not come out double-spaced", () => {
  const t = { id: "x", body: "{{#each rows}}\n{{ this.a }}\n{{/each}}\n" };
  const { text } = T.render(t, { rows: [{ a: "one" }, { a: "two" }] });
  assert.equal(text, "one\ntwo\n");
});

test("a bare {{ this }} works on a list of plain strings", () => {
  const t = { id: "x", body: "{{#each rows}}\n- {{ this }}\n{{/each}}\n" };
  const { text } = T.render(t, { rows: ["first", "second"] });
  assert.equal(text, "- first\n- second\n");
});

test("prose is wrapped, columns are left alone", () => {
  const long = "Label" + " ".repeat(20) + "£1,234.56";
  assert.equal(T.wrap(long, 20), long);
  assert.ok(T.wrap("a ".repeat(60), 40).split("\n").length > 1);
});

console.log("\nThe wording gate\n");

test("advice is caught", () => {
  assert.ok(checkWording("You must register before the deadline.").length);
  assert.ok(checkWording("We recommend consolidating the reserve.").length);
  assert.ok(checkWording("This makes you compliant.").length);
});

test("stating unsettled law flatly is caught", () => {
  assert.ok(checkWording("The regulations require a standardised form.")
    .some((h) => h.kind === "certainty"));
  assert.equal(checkWording("The regulations are expected to require a standardised form.")
    .filter((h) => h.kind === "certainty").length, 0);
});

test("headings and columns are not mistaken for sentences", () => {
  const doc = "SERVICE CHARGE DEMAND\n\nInsurer                    Aviva\n\nThis is a sentence.";
  assert.deepEqual(sentences(doc), ["This is a sentence."]);
});

test("every template passes the gate it is held to", () => {
  for (const t of T.all) {
    const settled = t.basis.every((id) => law.provision(id).status === "in_force");
    const hits = checkWording(t.body, { settled });
    assert.equal(hits.length, 0,
      `${t.file}: ${hits.map((h) => h.kind + ' "' + h.phrase + '"').join("; ")}`);
  }
});

console.log(failed
  ? `\n\x1b[31m${failed} of ${ran} failed.\x1b[0m\n`
  : `\n\x1b[32mAll ${ran} passed.\x1b[0m\n`);
process.exit(failed ? 1 : 0);
