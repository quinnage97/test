import Anthropic from "@anthropic-ai/sdk";
import { db, setting } from "../db.js";
import { checkCompliance, footerFor } from "./compliance.js";

const client = new Anthropic();

const SYSTEM = `You write short LinkedIn messages on behalf of a UK mortgage and pensions adviser.

The adviser is an appointed representative of a network, so every word you write is a
financial promotion the network is accountable for. You are personalising an
already-approved template, not writing a new promotion.

Hard rules:
- Rewrite the approved template so it sounds like it was typed by a person who
  actually looked at this contact's profile. Keep its meaning and its offer intact.
- Never promise, guarantee, or quantify a saving, rate, or outcome.
- Never give advice. You may offer a conversation. You may not suggest a course of action.
- Never mention pension transfers or consolidation.
- No pressure, no urgency, no sales language, no exclamation marks.
- 40-70 words. Two short paragraphs at most. Plain British English.
- Open with something specific to them, not "I hope this message finds you well".
- Close with a low-friction question, not a hard ask for a meeting.
- Write only the message body. No subject line, no greeting line like "Hi <name>,"
  unless the template has one, no sign-off, no quotation marks, no commentary.`;

function buildPrompt({ contact, template, reason }) {
  const facts = [
    `Name: ${contact.name}`,
    contact.first_name && `Goes by: ${contact.first_name}`,
    contact.headline && `Their role: ${contact.headline}`,
    contact.company && `Their company: ${contact.company}`,
    contact.notes && `What the adviser knows about them: ${contact.notes}`,
    contact.mortgage_end && `Their fixed rate ends: ${contact.mortgage_end}`,
    `Relationship so far: ${describeStage(contact)}`,
  ].filter(Boolean).join("\n");

  return `Why you are writing to them today:
${reason}

What you know about them:
${facts}

The approved template to personalise:
"""
${template.body}
"""
${template.guidance ? `\nExtra steer for this template: ${template.guidance}` : ""}

Write the message.`;
}

function describeStage(c) {
  const map = {
    new_connection: "Connected on LinkedIn, never spoken",
    messaged: `Sent ${c.touches} message(s), no reply yet`,
    in_conversation: "Have exchanged messages before",
    meeting_booked: "Has had a call or meeting with the adviser",
    client: "An existing client",
  };
  return map[c.stage] || c.stage;
}

export async function draftMessage({ contact, templateKey, reason }) {
  const template = db.prepare("SELECT * FROM templates WHERE key = ? AND active = 1").get(templateKey);
  if (!template) throw new Error(`No active template for "${templateKey}"`);

  let body;
  try {
    const res = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 1000,
      system: SYSTEM,
      messages: [{ role: "user", content: buildPrompt({ contact, template, reason }) }],
    });
    body = res.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  } catch (err) {
    // If the API is down or unpaid, fall back to the approved template with the
    // name filled in. The adviser's day is never blocked by this.
    console.error("draft failed, using plain template:", err.message);
    body = template.body;
  }

  body = body
    .replace(/^["'“”]|["'“”]$/g, "")
    .replaceAll("{first_name}", contact.first_name || contact.name.split(" ")[0])
    .replaceAll("{name}", contact.name)
    .trim();

  const footer = footerFor(templateKey, { disclosure: setting("disclosure", "") });
  if (footer) body += `\n\n${footer}`;

  const flags = checkCompliance(body);

  const info = db.prepare(`
    INSERT INTO messages (contact_id, template_key, reason, body, flagged)
    VALUES (?, ?, ?, ?, ?)
  `).run(contact.id, templateKey, reason, body, flags.length ? JSON.stringify(flags) : null);

  return { id: info.lastInsertRowid, body, flags };
}

// --- Connection invitation notes -------------------------------------------
// LinkedIn caps these at 300 characters, and a note roughly doubles the accept
// rate versus a bare request.
const INVITE_SYSTEM = `You write LinkedIn connection request notes for a UK mortgage and pensions adviser.

Hard rules:
- Under 280 characters. This is a hard limit - LinkedIn rejects anything longer.
- Give a real reason for connecting that comes from their profile.
- Do NOT mention mortgages, pensions, rates, reviews, or any service. This is a
  connection request, not a promotion. Selling here is what gets requests ignored
  and accounts reported.
- No flattery, no "I came across your profile", no exclamation marks.
- Sound like a person, not a template. Plain British English.
- Write only the note.`;

export async function draftInvite(contact) {
  const adviser = setting("adviser_name", "the adviser");
  const area = setting("area", "the UK");
  let body;
  try {
    const res = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 400,
      system: INVITE_SYSTEM,
      messages: [{ role: "user", content:
`You are writing as ${adviser}, based in ${area}.

The person:
Name: ${contact.name}
Role: ${contact.headline || "unknown"}
Company: ${contact.company || "unknown"}
${contact.notes ? `Notes: ${contact.notes}` : ""}

Write the connection note.` }],
    });
    body = res.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  } catch (err) {
    console.error("invite draft failed:", err.message);
    body = `Hello ${contact.first_name || contact.name.split(" ")[0]} - I work with people in ${area} and came across your profile. Would be good to connect.`;
  }
  body = body.replace(/^["'“”]|["'“”]$/g, "").slice(0, 290).trim();
  const info = db.prepare("INSERT INTO invites (contact_id, body) VALUES (?, ?)").run(contact.id, body);
  return { id: info.lastInsertRowid, body };
}

// --- Posts ------------------------------------------------------------------
const POST_SYSTEM = `You write LinkedIn posts for a UK mortgage and pensions adviser who is an
appointed representative of a network.

A post reaches far more people than a message and nobody can object to it, so this
is his best use of LinkedIn. But it is still a financial promotion.

Hard rules:
- 90-150 words. Short paragraphs, one idea each, blank line between them.
- Teach one specific, genuinely useful thing. Something a real client asked him.
- No advice to any individual. Explain how something works, never what someone should do.
- Never state a rate, a saving, a figure, or a promise.
- No hashtag spam (two at most, or none), no emoji, no "Let's connect", no
  "DM me", no engagement bait, no "Thoughts?".
- Plain British English. Write like he talks, not like a brochure.
- End on an observation or a soft open question, not a call to action.`;

export async function draftPosts(n = 3) {
  const recent = db.prepare("SELECT angle FROM posts ORDER BY id DESC LIMIT 12")
    .all().map((r) => r.angle);

  const res = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 4000,
    system: POST_SYSTEM,
    messages: [{ role: "user", content:
`Write ${n} different LinkedIn posts.

${recent.length ? `Do NOT repeat these angles already used:\n${recent.map((a) => `- ${a}`).join("\n")}` : ""}

Format your reply exactly like this, and nothing else:

ANGLE: <five words describing the angle>
POST:
<the post>
---
ANGLE: <five words>
POST:
<the post>
---` }],
  });

  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const out = [];
  for (const chunk of text.split(/^---\s*$/m)) {
    const m = chunk.match(/ANGLE:\s*(.+?)\s*\n+POST:\s*\n([\s\S]+)/);
    if (!m) continue;
    const angle = m[1].trim(), body = m[2].trim();
    if (!body) continue;
    const flags = checkCompliance(body);
    const info = db.prepare("INSERT INTO posts (angle, body, flagged) VALUES (?, ?, ?)")
      .run(angle, body, flags.length ? JSON.stringify(flags) : null);
    out.push({ id: info.lastInsertRowid, angle, body, flags });
  }
  return out;
}
