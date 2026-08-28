// The statutory document formats.
//
// Not one word of a statutory document is written in the code. Every format
// is a file in templates/, carrying its own version, the date its wording was
// last reviewed, whether it is settled law or an expectation, and the
// provisions it rests on. When a statutory instrument is finally made, the job
// is to drop in a new file and mark the old one superseded - not to go hunting
// through JavaScript for the paragraph that changed.
//
// File format is a JSON header between "---" lines, then the body:
//
//   ---
//   { "id": "sc.demand", "version": "0.1.0", ... }
//   ---
//   Dear {{ unit.leaseholder }},
//
// Slots:
//   {{ a.b }}          required - if it is empty the document does not render
//   {{? a.b }}         optional - renders as nothing when empty
//   {{#each rows}}...{{/each}}      repeat, with {{ this.field }} inside
//   {{#if a.b}}...{{/if}}          include only when truthy
//   {{#unless a.b}}...{{/unless}}

import fs from "node:fs";
import path from "node:path";
import { here } from "../db.js";
import { provision } from "./law.js";

const root = path.join(here, "templates");

export class TemplateError extends Error {}
export class MissingSlotError extends TemplateError {
  constructor(templateId, missing) {
    super(`Template "${templateId}" was not given: ${missing.join(", ")}`);
    this.missing = missing;
  }
}

// --- Loading ----------------------------------------------------------------

function parseFile(file) {
  const text = fs.readFileSync(file, "utf8");
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new TemplateError(`${file}: no "---" JSON header`);
  let meta;
  try { meta = JSON.parse(m[1]); }
  catch (e) { throw new TemplateError(`${file}: header is not valid JSON - ${e.message}`); }

  for (const key of ["id", "title", "kind", "version", "dated", "status"]) {
    if (!meta[key]) throw new TemplateError(`${file}: header is missing "${key}"`);
  }
  if (!["in_force", "expected"].includes(meta.status)) {
    throw new TemplateError(`${file}: status must be "in_force" or "expected"`);
  }
  // Every template must say what it rests on, and every provision it names
  // must exist. This is what stops a format drifting loose from its source.
  if (!Array.isArray(meta.basis) || meta.basis.length === 0) {
    throw new TemplateError(`${file}: header needs "basis": the provisions this format rests on`);
  }
  meta.basis.forEach(provision);

  return { ...meta, file: path.relative(root, file), body: m[2], active: meta.active !== false };
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

// Templates are read once at startup. They are a deployed artefact, not
// something that changes while the app is running.
export const all = walk(root).map(parseFile);

function compareVersions(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

// The one to use now: newest reviewed wording that has not been superseded.
export function current(id) {
  const versions = all.filter((t) => t.id === id && t.active && !t.superseded_by);
  if (!versions.length) throw new TemplateError(`No active template "${id}"`);
  versions.sort((a, b) =>
    (a.dated < b.dated ? -1 : a.dated > b.dated ? 1 : 0) || compareVersions(a.version, b.version));
  return versions[versions.length - 1];
}

export function version(id, v) {
  const t = all.find((x) => x.id === id && x.version === v);
  if (!t) throw new TemplateError(`No template "${id}" version ${v}`);
  return t;
}

export const history = (id) =>
  all.filter((t) => t.id === id)
     .sort((a, b) => (a.dated < b.dated ? 1 : -1) || compareVersions(b.version, a.version));

export const ids = () => [...new Set(all.map((t) => t.id))].sort();

// --- Rendering --------------------------------------------------------------

const TAG = /\{\{\s*(#each|#if|#unless|\/each|\/if|\/unless|\?)?\s*([\w.$-]*)\s*\}\}/g;

// A block tag sitting alone on its line is a layout instruction, not content.
// Left as-is it contributes its own newline and every repeated row comes out
// double-spaced, so the line break belongs to the tag and goes with it.
const STANDALONE = /^[ \t]*(\{\{[#/][^}]*\}\})[ \t]*\r?\n/gm;

function parse(body, templateId) {
  body = body.replace(STANDALONE, "$1");
  const nodes = [];
  const stack = [{ children: nodes }];
  let last = 0;
  let m;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(body))) {
    const top = stack[stack.length - 1];
    if (m.index > last) top.children.push({ t: "text", v: body.slice(last, m.index) });
    last = m.index + m[0].length;
    const [, kind, name] = m;

    if (kind === "#each" || kind === "#if" || kind === "#unless") {
      const node = { t: kind.slice(1), path: name, children: [] };
      top.children.push(node);
      stack.push(node);
    } else if (kind === "/each" || kind === "/if" || kind === "/unless") {
      const expect = kind.slice(1);
      if (stack.length === 1 || stack[stack.length - 1].t !== expect) {
        throw new TemplateError(`${templateId}: {{${kind}}} without a matching opening tag`);
      }
      stack.pop();
    } else {
      top.children.push({ t: "slot", path: name, optional: kind === "?" });
    }
  }
  if (stack.length !== 1) {
    throw new TemplateError(`${templateId}: {{#${stack[stack.length - 1].t}}} was never closed`);
  }
  if (last < body.length) nodes.push({ t: "text", v: body.slice(last) });
  return nodes;
}

function lookup(pathStr, scopes) {
  const parts = pathStr.split(".");
  const [head, ...rest] = parts[0] === "this" ? parts.slice(1) : parts;
  // A bare {{ this }} is the current item, which is very often a plain string
  // - a list of reasons, a list of gaps - so it is answered before any
  // property lookup, which only objects can satisfy.
  if (head === undefined) return scopes[scopes.length - 1];
  for (let i = scopes.length - 1; i >= 0; i--) {
    const scope = scopes[i];
    if (scope == null || typeof scope !== "object") continue;
    if (!(head in scope)) continue;
    let v = scope[head];
    for (const k of rest) {
      if (v == null) return undefined;
      v = v[k];
    }
    return v;
  }
  return undefined;
}

const isEmpty = (v) =>
  v === undefined || v === null || v === "" ||
  (Array.isArray(v) && v.length === 0);

function run(nodes, scopes, missing) {
  let out = "";
  for (const n of nodes) {
    if (n.t === "text") { out += n.v; continue; }

    const v = lookup(n.path, scopes);

    if (n.t === "slot") {
      if (isEmpty(v)) {
        if (!n.optional) missing.push(n.path);
        continue;
      }
      out += String(v);
    } else if (n.t === "each") {
      if (!Array.isArray(v)) { if (!isEmpty(v)) missing.push(n.path); continue; }
      for (const item of v) out += run(n.children, [...scopes, item], missing);
    } else if (n.t === "if") {
      if (!isEmpty(v) && v !== false) out += run(n.children, scopes, missing);
    } else if (n.t === "unless") {
      if (isEmpty(v) || v === false) out += run(n.children, scopes, missing);
    }
  }
  return out;
}

// Render a template.
//
// A half-filled statutory document is worse than no document: it looks
// finished and it is wrong. So an unfilled required slot is an error by
// default, and the caller has to ask for the draft explicitly.
export function render(template, data, { strict = true, width = 72 } = {}) {
  const nodes = parse(template.body, template.id);
  const missing = [];
  const text = run(nodes, [data], missing);
  const unique = [...new Set(missing)];
  if (strict && unique.length) throw new MissingSlotError(template.id, unique);
  const tidy = wrap(text.replace(/\n{3,}/g, "\n\n"), width).trim() + "\n";
  return { text: tidy, missing: unique };
}

const COLUMNS = /\S {3,}\S/;

// These are plain text documents that get printed and posted, so a line that
// runs past the paper is a line somebody loses. Prose is wrapped; anything
// laid out in columns is left exactly as the template set it.
export function wrap(text, width = 72) {
  const out = [];
  for (const line of text.split("\n")) {
    if (line.length <= width || COLUMNS.test(line)) { out.push(line); continue; }
    const indent = line.match(/^\s*/)[0];
    const bullet = /^\s*[-*]\s/.test(line);
    const hang = indent + (bullet ? "  " : "");
    let current = indent;
    let first = true;
    for (const word of line.trim().split(/\s+/)) {
      const candidate = current === indent || (first && current === hang)
        ? current + word
        : current + " " + word;
      if (candidate.length > width && current.trim()) {
        out.push(current);
        current = hang + word;
      } else {
        current = candidate;
      }
      first = false;
    }
    if (current.trim()) out.push(current);
  }
  return out.join("\n");
}

// What a template needs before it will produce anything. Used to build the
// "you still need to tell us" list, so the user is never surprised at the end.
export function requiredSlots(template) {
  const found = [];
  const walkNodes = (nodes) => {
    for (const n of nodes) {
      if (n.t === "slot" && !n.optional) found.push(n.path);
      if (n.children) walkNodes(n.children);
    }
  };
  walkNodes(parse(template.body, template.id));
  return [...new Set(found)];
}
