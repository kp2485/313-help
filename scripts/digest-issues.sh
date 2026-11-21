#!/usr/bin/env bash
# Turns what pipeline/src/digest.ts wrote into GitHub issues (.github/workflows/digest.yml; DECISIONS 2026-11-21).
# An issue assigned to the repository's owner is the email: GitHub sends it, so this repository holds no mail
# service, no secret for one and nobody's address.
#
#   scripts/digest-issues.sh alarm  <dir>   every day: open ONE alarm issue when <dir>/alarm.md says the nightly
#                                           publish needs a person; close it when the file is empty again
#   scripts/digest-issues.sh weekly <dir>   Mondays: open the week's review from <dir>/digest.md and close last week's
#
# One alarm issue, not one a day: while it is open nothing more is posted, so a week-long outage is one email and
# not seven. The weekly issue replaces the one before it, so there is only ever one to look at.
set -euo pipefail
dir="${2:?usage: $0 alarm|weekly <dir>}"
OWNER="${DIGEST_ASSIGNEE:-${GITHUB_REPOSITORY_OWNER:?}}"
DAY="$(date -u +%F)"
open_issues() { gh issue list --label "$1" --state open --json number --jq '.[].number'; }

case "${1:-}" in
alarm)
  gh label create publish-alarm --force --color B60205 --description "The nightly publish needs a person" >/dev/null
  open="$(open_issues publish-alarm | head -n 1)"
  if [ -s "$dir/alarm.md" ]; then
    if [ -n "$open" ]; then echo "The alarm is already open (#$open); nothing more is posted."
    else gh issue create --title "The nightly publish needs you ($DAY)" --body-file "$dir/alarm.md" --label publish-alarm --assignee "$OWNER"; fi
  elif [ -n "$open" ]; then
    gh issue close "$open" --comment "Healthy again as of $DAY: a nightly run succeeded and the site's data is fresh."
  else echo "The nightly publish is healthy."; fi
  ;;
weekly)
  gh label create weekly-review --force --color 0E8A16 --description "What needs a person this week" >/dev/null
  old="$(open_issues weekly-review)"
  new="$(gh issue create --title "Weekly review: $DAY" --body-file "$dir/digest.md" --label weekly-review --assignee "$OWNER")"
  echo "$new"
  for i in $old; do gh issue close "$i" --comment "Replaced by this week's review: $new"; done
  ;;
*) echo "usage: $0 alarm|weekly <dir>"; exit 2 ;;
esac
