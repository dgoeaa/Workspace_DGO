#!/usr/bin/env bash
# Declare the single repo+branch a Claude Code session may touch.
# Run this OUTSIDE a locked session (the guard blocks a session from editing its own lock).
#
#   scripts/lock-branch.sh                      # lock to the currently checked-out branch
#   scripts/lock-branch.sh my/feature-branch    # lock to a named branch
#   scripts/lock-branch.sh --show               # print the current lock
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
lock="$root/.claude/branch-lock.json"

if [[ "${1:-}" == "--show" ]]; then
  cat "$lock"
  exit 0
fi

branch="${1:-$(git -C "$root" rev-parse --abbrev-ref HEAD)}"
url="$(git -C "$root" remote get-url origin)"
repo="$(printf '%s' "$url" | sed -E 's#^.*[:/]([^/]+/[^/]+?)(\.git)?$#\1#')"

if ! git -C "$root" show-ref --verify --quiet "refs/heads/$branch" \
   && ! git -C "$root" show-ref --verify --quiet "refs/remotes/origin/$branch"; then
  echo "warning: branch '$branch' does not exist yet locally or on origin" >&2
fi

tmp="$(mktemp)"
jq --arg repo "$repo" --arg branch "$branch" \
   '.repo = $repo | .branch = $branch' "$lock" > "$tmp"
mv "$tmp" "$lock"

echo "locked to $repo @ $branch"
echo "checked out: $(git -C "$root" rev-parse --abbrev-ref HEAD)"
