// npm run check
//
// The three product rules that are rules about words, checked mechanically:
//
//   - no template states unsettled law as settled, and none gives advice
//   - no template rests on a provision that isn't in the registry (the loader
//     enforces that just by loading)
//   - no template is written in legalese
//
// Plus: which provisions are overdue a re-check. Run this before every release,
// and before any run of documents that goes out to real leaseholders.

import * as T from "../lib/templates.js";
import * as law from "../lib/law.js";
import { checkWording } from "../lib/guard.js";
import { checkPlainEnglish } from "../lib/plain.js";
import { longDate } from "../db.js";

let failures = 0;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const amber = (s) => `\x1b[33m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;

console.log(`\nTemplates (${T.all.length})\n`);

for (const t of T.all.sort((a, b) => a.id.localeCompare(b.id))) {
  // A template resting only on law that is in force may state its subject
  // flatly. One resting on anything unsettled may not.
  const settled = t.basis.every((id) => law.provision(id).status === "in_force");
  const wording = checkWording(t.body, { subject: t.file, settled });
  const plain = checkPlainEnglish(t.body);
  const state = wording.length ? red("FAIL") : plain.length ? amber("look") : green("ok");
  console.log(`  ${state}  ${t.id} v${t.version} [${t.status}] ${t.file}`);

  for (const h of wording) {
    failures++;
    console.log(`        ${red("x")} ${h.kind}: "${h.phrase}"`);
    console.log(`          ${h.why}`);
  }
  for (const n of plain) {
    console.log(`        ${amber("~")} ${n.kind}: "${n.phrase}" — ${n.why}`);
  }
}

console.log(`\nThe law (${law.registry.provisions.length} provisions)\n`);

const stale = law.staleProvisions();
for (const p of law.registry.provisions) {
  const age = law.ageDays(p);
  const mark = law.isStale(p) ? amber("stale") : green("  ok ");
  console.log(`  ${mark}  ${p.id.padEnd(28)} ${law.statusLabel(p).padEnd(22)} ` +
              `checked ${longDate(p.checked_on)} (${age}d)`);
}

const expected = law.registry.provisions.filter((p) => p.status === "expected");
const unconfirmed = law.registry.provisions.filter((p) => p.confidence === "check");

console.log(`\n  ${expected.length} of ${law.registry.provisions.length} provisions are not settled.`);
console.log(`  ${unconfirmed.length} are marked as needing confirmation against the source.`);
if (stale.length) {
  console.log(amber(`  ${stale.length} have not been re-checked for over ${law.reviewEveryDays} days.`));
}

// Templates that rest on something unsettled must say so themselves.
const mislabelled = T.all.filter((t) =>
  t.status === "in_force" && t.basis.some((id) => law.provision(id).status === "expected"));
for (const t of mislabelled) {
  failures++;
  console.log(red(`\n  FAIL ${t.file}: marked "in_force" but rests on a provision that is not settled.`));
}

console.log(failures
  ? red(`\n${failures} problem${failures === 1 ? "" : "s"}. Fix before issuing anything.\n`)
  : green("\nNothing to fix.\n"));

process.exit(failures ? 1 : 0);
