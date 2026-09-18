-- Photos on condition reports (docs/11). The picture itself lives in a private R2 bucket; this table only
-- remembers that it exists, which report it belongs to, and when, so it can be deleted on time:
-- 30 days after its report closes, or after one day if no report ever claimed it.
-- Nothing here describes the sender: no IP, no device, no location. The time is kept to the minute.
CREATE TABLE photos (
  key         TEXT PRIMARY KEY,                 -- ph_<32 hex>, random
  uploaded_at TEXT NOT NULL,
  report_id   TEXT REFERENCES reports(id)
);
ALTER TABLE reports ADD COLUMN photo_key TEXT;
