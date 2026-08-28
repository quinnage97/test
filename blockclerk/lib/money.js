// Money is whole pence, everywhere. A service charge that is a penny out is a
// service charge somebody writes a letter about.

export function pounds(pence) {
  if (pence === null || pence === undefined || Number.isNaN(pence)) return "";
  const neg = pence < 0;
  const s = Math.abs(Math.round(pence)).toString().padStart(3, "0");
  const whole = s.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}£${whole}.${s.slice(-2)}`;
}

// Accepts what people actually type: "1,234.56", "£1234.5", "1234", " 12.00 ".
export function parseMoney(input) {
  if (input === null || input === undefined) return 0;
  const s = String(input).replace(/[£,\s]/g, "");
  if (s === "" || s === "-") return 0;
  if (!/^-?\d*(\.\d{0,2})?$/.test(s)) return null;      // null = "that isn't money"
  return Math.round(Number(s) * 100);
}

export const sum = (rows, field = "amount_pence") =>
  rows.reduce((t, r) => t + (r[field] || 0), 0);

// Split a total between units by their shares.
//
// Done by largest remainder, so the shares add back up to the total exactly.
// Rounding each share on its own leaves the building a few pence out, and the
// one leaseholder who adds up the column will find it.
export function apportion(totalPence, units) {
  const shares = units.map((u) => Number(u.share_percent) || 0);
  const totalShare = shares.reduce((a, b) => a + b, 0);
  if (totalShare <= 0) return units.map(() => 0);

  const exact = shares.map((s) => (totalPence * s) / totalShare);
  const floors = exact.map((v) => Math.floor(v));
  let left = Math.round(totalPence - floors.reduce((a, b) => a + b, 0));

  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const out = floors.slice();
  for (let n = 0; n < order.length && left > 0; n++, left--) out[order[n].i] += 1;
  // A negative remainder (possible with negative totals) comes off the other end.
  for (let n = order.length - 1; n >= 0 && left < 0; n--, left++) out[order[n].i] -= 1;
  return out;
}

export const percent = (n) => `${(Number(n) || 0).toFixed(4).replace(/\.?0+$/, "")}%`;
