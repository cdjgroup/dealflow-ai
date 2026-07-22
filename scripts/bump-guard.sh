#!/usr/bin/env bash
# ============================================================================
# bump-guard.sh — the auto-version-bump decision guard.
# ============================================================================
# Decides whether auto-version-bump.yml should BUMP, SKIP, or fail loudly
# (ERROR) for the next patch version. Extracted from inline workflow YAML so
# the logic that silently wedged (2026-07-15 → 2026-07-17) is unit-testable.
#
# The wedge: a race left an orphan tag vX.Y.Z pointing at a commit that never
# landed on main; the old "tag exists → skip" check then skipped every later
# run green forever. This guard distinguishes a genuinely-already-bumped tag
# (reachable from the compare ref → SKIP, green) from an orphan tag (exists but
# NOT reachable → ERROR, red) so the wedge is loud, not silent. Paired with an
# atomic `git push ... --atomic` in the workflow, which prevents the orphan tag
# from ever being created (a rejected main push no longer leaves a tag behind).
#
# Usage:  bump-guard.sh <version_file> [<compare_ref>]
#   version_file : path to the VERSION source (semver via grep)
#   compare_ref  : git ref to test tag reachability against (default: HEAD)
#
# stdout (single line):  BUMP <next> | SKIP <reason> | ERROR <reason>
# exit:  0 = BUMP or SKIP    2 = ERROR (wedge — caller must fail)    1 = usage/precondition
# ============================================================================
set -euo pipefail

VERSION_FILE="${1:-}"
COMPARE_REF="${2:-HEAD}"

if [ -z "$VERSION_FILE" ]; then
    echo "ERROR usage: bump-guard.sh <version_file> [<compare_ref>]"
    exit 1
fi
if [ ! -f "$VERSION_FILE" ]; then
    # Decision/reason line goes to STDOUT (per the Interface Contract) so the
    # workflow's `DECISION=$(...)` capture carries the reason into its
    # ::error:: annotation, not just the raw log. (st-review-code High-1.)
    echo "ERROR version file not found: $VERSION_FILE"
    exit 1
fi

# `|| true`: under `set -o pipefail`, a no-match grep would kill the script on
# the assignment (the exact silent-pipefail-death class from Insight #75). Guard
# it and validate the captured value explicitly instead.
CURRENT=$(grep -oE '[0-9]+\.[0-9]+\.[0-9]+' "$VERSION_FILE" | head -1) || true
if [ -z "$CURRENT" ]; then
    echo "ERROR could not parse a semver from $VERSION_FILE"
    exit 1
fi

MAJOR="${CURRENT%%.*}"
_rest="${CURRENT#*.}"
MINOR="${_rest%%.*}"
PATCH="${_rest#*.}"
# `10#` forces base-10 so a (non-project) patch like 08/09 can't hit bash's
# octal parse ("value too great for base"). Fail-closed either way, but this
# keeps the arithmetic total. (st-review-security L2.)
NEXT="${MAJOR}.${MINOR}.$((10#$PATCH + 1))"
TAG="v${NEXT}"

# No tag for the next version → nothing has claimed it → bump.
if ! git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null 2>&1; then
    echo "BUMP ${NEXT}"
    exit 0
fi

# The tag ref exists. Resolve it to a commit. A tag that cannot deref to a
# commit (points at a blob/tree, or its commit object is gone) is a broken tag,
# never a reason to bump — fail loudly.
tag_commit=$(git rev-parse -q --verify "${TAG}^{commit}" 2>/dev/null) || tag_commit=""
if [ -z "$tag_commit" ]; then
    echo "ERROR tag ${TAG} exists but does not resolve to a commit (dangling/broken tag)"
    exit 2
fi

# Reachable from the compare ref → the bump genuinely already landed → skip green.
# Not reachable → orphan tag from a lost push race → the wedge → fail loudly so an
# operator deletes the orphan tag (or re-runs) instead of it silently skipping.
if git merge-base --is-ancestor "$tag_commit" "$COMPARE_REF" 2>/dev/null; then
    echo "SKIP ${TAG} already reachable from ${COMPARE_REF}"
    exit 0
else
    echo "ERROR tag ${TAG} exists but is not reachable from ${COMPARE_REF} — orphan tag from a prior run whose version commit never landed on ${COMPARE_REF}. Delete the orphan tag (git push --delete origin ${TAG}) then re-run."
    exit 2
fi
