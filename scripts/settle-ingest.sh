#!/usr/bin/env bash
# What the nightly job does with a re-read of open data (.github/workflows/publish.yml; DECISIONS 2026-11-20).
#
#   scripts/settle-ingest.sh overlay   before the ingests: bring in what is already waiting for review
#   scripts/settle-ingest.sh settle    after them: fetch-date-only files to main, everything else to ONE pull request
#
# Until 2026-11-20 this was all-or-nothing and one pull request a day: if any file changed beyond its fetch dates,
# NO file was committed and a new pull request was opened, every night, until a person merged one. On 2026-11-04 one
# layer aged past its max_age_days, nobody was there to merge, and for seventeen nights every source's dates stood
# still on main behind seventeen pull requests. Now each file is judged by itself (pipeline/src/ingest-changes.ts),
# and what waits for a person waits in a single pull request on the branch `ingest/pending`, rebuilt each night
# against main with a summary of what moved. A phone, an address, a coordinate or a row is still published only
# when a person merges it: that rule has not changed.
#
# `overlay` exists because some layers are read monthly: without it, a change read on the 1st would drop out of the
# pull request on the 2nd, when the branch is rebuilt from main. Only files the waiting branch changed, and main has
# not touched since, are carried; and only while that pull request is open, so closing it is a real "no".
#
# data/indicators travels with them (2026-11-20): the neighborhood numbers file is built FROM the ingested files and
# is committed, and the tests hold the two to each other. A data change merged without it left main inconsistent and
# would have stopped the next night's publish at its test gate; the job now rebuilds it before settling, so it rides
# in the same commit or the same pull request as the data it was counted from.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
PENDING="${INGEST_PENDING_BRANCH:-ingest/pending}"
DAY="$(date -u +%F)"
open_pr() { gh pr list --head "$PENDING" --state open --json number --jq '.[0].number // empty'; }

case "${1:-}" in
overlay)
  if ! git fetch -q origin "+refs/heads/$PENDING:refs/remotes/origin/$PENDING" 2>/dev/null; then echo "Nothing is waiting for review."; exit 0; fi
  if [ -z "$(open_pr)" ]; then echo "$PENDING exists but its pull request is not open: not carried."; exit 0; fi
  git fetch -q --unshallow origin 2>/dev/null || true          # a shallow checkout has no merge base to find
  base="$(git merge-base HEAD "origin/$PENDING")"
  carried=0
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    git diff --quiet "$base" HEAD -- "$f" || { echo "main changed $f since; main's copy stands."; continue; }
    if git cat-file -e "origin/$PENDING:$f" 2>/dev/null; then git checkout -q "origin/$PENDING" -- "$f"; else rm -f -- "$f"; fi
    carried=$((carried + 1))
  done < <(git diff --name-only --no-renames "$base" "origin/$PENDING" -- data/ingested data/staging data/indicators 2>/dev/null || true)
  git reset -q
  echo "Carried $carried waiting file(s) from $PENDING; tonight's re-read goes on top."
  ;;
settle)
  out="$(mktemp -d)"
  for d in data/ingested data/staging data/indicators; do [ ! -e "$d" ] || git add -A "$d"; done
  if git diff --cached --quiet; then
    echo "No source changed."; : > "$out/refresh.txt"; : > "$out/real.txt"
  else
    "$HERE/pipeline/node_modules/.bin/tsx" "$HERE/pipeline/src/ingest-changes.ts" --write "$out"
  fi
  git reset -q
  if [ -s "$out/refresh.txt" ]; then
    git add --pathspec-from-file="$out/refresh.txt"
    git commit -q -m "Open data re-read on $DAY: only the fetch dates changed"
    git push -q
  fi
  pr="$(open_pr)"
  if [ ! -s "$out/real.txt" ]; then
    # Merged, or the source went back to what main says: nothing is waiting any more.
    if [ -n "$pr" ]; then gh pr close "$pr" --delete-branch --comment "Nothing is waiting any more as of $DAY: every file now matches main apart from its fetch dates."; fi
    exit 0
  fi
  start="$(git rev-parse --abbrev-ref HEAD)"
  git checkout -q -B "$PENDING"
  git add --pathspec-from-file="$out/real.txt"
  git commit -q -m "Open data waiting for review, as read on $DAY"
  # --force-with-lease needs the server's real state to hold the push to (what failed the second run on 2026-09-21).
  git fetch -q origin "+refs/heads/$PENDING:refs/remotes/origin/$PENDING" 2>/dev/null || true
  git push -q -u --force-with-lease origin "$PENDING"
  title="Open data waiting for review (read $DAY)"
  # Any failure to open or update the pull request fails this step, so the run goes red (2026-09-24: a blanket
  # "already open" hid three nights of a repository setting refusing it). The site was already published above.
  if [ -n "$pr" ]; then gh pr edit "$pr" --title "$title" --body-file "$out/summary.md"
  else gh pr create --title "$title" --body-file "$out/summary.md" --base main --head "$PENDING"; fi
  git checkout -q "$start"
  ;;
*) echo "usage: $0 overlay|settle"; exit 2 ;;
esac
