-- Provider-verified listings (docs/14; Kyle's decisions of 2026-09-24). No resident is in any of this.
-- Additive only: new tables and one nullable column, so the Worker that is already deployed keeps working until the
-- new one is. Apply it before the code that uses it is deployed (docs/OPERATIONS.md).
--
-- An organization's email address is never stored (D2): a steward reads it off the organization's own page and sends
-- the link by hand (D1). What is kept is the listing, the page the address came from, and what happened to the link.

-- One link, for one listing, used at most once (D3). The link carries 32 random bytes; only their SHA-256 is kept here,
-- so a copy of this table cannot be turned back into a working link.
CREATE TABLE owner_links (
  key_hash   TEXT PRIMARY KEY,                    -- sha256 hex of the key in the link
  target_id  TEXT NOT NULL REFERENCES targets(id),
  category   TEXT NOT NULL,                       -- the listing's category when the link was made: a shelter.dv answer never keeps an address
  source_url TEXT NOT NULL,                       -- the organization's own page the steward took the address from
  made_at    TEXT NOT NULL,                       -- to the minute
  expires_at TEXT NOT NULL,                       -- made_at + 30 days
  used_at    TEXT,                                -- the first answer; a used link answers nothing more
  answer     TEXT CHECK (answer IN ('still_right', 'changed')),
  answer_id  TEXT                                 -- the id written with the answer, so the one transaction that used the link is the one that records it
);
CREATE INDEX owner_links_target ON owner_links (target_id);

-- "Still right", dated. The badge reads the latest one (docs/03, `owner_attest`). Kept like report_counts: a fact about
-- a listing, never about a person.
CREATE TABLE owner_attests (
  target_id TEXT NOT NULL REFERENCES targets(id),
  at        TEXT NOT NULL,                        -- to the minute
  PRIMARY KEY (target_id, at)
);

-- "Something changed" is a proposal about a listing that already exists (D5). NULL for a proposed new place.
ALTER TABLE proposals ADD COLUMN target_id TEXT REFERENCES targets(id);
