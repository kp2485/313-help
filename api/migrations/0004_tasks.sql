-- Tasks the machine raises for a steward (DECISIONS 2026-09-19). Today one kind: the nightly re-check of each
-- listing's own web page could not find its phone or street address there, or could not read the page. A task never
-- changes the app; a person decides. `detail` is the page matcher's own words about the listing (an organization's
-- published phone number or street address, or why the page could not be read), never about a person.
-- Each night the pipeline sends the whole current list. At most one row per listing is "live" (cleared_at IS NULL):
--   open        waiting for a steward
--   dismissed   a steward said "checked: it's fine" or "I'll fix it"; it stays quiet while the check says the same thing
--   resolved_by_check   the page matched again, so the task closed itself
-- A live row is cleared when the check stops reporting it, or when a dismissed one is replaced by a new result.
CREATE TABLE steward_tasks (
  id          TEXT PRIMARY KEY,                 -- task_<16 hex>, random
  kind        TEXT NOT NULL CHECK (kind IN ('source_check')),
  target_id   TEXT NOT NULL,                    -- sal_
  result      TEXT NOT NULL CHECK (result IN ('missing', 'unreadable')),
  detail      TEXT NOT NULL,
  checked_on  TEXT NOT NULL,                    -- the day the check first said this (a date)
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'resolved_by_check')),
  reason_code TEXT,                             -- checked_fine | will_fix, when dismissed
  opened_at   TEXT NOT NULL,                    -- to the minute
  closed_at   TEXT,
  cleared_at  TEXT
);
CREATE UNIQUE INDEX steward_tasks_live ON steward_tasks (kind, target_id) WHERE cleared_at IS NULL;
CREATE INDEX steward_tasks_status ON steward_tasks (status);
