-- One organisation, one database. Money is stored in whole pence as integers,
-- never as floats: a service charge that is a penny out is a service charge
-- somebody argues about.
--
-- Two things deliberately do NOT live in this schema:
--   * the wording of any statutory document  -> templates/
--   * what the law says, and how settled it is -> law/provisions.json
-- Both will change. Columns are expensive to change; files are not.

CREATE TABLE IF NOT EXISTS buildings (
  id                 INTEGER PRIMARY KEY,
  name               TEXT NOT NULL,
  address            TEXT,
  postcode           TEXT,
  -- Who is responsible for demanding the service charge, and so who has to
  -- put their name and address on the demand.
  entity_kind        TEXT NOT NULL DEFAULT 'rmc',   -- rmc | rtm | freeholder | agent
  entity_name        TEXT,
  entity_address     TEXT,          -- must be an address in England or Wales
  agent_name         TEXT,          -- managing agent, if there is one
  units_count        INTEGER,
  year_end           TEXT,          -- 'MM-DD', the accounting year end
  communal_heating   INTEGER NOT NULL DEFAULT 0,    -- 1 = shared heating/hot water
  -- Insurance, because it has to be disclosed and the details are always
  -- somewhere else when you need them.
  insurer            TEXT,
  broker             TEXT,
  policy_number      TEXT,
  policy_start       TEXT,
  policy_end         TEXT,
  sum_insured_pence  INTEGER,
  premium_pence      INTEGER,
  insured_risks      TEXT,
  commission_note    TEXT,          -- any commission the agent or landlord receives
  notes              TEXT,
  archived           INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (date('now'))
);

-- One row per flat. The share is what turns a building total into a demand.
CREATE TABLE IF NOT EXISTS units (
  id             INTEGER PRIMARY KEY,
  building_id    INTEGER NOT NULL REFERENCES buildings(id),
  ref            TEXT NOT NULL,     -- "Flat 12"
  leaseholder    TEXT,
  correspondence TEXT,              -- where demands are sent, if not the flat
  email          TEXT,
  share_percent  REAL NOT NULL DEFAULT 0,   -- their share of the service charge
  method         TEXT NOT NULL DEFAULT 'post',  -- post | email | hand
  archived       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_units_building ON units(building_id, archived);

-- An accounting year for one building.
CREATE TABLE IF NOT EXISTS years (
  id                  INTEGER PRIMARY KEY,
  building_id         INTEGER NOT NULL REFERENCES buildings(id),
  period_start        TEXT NOT NULL,
  period_end          TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'draft',   -- draft | issued
  on_account_pence    INTEGER NOT NULL DEFAULT 0,      -- total demanded on account
  reserve_open_pence  INTEGER NOT NULL DEFAULT 0,
  reserve_in_pence    INTEGER NOT NULL DEFAULT 0,
  reserve_out_pence   INTEGER NOT NULL DEFAULT 0,
  prepared_by         TEXT,
  prepared_on         TEXT,
  examined_by         TEXT,          -- accountant who reported on the accounts
  examined_on         TEXT,
  notes               TEXT,
  created_at          TEXT NOT NULL DEFAULT (date('now'))
);

CREATE INDEX IF NOT EXISTS idx_years_building ON years(building_id, period_end);

-- Every figure that goes into the year, one line each. Kept as lines rather
-- than a single total so the annual report can show what the money went on.
CREATE TABLE IF NOT EXISTS lines (
  id               INTEGER PRIMARY KEY,
  year_id          INTEGER NOT NULL REFERENCES years(id),
  kind             TEXT NOT NULL DEFAULT 'expenditure',  -- expenditure | income
  category         TEXT NOT NULL,
  description      TEXT,
  amount_pence     INTEGER NOT NULL DEFAULT 0,
  incurred_on      TEXT,          -- when the cost was incurred (the 18-month rule)
  qualifying_works INTEGER NOT NULL DEFAULT 0,  -- 1 = a works project, not routine
  consulted        INTEGER NOT NULL DEFAULT 0,  -- 1 = leaseholders were consulted
  supplier         TEXT,
  notes            TEXT
);

CREATE INDEX IF NOT EXISTS idx_lines_year ON lines(year_id, kind);

-- A document that was produced. The wording is frozen at the moment it was
-- generated, along with the template version and what the law was understood
-- to say that day. A document produced last year must still be explicable
-- next year, after the template and the law have both moved on.
CREATE TABLE IF NOT EXISTS documents (
  id               INTEGER PRIMARY KEY,
  building_id      INTEGER NOT NULL REFERENCES buildings(id),
  year_id          INTEGER REFERENCES years(id),
  unit_id          INTEGER REFERENCES units(id),
  kind             TEXT NOT NULL,     -- demand | annual_report | accounts | insurance
                                      -- rights_summary | heat_registration
  title            TEXT NOT NULL,
  template_id      TEXT NOT NULL,
  template_version TEXT NOT NULL,
  template_status  TEXT NOT NULL,     -- in_force | expected  (as at generation)
  template_dated   TEXT,
  basis            TEXT,              -- JSON snapshot of the provisions relied on
  body             TEXT NOT NULL,
  warnings         TEXT,              -- JSON: what the checks said at the time
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_documents_year ON documents(year_id, kind);
CREATE INDEX IF NOT EXISTS idx_documents_building ON documents(building_id, created_at);

-- What was issued, to whom, when, and how. This is the record you will be
-- asked for, so nothing here is ever edited or deleted - a mistake is
-- corrected by issuing again, which leaves both rows in place.
CREATE TABLE IF NOT EXISTS issues (
  id          INTEGER PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id),
  building_id INTEGER NOT NULL REFERENCES buildings(id),
  unit_id     INTEGER REFERENCES units(id),
  recipient   TEXT NOT NULL,
  method      TEXT NOT NULL,     -- post | email | hand
  issued_on   TEXT NOT NULL,
  issued_by   TEXT,
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_issues_document ON issues(document_id);

-- Heat networks -------------------------------------------------------------

-- Answers to the scope questions. The questions themselves live in the
-- template layer, versioned, because the test will be refined.
CREATE TABLE IF NOT EXISTS heat_answers (
  building_id  INTEGER NOT NULL REFERENCES buildings(id),
  question_id  TEXT NOT NULL,
  answer       TEXT NOT NULL,     -- yes | no | unknown
  answered_on  TEXT NOT NULL DEFAULT (date('now')),
  PRIMARY KEY (building_id, question_id)
);

-- Everything the registration pack needs to say. Key/value on purpose: the
-- list of things Ofgem asks for is not settled, so it is declared by the
-- template and not by a column.
CREATE TABLE IF NOT EXISTS heat_facts (
  building_id INTEGER NOT NULL REFERENCES buildings(id),
  key         TEXT NOT NULL,
  value       TEXT,
  updated_at  TEXT NOT NULL DEFAULT (date('now')),
  PRIMARY KEY (building_id, key)
);

-- Ongoing authorisation conditions, once registered.
CREATE TABLE IF NOT EXISTS conditions (
  id           INTEGER PRIMARY KEY,
  building_id  INTEGER NOT NULL REFERENCES buildings(id),
  condition_id TEXT NOT NULL,     -- id from the condition set in the template layer
  status       TEXT NOT NULL DEFAULT 'not_started',  -- not_started | in_progress | done | n_a
  due          TEXT,
  evidence     TEXT,
  updated_at   TEXT NOT NULL DEFAULT (date('now')),
  UNIQUE (building_id, condition_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
