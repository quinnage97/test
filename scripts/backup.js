// Writes a timestamped copy of the database. The message history is a
// compliance record - losing it is not an option.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dataDir = process.env.DATA_DIR || "./data";
const outDir = path.join(dataDir, "backups");
fs.mkdirSync(outDir, { recursive: true });

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const dest = path.join(outDir, `followup-${stamp}.db`);

const db = new Database(path.join(dataDir, "followup.db"), { readonly: true });
await db.backup(dest);
db.close();

// Keep the last 30, drop the rest.
const old = fs.readdirSync(outDir).filter((f) => f.endsWith(".db")).sort().slice(0, -30);
for (const f of old) fs.unlinkSync(path.join(outDir, f));

console.log(`Backed up to ${dest} (${fs.readdirSync(outDir).length} kept)`);
