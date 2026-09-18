-- A steward's decision about a listing. The seed CSVs and ingested files are never edited by the
-- API; the pipeline reads these at build time and applies them. Nothing is deleted: an archived
-- listing keeps its id, its reason, and (when there is one) its replacement.
CREATE TABLE listing_overrides (
  target_id      TEXT PRIMARY KEY REFERENCES targets(id),
  status         TEXT NOT NULL CHECK (status IN ('archived', 'suspended', 'active')),
  reason_code    TEXT NOT NULL,
  replacement_id TEXT,
  at             TEXT NOT NULL
);
