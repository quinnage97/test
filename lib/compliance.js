// An appointed representative's messages are financial promotions. The network
// is on the hook for them, so this is a hard gate, not a suggestion.
//
// This does NOT make anything compliant on its own - the templates being signed
// off by the network is what does that. This just catches the wording that
// most often gets an AR pulled up: promises, pressure, and advice given cold.

const RULES = [
  { re: /\b(guarantee|guaranteed|guarantees)\b/i,
    why: "Promises an outcome you can't promise" },
  { re: /\b(best|cheapest|lowest|top)\s+(rate|deal|price|mortgage|pension)/i,
    why: "A 'best rate' claim needs evidence for the whole market" },
  { re: /\bno[- ]?risk\b|\brisk[- ]?free\b/i,
    why: "Nothing with an investment element is risk-free" },
  { re: /\byou should (move|switch|transfer|remortgage|consolidate)\b/i,
    why: "That's personal advice - it can't be given before a fact-find" },
  { re: /\bconsolidat(e|ing) (your )?pensions?\b/i,
    why: "Pension consolidation is high-risk advice, never a cold-message topic" },
  { re: /\b(act|hurry|apply) (now|today|fast)\b|\blimited time\b|\bdon'?t miss out\b/i,
    why: "Pressure selling" },
  { re: /\bsave you \S*\s?£?[\d,]+/i,
    why: "A specific saving figure is a claim you'd have to evidence" },
  { re: /\bfree\b(?!.{0,30}\b(no obligation|chat|conversation|call)\b)/i,
    why: "'Free' needs care - say what is actually free" },
  { re: /\b(FCA|regulated) (approved|endorsed)\b/i,
    why: "The FCA does not approve or endorse products" },
];

export function checkCompliance(text) {
  const hits = [];
  for (const r of RULES) {
    const m = text.match(r.re);
    if (m) hits.push({ phrase: m[0].trim(), why: r.why });
  }
  return hits;
}

// Wording the network will want on anything that could be read as a promotion.
export function footerFor(templateKey, settings) {
  const promotional = ["rate_expiry", "review_due", "dormant", "client_checkin"];
  if (!promotional.includes(templateKey)) return "";
  return settings.disclosure || "";
}
