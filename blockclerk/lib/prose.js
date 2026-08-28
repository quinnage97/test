// Pulling the actual prose out of a document.
//
// The wording checks care about sentences a person reads. A statutory document
// is mostly not that: it is headings, rules across the page, and columns of
// figures. Feeding those to a sentence checker produces noise, and a checker
// that cries wolf gets switched off. So strip the layout first.

const SEPARATOR = /^[-=_*\s]+$/;
const CONTROL_ONLY = /^\s*\{\{[#/][^}]*\}\}\s*$/;
const COLUMN = /\S {3,}\S/;                 // "Insurer          Aviva" - a column, not a sentence
const HEADING = /^[^a-z]*$/;                // no lower-case letters anywhere

export function proseLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => {
      const l = line.trim();
      if (!l) return false;
      if (SEPARATOR.test(l)) return false;
      if (CONTROL_ONLY.test(l)) return false;
      if (COLUMN.test(line)) return false;
      if (HEADING.test(l.replace(/\{\{[^}]*\}\}/g, ""))) return false;
      return true;
    });
}

// Consecutive prose lines belong to the same paragraph; a stripped line breaks
// it, so a heading never glues two paragraphs into one 138-word sentence.
export function paragraphs(text) {
  const lines = String(text || "").split(/\r?\n/);
  const keep = new Set(proseLines(text));
  const out = [];
  let current = [];
  for (const line of lines) {
    if (keep.has(line)) current.push(line.trim());
    else if (current.length) { out.push(current.join(" ")); current = []; }
  }
  if (current.length) out.push(current.join(" "));
  return out;
}

export function sentences(text) {
  const out = [];
  for (const para of paragraphs(text)) {
    for (const s of para.split(/(?<=[.!?])\s+(?=[A-Z(£"'“-])/)) {
      const t = s.trim();
      if (t) out.push(t);
    }
  }
  return out;
}

// Slots are one word to the reader, and bullet markers are none.
export const wordCount = (sentence) =>
  sentence
    .replace(/\{\{[^}]*\}\}/g, "X")
    .replace(/^[-*•]\s*/, "")
    .split(/\s+/)
    .filter(Boolean).length;
