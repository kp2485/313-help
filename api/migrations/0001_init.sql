-- No users table for residents. Ever. No IP, no device id, no user agent, no coordinates anywhere.
-- Times are stored to the minute (condition reports: to the hour).

CREATE TABLE targets (            -- ids that exist in the published dataset; synced by the pipeline at publish
  id   TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('listing', 'place'))
);

CREATE TABLE reports (
  id            TEXT PRIMARY KEY,                 -- rpt_ / cond_
  target_id     TEXT NOT NULL REFERENCES targets(id),
  kind          TEXT NOT NULL,
  detail        TEXT,                             -- <= 280 chars, phone/email patterns masked BEFORE storage
  suggested     TEXT,                             -- JSON: { hours?, address?, phone? } about the listing, never about the reporter
  observed_at   TEXT,
  submitted_at  TEXT NOT NULL,
  client_nonce  TEXT NOT NULL,                    -- sha256(install_secret || target_id || day): per target, per day, unlinkable
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'rejected', 'duplicate')),
  reason_code   TEXT,
  resolved_at   TEXT,
  UNIQUE (client_nonce, kind)                     -- one device, one target, one day, one kind
);
CREATE INDEX reports_target ON reports (target_id, status);

CREATE TABLE proposals (
  id            TEXT PRIMARY KEY,                 -- prop_
  ref           TEXT NOT NULL,                    -- short display-only code shown to the submitter
  name          TEXT NOT NULL,
  category      TEXT NOT NULL,
  what          TEXT NOT NULL,
  address       TEXT,                             -- always NULL for shelter.dv
  phone         TEXT,                             -- the organization's public number
  schedule_text TEXT,
  how_known     TEXT NOT NULL CHECK (how_known IN ('run_it', 'volunteer', 'went_there', 'heard')),
  notes         TEXT,                             -- masked like report detail
  submitted_at  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'rejected', 'duplicate')),
  reason_code   TEXT,
  resolved_at   TEXT
);

CREATE TABLE steward_actions (    -- who did what. The public dataset gets action/reason/date only, never `steward` or `note`.
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL,
  steward     TEXT NOT NULL,
  action      TEXT NOT NULL,
  subject_id  TEXT NOT NULL,
  reason_code TEXT,
  note        TEXT
);

CREATE TABLE report_counts (      -- what is left of a report after 180 days
  target_id TEXT NOT NULL,
  kind      TEXT NOT NULL,
  month     TEXT NOT NULL,
  n         INTEGER NOT NULL,
  PRIMARY KEY (target_id, kind, month)
);
