#!/usr/bin/env bash
# Prints the repo state the caravela-next skill compares against docs/HANDOFF.md.
# Read-only: no fetch, no device calls.
set -u
cd "$(git rev-parse --show-toplevel)" || exit 1

handoff_date=$(grep -m1 -o 'Last updated [0-9-]*' docs/HANDOFF.md | awk '{print $3}')

echo "== Branch"
git branch --show-current

echo
echo "== Uncommitted changes"
git status --short || true

echo
handoff_commit=$(git log -1 --format=%h main -- docs/HANDOFF.md)
echo "== Handoff: 'Last updated ${handoff_date:-unknown}', last committed in"
git log -1 --format='%h %ad %s' --date=short "$handoff_commit"

echo
echo "== Commits on main after that handoff commit"
git log --format='%h %ad %s' --date=short "$handoff_commit"..main

echo
echo "== Worktrees"
git worktree list

echo
echo "== task/* and probe/* branches (merged into main?)"
for b in $(git for-each-ref --format='%(refname:short)' refs/heads/task refs/heads/probe); do
  if git merge-base --is-ancestor "$b" main; then state=merged; else state="NOT merged, $(git rev-list --count main.."$b") commit(s) ahead"; fi
  echo "$b: $state"
done

echo
echo "== main vs origin/main (last fetch)"
git rev-list --left-right --count main...origin/main 2>/dev/null | awk '{print "ahead " $1 ", behind " $2}'

echo
echo "== Open items in docs/PUBLISHING.md 'Plan to v1.0'"
sed -n '/^## Plan to v1.0/,/^### After v1.0/p' docs/PUBLISHING.md | grep -n -- '- \[ \]' | cut -c1-160

echo
echo "== Environment"
echo "HERDR_ENV=${HERDR_ENV:-unset} HERDR_PANE_ID=${HERDR_PANE_ID:-unset}"
[ -f docs/LOCAL.md ] && echo "docs/LOCAL.md present" || echo "docs/LOCAL.md MISSING (server address)"
[ -d src/vendor/shaka ] && echo "src/vendor/shaka present" || echo "src/vendor/shaka missing (run scripts/setup-shaka.sh before a release build)"
