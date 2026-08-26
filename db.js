import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(here, "data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, "followup.db"));
db.pragma("journal_mode = WAL");
db.exec(fs.readFileSync(path.join(here, "schema.sql"), "utf8"));

export function setting(key, fallback = null) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, String(value));
}

export const today = () => new Date().toISOString().slice(0, 10);

export function daysSince(isoDate) {
  if (!isoDate) return null;
  const ms = Date.now() - new Date(isoDate + "T00:00:00Z").getTime();
  return Math.floor(ms / 86400000);
}

export function daysUntil(isoDate) {
  if (!isoDate) return null;
  return -daysSince(isoDate);
}

export function addDays(n, from = today()) {
  const d = new Date(from + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
