import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import multer from "multer";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { db, setting, setSetting, today, addDays } from "./db.js";
import { dailyList, connectionQueue } from "./lib/rules.js";
import { draftMessage, draftInvite, draftPosts } from "./lib/ai.js";
import { importConnections } from "./lib/import.js";
import { layout, esc, todayPage, connectPage, postsPage } from "./views/render.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(here, "public")));

// --- Login ------------------------------------------------------------------
// One password, one user, one long-lived cookie. He logs in once on his iPad and
// never sees this again. It exists because the database holds client data.
const PASSWORD = process.env.APP_PASSWORD;
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const sign = (v) => v + "." + crypto.createHmac("sha256", SECRET).update(v).digest("hex");
const valid = (c) => {
  if (!c) return false;
  const i = c.lastIndexOf(".");
  if (i < 0) return false;
  const expected = sign(c.slice(0, i));
  return expected.length === c.length &&
         crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(c));
};

app.use((req, res, next) => {
  if (!PASSWORD) return next();                       // no password set = local use
  if (req.path === "/login" || req.path === "/app.css") return next();
  if (valid(req.cookies.auth)) return next();
  res.redirect("/login");
});

app.get("/login", (req, res) => res.send(layout({
  title: "Sign in", tab: "", body: `
  <h2 class="day">Sign in</h2>
  <form method="POST" action="/login">
    <label for="p">Password</label>
    <input type="password" id="p" name="password" autofocus
           style="width:100%;padding:13px;font:inherit;border:2px solid #dde3ea;border-radius:10px">
    <div class="actions"><button class="go" type="submit">Sign in</button></div>
  </form>` })));

app.post("/login", (req, res) => {
  if (req.body.password === PASSWORD) {
    res.cookie("auth", sign("ok"), {
      httpOnly: true, sameSite: "lax", maxAge: 365 * 86400_000,
      secure: process.env.NODE_ENV === "production",
    });
    return res.redirect("/");
  }
  res.redirect("/login");
});

// --- Today ------------------------------------------------------------------
app.get("/", async (req, res, next) => {
  try {
    const { warm, cold, coldHeld } = dailyList();
    const draft = async (item, isWarm) => {
      const d = await draftMessage({
        contact: item.contact, templateKey: item.templateKey, reason: item.reason,
      });
      return { ...item, body: d.body, flags: d.flags, messageId: d.id, warm: isWarm };
    };
    // Draft in parallel - the whole list is ready in about the time of one call.
    const [w, c] = await Promise.all([
      Promise.all(warm.map((i) => draft(i, true))),
      Promise.all(cold.map((i) => draft(i, false))),
    ]);
    res.send(todayPage({ warm: w, cold: c, coldHeld }));
  } catch (e) { next(e); }
});

// --- Actions ----------------------------------------------------------------
app.post("/action/sent", (req, res) => {
  // Ids arrive tagged ("msg:12", "inv:5", "post:3") because the three tables
  // number their rows independently - an untagged 12 is ambiguous.
  const [kind, rawId] = String(req.body.id).split(":");
  const id = Number(rawId);
  const body = req.body.body;

  if (kind === "inv") {
    const inv = db.prepare("SELECT * FROM invites WHERE id = ?").get(id);
    if (!inv) return res.status(404).json({ ok: false });
    db.prepare("UPDATE invites SET status='sent', sent_at=datetime('now'), body=? WHERE id=?")
      .run(body ?? inv.body, id);
    // The request is out; they become a real connection once accepted, but we
    // start the clock now so he isn't asked to invite them twice.
    db.prepare("UPDATE contacts SET stage='new_connection', connected_on=? WHERE id=?")
      .run(today(), inv.contact_id);
    return res.json({ ok: true });
  }

  if (kind === "post") {
    db.prepare("UPDATE posts SET status='posted', posted_at=datetime('now'), body=? WHERE id=?")
      .run(body, id);
    return res.json({ ok: true });
  }

  const msg = db.prepare("SELECT * FROM messages WHERE id = ?").get(id);
  if (!msg) return res.status(404).json({ ok: false });
  db.prepare("UPDATE messages SET status='sent', sent_at=datetime('now'), body=? WHERE id=?")
    .run(body ?? msg.body, id);
  db.prepare(`
    UPDATE contacts
    SET last_contact = ?,
        touches = touches + 1,
        stage = CASE
          WHEN stage = 'new_connection' THEN 'messaged'
          WHEN stage = 'messaged' AND last_reply IS NOT NULL THEN 'in_conversation'
          ELSE stage END
    WHERE id = ?`).run(today(), msg.contact_id);
  res.json({ ok: true });
});

app.post("/action/replied", (req, res) => {
  db.prepare(`UPDATE contacts SET last_reply = ?, touches = 0,
              stage = CASE WHEN stage IN ('new_connection','messaged') THEN 'in_conversation' ELSE stage END
              WHERE id = ?`).run(today(), req.body.contactId);
  res.json({ ok: true });
});

app.post("/action/snooze", (req, res) => {
  db.prepare("UPDATE contacts SET snooze_until = ? WHERE id = ?")
    .run(addDays(Number(req.body.days) || 21), req.body.contactId);
  res.json({ ok: true });
});

app.post("/action/stop", (req, res) => {
  db.prepare("UPDATE contacts SET stage='not_interested', archived=1 WHERE id = ?")
    .run(req.body.contactId);
  res.json({ ok: true });
});

// --- New connections --------------------------------------------------------
app.get("/connect", async (req, res, next) => {
  try {
    const perDay = Number(setting("invites_per_day", "20"));
    const sentToday = db.prepare("SELECT COUNT(*) n FROM invites WHERE date(sent_at) = ?")
      .get(today()).n;
    const queue = connectionQueue().slice(0, Math.max(0, perDay - sentToday));
    const withNotes = await Promise.all(queue.map(async (c) => {
      const d = await draftInvite(c);
      return { ...c, invite: d.body, messageId: d.id };
    }));
    res.send(connectPage({ queue: withNotes, sentToday, perDay }));
  } catch (e) { next(e); }
});

// --- Posts ------------------------------------------------------------------
app.get("/posts", (req, res) => {
  const posts = db.prepare(`
    SELECT id AS messageId, angle, body FROM posts
    WHERE status = 'drafted' ORDER BY id DESC LIMIT 6`).all();
  res.send(postsPage({ posts }));
});

app.post("/posts/new", async (req, res, next) => {
  try { await draftPosts(3); res.redirect("/posts"); }
  catch (e) { next(e); }
});

// --- People -----------------------------------------------------------------
app.get("/people", (req, res) => {
  const rows = db.prepare(`
    SELECT id, name, headline, company, stage, last_contact, mortgage_end
    FROM contacts WHERE archived = 0 ORDER BY
      CASE stage WHEN 'client' THEN 0 WHEN 'meeting_booked' THEN 1
                 WHEN 'in_conversation' THEN 2 ELSE 3 END, name
    LIMIT 500`).all();

  const body = `
    <h2 class="day">Everyone (${rows.length})</h2>
    <div class="actions" style="margin-bottom:20px">
      <a class="btn" href="/people/new">Add someone</a>
      <a class="btn" href="/import">Import from LinkedIn</a>
      <a class="btn" href="/export">Download everything</a>
    </div>
    <table><tr><th>Name</th><th>Stage</th><th>Last spoken</th><th>Rate ends</th></tr>
    ${rows.map((r) => `<tr>
      <td><a href="/people/${r.id}" style="color:inherit"><strong>${esc(r.name)}</strong></a>
          ${r.headline ? `<br><span class="pill">${esc(r.headline)}</span>` : ""}</td>
      <td>${esc(r.stage.replace(/_/g, " "))}</td>
      <td>${esc(r.last_contact || "never")}</td>
      <td>${esc(r.mortgage_end || "")}</td></tr>`).join("")}
    </table>`;
  res.send(layout({ title: "Everyone", tab: "/people", body }));
});

const FIELDS = ["name", "first_name", "headline", "company", "linkedin_url", "email",
                "phone", "stage", "notes", "mortgage_end", "review_due"];

function personForm(c = {}, action, title) {
  const f = (name, label, type = "text") => `
    <label for="${name}">${label}</label>
    <input type="${type}" id="${name}" name="${name}" value="${esc(c[name] || "")}">`;
  const stages = ["prospect", "new_connection", "messaged", "in_conversation",
                  "meeting_booked", "client", "not_interested"];
  return `
  <h2 class="day">${title}</h2>
  <form method="POST" action="${action}">
    ${f("name", "Their name")}
    ${f("headline", "What they do")}
    ${f("company", "Company")}
    ${f("linkedin_url", "Link to their LinkedIn profile")}
    ${f("email", "Email", "email")}
    ${f("phone", "Phone")}
    <label for="stage">Where you're up to</label>
    <select id="stage" name="stage">
      ${stages.map((s) => `<option value="${s}" ${c.stage === s ? "selected" : ""}>${s.replace(/_/g, " ")}</option>`).join("")}
    </select>
    ${f("mortgage_end", "Date their fixed rate ends", "date")}
    ${f("review_due", "Date of their next review", "date")}
    <label for="notes">Anything worth remembering</label>
    <textarea class="plain" id="notes" name="notes" rows="4">${esc(c.notes || "")}</textarea>
    <div class="actions"><button class="go" type="submit">Save</button>
    <a class="btn" href="/people">Cancel</a></div>
  </form>`;
}

app.get("/people/new", (req, res) => res.send(layout({
  title: "Add someone", tab: "/people",
  body: personForm({ stage: req.query.stage || "new_connection" }, "/people/new", "Add someone"),
})));

app.post("/people/new", (req, res) => {
  const v = Object.fromEntries(FIELDS.map((k) => [k, req.body[k]?.trim() || null]));
  if (!v.name) return res.redirect("/people/new");
  v.first_name = v.first_name || v.name.split(" ")[0];
  v.stage = v.stage || "new_connection";
  db.prepare(`INSERT INTO contacts (${FIELDS.join(",")}, connected_on)
              VALUES (${FIELDS.map((k) => "@" + k).join(",")}, @connected_on)`)
    .run({ ...v, connected_on: v.stage === "prospect" ? null : today() });
  res.redirect("/people");
});

app.get("/people/:id", (req, res) => {
  const c = db.prepare("SELECT * FROM contacts WHERE id = ?").get(req.params.id);
  if (!c) return res.redirect("/people");
  const history = db.prepare(
    "SELECT body, status, reason, created_at FROM messages WHERE contact_id = ? ORDER BY id DESC LIMIT 20"
  ).all(c.id);

  res.send(layout({ title: c.name, tab: "/people", body:
    personForm(c, `/people/${c.id}`, esc(c.name)) +
    (history.length ? `<h2 class="day" style="font-size:21px">Everything you've sent them</h2>
      ${history.map((h) => `<div class="card"><p class="role">${esc(h.created_at)} &middot; ${esc(h.status)}</p>
        <div class="why">${esc(h.reason)}</div>
        <p style="white-space:pre-wrap;margin:0">${esc(h.body)}</p></div>`).join("")}` : "")
  }));
});

app.post("/people/:id", (req, res) => {
  const v = Object.fromEntries(FIELDS.map((k) => [k, req.body[k]?.trim() || null]));
  db.prepare(`UPDATE contacts SET ${FIELDS.map((k) => `${k}=@${k}`).join(",")} WHERE id=@id`)
    .run({ ...v, id: req.params.id });
  res.redirect("/people");
});

// --- Import / export --------------------------------------------------------
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.get("/import", (req, res) => res.send(layout({
  title: "Import", tab: "/people", body: `
  <h2 class="day">Bring in your LinkedIn connections</h2>
  <p class="sub">You only need to do this once, and again whenever you want to top it up.</p>
  <div class="card">
    <p><strong>On LinkedIn:</strong></p>
    <p>1. Click your photo, then <strong>Settings &amp; Privacy</strong><br>
       2. <strong>Data privacy</strong>, then <strong>Get a copy of your data</strong><br>
       3. Tick <strong>Connections</strong> and request the file<br>
       4. LinkedIn emails you a zip within about 10 minutes. Open it and find <strong>Connections.csv</strong></p>
  </div>
  <form method="POST" action="/import" enctype="multipart/form-data">
    <label for="file">Then choose that file here</label>
    <input type="file" id="file" name="file" accept=".csv,text/csv" required
           style="padding:14px;border:2px dashed #dde3ea;border-radius:10px;width:100%;background:#fff">
    <div class="actions"><button class="go" type="submit">Bring them in</button></div>
  </form>` })));

app.post("/import", upload.single("file"), (req, res, next) => {
  try {
    if (!req.file) return res.redirect("/import");
    const r = importConnections(req.file.buffer.toString("utf8"));
    res.send(layout({ title: "Imported", tab: "/people", body: `
      <div class="empty"><div class="tick">&#10003;</div>
      <h3>${r.added} people added</h3>
      <p>${r.skipped} were already on your list, so they were left alone.</p>
      <p style="margin-top:22px"><a class="btn go" href="/">See who to message today</a></p></div>` }));
  } catch (e) { next(e); }
});

// The network can ask for a record of every promotion sent. This is that record.
app.get("/export", (req, res) => {
  const rows = db.prepare(`
    SELECT m.created_at, m.sent_at, c.name, c.email, m.template_key, m.reason,
           m.status, m.flagged, m.body
    FROM messages m JOIN contacts c ON c.id = m.contact_id ORDER BY m.id`).all();
  const csv = [
    "drafted_at,sent_at,contact,email,template,reason,status,flagged,message",
    ...rows.map((r) => Object.values(r)
      .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")),
  ].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="messages-${today()}.csv"`);
  res.send(csv);
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send(layout({ title: "Problem", tab: "", body: `
    <div class="empty"><h3>Something went wrong</h3>
    <p>Nothing was lost. Try again in a moment.</p>
    <p style="margin-top:20px"><a class="btn" href="/">Back to today</a></p></div>` }));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Follow-up running on http://localhost:${port}`));
