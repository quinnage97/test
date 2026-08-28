// The wording gate.
//
// Two of this product's hard rules are rules about language:
//
//   1. Nothing here is legal advice. It is a document made from figures the
//      user supplied.
//   2. Nothing unsettled is stated as settled. The statutory instruments
//      behind the service charge reforms have not been made, so the app says
//      "expected", and says where it got it from.
//
// Rules you cannot check are rules that quietly stop being true. So both are
// checked: over every template body by `npm run check`, which fails the build,
// and over the free text a user types, which is shown back to them as a
// warning before anything is issued.

import { sentences } from "./prose.js";

const ADVICE = [
  { re: /\byou (must|need to|have to)\b/i,
    why: "Tells the reader what to do. This is a document, not advice — say what the position is and where it comes from." },
  { re: /\byou should\b/i,
    why: "Advice. Say what the rule is and cite it, and let the reader decide." },
  { re: /\bwe (advise|recommend|suggest)\b/i,
    why: "Advice in so many words." },
  { re: /\b(legal|our) (advice|opinion)\b/i,
    why: "Nothing this app produces is advice or an opinion." },
  { re: /\byou are (legally )?(required|obliged|liable)\b/i,
    why: "A statement about the reader's legal position. Cite the provision instead." },
  { re: /\bfailure to (do so|comply) (will|means)\b/i,
    why: "States a legal consequence as certain." },
  { re: /\b(this|it) (makes|keeps) you compliant\b|\bfully compliant\b|\bensures? (you )?compl/i,
    why: "No document makes anyone compliant. Do not claim it." },
  { re: /\bguarantee[sd]?\b/i,
    why: "Promises an outcome that cannot be promised." },
];

// Words that hedge a statement about law that is not settled. One definition,
// used both by the gate below and by the test that holds the law registry to
// the same standard as the templates.
const HEDGE = /\b(expect|expected|expects|likely|often|usually|typically|generally|anticipat\w*|proposed|draft|not (yet )?settled|not (yet )?(been )?(made|published|confirmed)|may |might |could |once |when |check|confirm|subject to)\b/i;

export const isHedged = (text) => HEDGE.test(String(text || ""));

// Subjects that are not settled, and so may never be stated flatly.
const UNSETTLED = /\b(regulations?|statutory instruments?|prescribed form|standardised form|the Act requires|comes into force|came into force|commencement|deadline|registration deadline|authorisation conditions?)\b/i;

// A flat assertion about one of those subjects.
const ASSERTS = /\b(is|are|will be|must|shall|requires?|sets out|specifies|says|states|begins|starts|applies)\b/i;

// `settled` says the text rests only on law that is in force. Such a document
// is allowed to state its subject flatly, because there is nothing unsettled in
// it to overstate. Everything else - and all user-typed text, always - has to
// hedge and cite.
export function checkWording(text, { subject = "text", settled = false } = {}) {
  const hits = [];
  if (!text) return hits;

  for (const rule of ADVICE) {
    const m = text.match(rule.re);
    if (m) hits.push({ kind: "advice", phrase: m[0].trim(), why: rule.why });
  }

  for (const sentence of settled ? [] : sentences(text)) {
    if (!UNSETTLED.test(sentence)) continue;
    if (!ASSERTS.test(sentence)) continue;
    if (HEDGE.test(sentence)) continue;
    hits.push({
      kind: "certainty",
      phrase: sentence.length > 120 ? sentence.slice(0, 117) + "..." : sentence,
      why: "States something about the regulations as settled. They are not. " +
           "Say 'expected' and cite where it comes from.",
    });
  }

  return hits.map((h) => ({ ...h, subject }));
}

// Slots whose contents come from the user rather than from the template, and
// so have to be checked at the moment a document is produced.
export function checkUserText(fields) {
  const hits = [];
  for (const [label, value] of Object.entries(fields)) {
    if (typeof value === "string") hits.push(...checkWording(value, { subject: label }));
  }
  return hits;
}
