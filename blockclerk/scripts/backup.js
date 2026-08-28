// npm run backup
//
// A timestamped copy of the database. The issue record is the thing you will
// be asked for and cannot reconstruct, so it is worth a cron entry.

import fs from "node:fs";
import path from "node:path";
import { here } from "../db.js";

const dataDir = process.env.DATA_DIR || path.join(here, "data");
const backups = path.join(dataDir, "backups");
fs.mkdirSync(backups, { recursive: true });

const source = path.join(dataDir, "blockclerk.db");
if (!fs.existsSync(source)) {
  console.log("No database yet, so nothing to back up.");
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const target = path.join(backups, `blockclerk-${stamp}.db`);
fs.copyFileSync(source, target);
console.log(`Backed up to ${target}`);

// Keep the last 30 and no more, so this can run daily and be forgotten about.
const kept = fs.readdirSync(backups).filter((f) => f.endsWith(".db")).sort();
for (const old of kept.slice(0, Math.max(0, kept.length - 30))) {
  fs.unlinkSync(path.join(backups, old));
}
