// Plain English.
//
// The reader is a retired volunteer who has been made a company director by
// their neighbours, not a solicitor. Legalese in a template is a defect, and
// `npm run check` reports it.
//
// This is a nudge, not a grammar checker: it catches the handful of habits
// that make a document unreadable, and stays quiet otherwise.

import { sentences, wordCount } from "./prose.js";

const WORDS = [
  [/\bhereinafter\b/i, "cut it"],
  [/\baforesaid\b|\baforementioned\b/i, "say which one"],
  [/\bhereto\b|\bherein\b|\bhereof\b|\bthereof\b|\bthereto\b/i, "cut it"],
  [/\bpursuant to\b/i, "under"],
  [/\bnotwithstanding\b/i, "despite, or even if"],
  [/\bin respect of\b/i, "for, or about"],
  [/\bin the event that\b/i, "if"],
  [/\bprior to\b/i, "before"],
  [/\bsubsequent to\b/i, "after"],
  [/\bcommence[sd]?\b|\bcommencing\b/i, "start"],
  [/\bterminate[sd]?\b/i, "end"],
  [/\butilise[sd]?\b/i, "use"],
  [/\bendeavour\b/i, "try"],
  [/\bthe lessee\b/i, "you, or the leaseholder"],
  [/\bthe lessor\b/i, "the landlord"],
  [/\bquantum\b/i, "amount"],
  [/\binter alia\b/i, "among other things"],
  [/\bmutatis mutandis\b/i, "cut it"],
  [/\bsaid (sum|amount|premises|property)\b/i, "the"],
];

const LONG_SENTENCE = 35;

export function checkPlainEnglish(text) {
  const notes = [];
  if (!text) return notes;

  for (const [re, better] of WORDS) {
    const m = text.match(re);
    if (m) notes.push({ kind: "jargon", phrase: m[0].trim(), why: `Try: ${better}` });
  }

  for (const sentence of sentences(text)) {
    const words = wordCount(sentence);
    if (words > LONG_SENTENCE) {
      notes.push({
        kind: "long-sentence",
        phrase: sentence.split(/\s+/).slice(0, 12).join(" ") + "...",
        why: `${words} words. Split it — anything over ${LONG_SENTENCE} loses the reader.`,
      });
    }
  }

  return notes;
}
