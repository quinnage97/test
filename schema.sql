-- One adviser, one database. Kept deliberately small and readable.

CREATE TABLE IF NOT EXISTS contacts (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL,
  first_name     TEXT,
  headline       TEXT,          -- job title / LinkedIn headline
  company        TEXT,
  linkedin_url   TEXT,
  email          TEXT,
  phone          TEXT,
  source         TEXT NOT NULL DEFAULT 'manual',   -- linkedin_export | manual | referral
  stage          TEXT NOT NULL DEFAULT 'new_connection',
  -- new_connection -> messaged -> in_conversation -> meeting_booked -> client
  --                                                              \-> not_interested
  notes          TEXT,
  -- The two dates that make a mortgage/pension book print money:
  mortgage_end   TEXT,          -- ISO date the current fixed rate ends
  review_due     TEXT,          -- ISO date of next annual pension/protection review
  connected_on   TEXT,          -- ISO date the LinkedIn connection was made
  last_contact   TEXT,          -- ISO date we last sent them anything
  last_reply     TEXT,          -- ISO date they last replied
  touches        INTEGER NOT NULL DEFAULT 0,       -- messages sent since their last reply
  snooze_until   TEXT,          -- ISO date; hidden from the daily list until then
  archived       INTEGER NOT NULL DEFAULT 0,       -- 1 = never show again
  created_at     TEXT NOT NULL DEFAULT (date('now'))
);

CREATE INDEX IF NOT EXISTS idx_contacts_stage ON contacts(stage, archived);

-- Every message ever drafted or sent. This is the compliance audit trail:
-- the network can ask for it, and it must never be deleted.
CREATE TABLE IF NOT EXISTS messages (
  id           INTEGER PRIMARY KEY,
  contact_id   INTEGER NOT NULL REFERENCES contacts(id),
  template_key TEXT NOT NULL,
  reason       TEXT NOT NULL,   -- why the system surfaced this contact
  body         TEXT NOT NULL,   -- exact wording that was put in front of the adviser
  channel      TEXT NOT NULL DEFAULT 'linkedin',
  status       TEXT NOT NULL DEFAULT 'drafted',    -- drafted | sent | skipped
  flagged      TEXT,            -- compliance warnings found in the draft, if any
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_contact ON messages(contact_id, created_at);

-- Network-approved wording. The AI personalises within these, it does not invent
-- financial promotions from scratch.
CREATE TABLE IF NOT EXISTS templates (
  key          TEXT PRIMARY KEY,
  label        TEXT NOT NULL,
  body         TEXT NOT NULL,
  guidance     TEXT,            -- extra steer given to the AI for this template
  approved_by  TEXT,            -- who at the network signed it off
  approved_on  TEXT,
  active       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- LinkedIn posts. Same audit logic as messages: a post is a financial promotion
-- too, so everything drafted is kept.
CREATE TABLE IF NOT EXISTS posts (
  id         INTEGER PRIMARY KEY,
  angle      TEXT NOT NULL,
  body       TEXT NOT NULL,
  flagged    TEXT,
  status     TEXT NOT NULL DEFAULT 'drafted',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  posted_at  TEXT
);

-- Invitation notes sent with connection requests.
CREATE TABLE IF NOT EXISTS invites (
  id         INTEGER PRIMARY KEY,
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  body       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'drafted',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at    TEXT
);
