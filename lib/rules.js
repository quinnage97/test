import { db, daysSince, daysUntil, today, setting } from "../db.js";

// The stop rule. Nobody gets chased forever - three unanswered messages and
// they drop off the list until they reply or a real event (rate expiry,
// review date) brings them back.
const MAX_UNANSWERED = 3;

// Each rule looks at one contact and either returns a reason to talk to them
// today, or null. First match wins, so order = priority.
const RULES = [
  {
    key: "reply_waiting",
    priority: 110,
    test: (c) =>
      c.last_reply &&
      (!c.last_contact || c.last_reply >= c.last_contact) &&
      daysSince(c.last_reply) >= 0,
    reason: (c) => {
      const d = daysSince(c.last_reply);
      return d <= 0 ? "They replied today - answer while it's warm" :
             `They replied ${d} day${d === 1 ? "" : "s"} ago and are waiting on you`;
    },
  },
  {
    key: "rate_expiry",
    priority: 100,
    test: (c) => {
      const d = daysUntil(c.mortgage_end);
      return d !== null && d <= 180 && d > -30 &&
             (daysSince(c.last_contact) ?? 999) >= 30;
    },
    reason: (c) => {
      const d = daysUntil(c.mortgage_end);
      return d < 0
        ? `Their fixed rate ended ${-d} days ago - they may be on the standard variable rate`
        : `Their fixed rate ends in ${d} days (${c.mortgage_end})`;
    },
  },
  {
    key: "review_due",
    priority: 90,
    test: (c) => {
      const d = daysUntil(c.review_due);
      return d !== null && d <= 30 && d > -60 &&
             (daysSince(c.last_contact) ?? 999) >= 21;
    },
    reason: (c) => {
      const d = daysUntil(c.review_due);
      return d < 0 ? `Their annual review was due ${-d} days ago`
                   : `Their annual review is due in ${d} days`;
    },
  },
  {
    key: "meeting_followup",
    priority: 85,
    test: (c) => c.stage === "meeting_booked" && (daysSince(c.last_contact) ?? 0) >= 5,
    reason: (c) => `You spoke ${daysSince(c.last_contact)} days ago and nothing has been logged since`,
  },
  {
    key: "conversation_stalled",
    priority: 80,
    test: (c) =>
      c.stage === "in_conversation" &&
      (daysSince(c.last_contact) ?? 0) >= 5 &&
      c.touches < MAX_UNANSWERED,
    reason: (c) => `Your conversation went quiet ${daysSince(c.last_contact)} days ago`,
  },
  {
    key: "new_connection",
    priority: 70,
    test: (c) =>
      c.stage === "new_connection" && c.touches === 0 &&
      (daysSince(c.connected_on) ?? 0) <= 21,
    reason: (c) => {
      const d = daysSince(c.connected_on);
      return d <= 1 ? "You just connected - say hello before they forget who you are"
                    : `You connected ${d} days ago and haven't said anything yet`;
    },
  },
  {
    key: "nudge_one",
    priority: 60,
    test: (c) => c.touches === 1 && !c.last_reply && (daysSince(c.last_contact) ?? 0) >= 6,
    reason: (c) => `No reply to your first message ${daysSince(c.last_contact)} days ago`,
  },
  {
    key: "nudge_two",
    priority: 50,
    test: (c) => c.touches === 2 && !c.last_reply && (daysSince(c.last_contact) ?? 0) >= 16,
    reason: (c) => `Still no reply - this is the last one before they drop off your list`,
  },
  {
    key: "client_checkin",
    priority: 40,
    test: (c) => c.stage === "client" && (daysSince(c.last_contact) ?? 999) >= 180,
    reason: (c) => `An existing client you haven't spoken to in ${Math.floor(daysSince(c.last_contact) / 30)} months`,
  },
  {
    key: "dormant",
    priority: 20,
    test: (c) =>
      (daysSince(c.last_contact) ?? daysSince(c.created_at) ?? 0) >= 120 &&
      c.touches < MAX_UNANSWERED &&
      c.stage !== "not_interested",
    reason: (c) => `Nothing for ${Math.floor((daysSince(c.last_contact) ?? daysSince(c.created_at)) / 30)} months - worth one light touch`,
  },
];

function match(contact) {
  for (const rule of RULES) {
    let hit = false;
    try { hit = rule.test(contact); } catch { hit = false; }
    if (hit) {
      return { templateKey: rule.key, reason: rule.reason(contact), priority: rule.priority };
    }
  }
  return null;
}

// The daily list.
//
// Warm items are never capped - a client whose rate is expiring or a lead who
// replied is money on the table, and hiding those behind a limit is the exact
// leak this whole thing exists to plug.
//
// Cold items ARE capped, because they're the ones with a low reply rate and a
// high chance of being abandoned halfway. A short cold list that gets finished
// beats a long one that gets ignored.
const WARM = new Set([
  "reply_waiting", "rate_expiry", "review_due", "meeting_followup",
  "conversation_stalled", "client_checkin",
]);

export function dailyList() {
  const coldLimit = Number(setting("cold_limit", "15"));
  const now = today();

  const contacts = db.prepare(`
    SELECT * FROM contacts
    WHERE archived = 0
      AND stage != 'not_interested'
      AND (snooze_until IS NULL OR snooze_until <= ?)
  `).all(now);

  const warm = [], cold = [];
  for (const c of contacts) {
    // Don't surface anyone we already messaged today.
    if (c.last_contact === now) continue;
    const m = match(c);
    if (!m) continue;
    (WARM.has(m.templateKey) ? warm : cold).push({ contact: c, ...m });
  }

  const byPriority = (a, b) =>
    b.priority - a.priority ||
    (a.contact.last_contact || "").localeCompare(b.contact.last_contact || "");
  warm.sort(byPriority);
  cold.sort(byPriority);

  return {
    warm,
    cold: cold.slice(0, coldLimit),
    coldHeld: Math.max(0, cold.length - coldLimit),
    total: warm.length + cold.length,
  };
}

// Top of funnel. People he's never connected with don't live in `contacts` yet -
// this is the queue of connections he should send, built from whoever he's
// added as a prospect. LinkedIn's own weekly invite ceiling is the real limit,
// so the app paces to a safe daily number rather than pretending it can go faster.
export function connectionQueue() {
  const perDay = Number(setting("invites_per_day", "20"));
  return db.prepare(`
    SELECT * FROM contacts
    WHERE archived = 0 AND stage = 'prospect' AND (snooze_until IS NULL OR snooze_until <= ?)
    ORDER BY created_at ASC
    LIMIT ?
  `).all(today(), perDay);
}

export { match, MAX_UNANSWERED };
