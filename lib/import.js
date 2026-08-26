import { parse } from "csv-parse/sync";
import { db, today } from "../db.js";

// LinkedIn's own export (Settings > Data privacy > Get a copy of your data >
// Connections) ships Connections.csv with three lines of preamble before the
// real header. Strip anything above the line that starts with "First Name".
function stripPreamble(text) {
  const lines = text.split(/\r?\n/);
  const i = lines.findIndex((l) => /^"?First Name"?,/i.test(l));
  return i > 0 ? lines.slice(i).join("\n") : text;
}

// "26 Aug 2026" -> "2026-08-26"
const MONTHS = { jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",
                 jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12" };
function parseDate(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})$/);
  if (m) return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`;
  const iso = String(s).trim().match(/^\d{4}-\d{2}-\d{2}$/);
  return iso ? iso[0] : null;
}

const pick = (row, ...names) => {
  for (const n of names) {
    const key = Object.keys(row).find((k) => k.trim().toLowerCase() === n.toLowerCase());
    if (key && row[key]?.trim()) return row[key].trim();
  }
  return null;
};

export function importConnections(csvText) {
  const rows = parse(stripPreamble(csvText), {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
  });

  const existing = new Set(
    db.prepare("SELECT linkedin_url FROM contacts WHERE linkedin_url IS NOT NULL")
      .all().map((r) => r.linkedin_url)
  );
  const existingNames = new Set(
    db.prepare("SELECT lower(name) AS n FROM contacts").all().map((r) => r.n)
  );

  const insert = db.prepare(`
    INSERT INTO contacts (name, first_name, headline, company, linkedin_url, email,
                          source, stage, connected_on)
    VALUES (@name, @first_name, @headline, @company, @linkedin_url, @email,
            'linkedin_export', 'new_connection', @connected_on)
  `);

  let added = 0, skipped = 0;
  const run = db.transaction(() => {
    for (const row of rows) {
      const first = pick(row, "First Name");
      const last = pick(row, "Last Name");
      const name = [first, last].filter(Boolean).join(" ");
      if (!name) { skipped++; continue; }

      const url = pick(row, "URL", "Profile URL");
      if ((url && existing.has(url)) || existingNames.has(name.toLowerCase())) {
        skipped++; continue;
      }

      insert.run({
        name,
        first_name: first,
        headline: pick(row, "Position", "Headline", "Title"),
        company: pick(row, "Company", "Organisation"),
        linkedin_url: url,
        email: pick(row, "Email Address", "Email"),
        connected_on: parseDate(pick(row, "Connected On")) || today(),
      });
      if (url) existing.add(url);
      existingNames.add(name.toLowerCase());
      added++;
    }
  });
  run();

  return { added, skipped, total: rows.length };
}
