"""Pull-based, watermark-bounded CI health backfill.

Queries `gh run list` for commits missing a recorded CI conclusion and
appends the result to the local event log via `append_event`. Fails closed
on any `git`/`gh` subprocess error (non-zero exit, timeout, or missing
binary) -- never raises out of `backfill_ci_health`. Dedup key is the
watermark file, not the event log itself -- a deleted `.context/metrics`
directory or a concurrent worktree can produce a duplicate
`ci_run_backfilled` event for the same commit; the watermark bounds
*re-querying*, not event-log uniqueness. See `.sherlock-plan.md` for the
full interface contract.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

try:
    from scripts.fw_event_log import _get_metrics_dir, _health_record, append_event
except ImportError:  # direct-script execution
    from fw_event_log import _get_metrics_dir, _health_record, append_event  # type: ignore[import-not-found]

_WATERMARK_FILENAME = "ci-backfill-watermark.json"
_HEX40 = re.compile(r"[0-9a-f]{40}")
_GH_RUN_LIMIT = 30
_FAILURE_CONCLUSIONS = frozenset({"failure", "timed_out"})


@dataclass(frozen=True)
class BackfillResult:
    appended: int
    skipped_existing: int
    gh_unavailable: bool


def _load_watermark(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return {}
        # Bound every value to a full 40-char hex commit SHA. A corrupted or
        # hand-edited watermark file (non-string value, truncated hash, or a
        # dash-leading string) must not reach `_check_ancestor`/`git
        # merge-base` as a raw argument -- this is the one and only gate
        # between file contents and a subprocess argv.
        return {
            key: value
            for key, value in data.items()
            if isinstance(key, str) and isinstance(value, str) and _HEX40.fullmatch(value)
        }
    except FileNotFoundError:
        return {}
    except Exception:
        _health_record(path.parent, "watermark_load_failed")
        return {}


def _save_watermark(path: Path, data: dict) -> None:
    tmp_name: str | None = None
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(
            dir=str(path.parent), prefix=".ci-backfill-watermark-", suffix=".tmp"
        )
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle)
        os.replace(tmp_name, path)
    except Exception:
        _health_record(path.parent, "watermark_save_failed")
        if tmp_name is not None:
            try:
                os.unlink(tmp_name)
            except OSError:
                pass


def _list_commits(branch: str | None, lookback_commits: int, timeout_seconds: float) -> list[str] | None:
    ref = branch or "HEAD"
    if ref.startswith("-"):
        # A dash-leading ref is parsed by `git log` as an option, not a
        # revision -- e.g. `--output=<path>` silently writes an
        # attacker-chosen file. Reject rather than pass through.
        return None
    try:
        result = subprocess.run(
            ["git", "log", "--format=%H", "-n", str(lookback_commits), ref],
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
    except (subprocess.TimeoutExpired, OSError):
        return None
    lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    return lines[:lookback_commits]


def _check_ancestor(sha: str, branch: str | None, timeout_seconds: float) -> bool:
    ref = branch or "HEAD"
    if ref.startswith("-"):
        # Same argument-injection guard as `_list_commits`; a rejected ref
        # is treated the same as an unverifiable ancestry (see except below).
        return False
    try:
        result = subprocess.run(
            ["git", "merge-base", "--is-ancestor", sha, ref],
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
    except (subprocess.TimeoutExpired, OSError):
        # Unverifiable ancestry is treated the same as a non-ancestor watermark:
        # callers already fall back to the bounded lookback window from HEAD.
        return False
    return result.returncode == 0


def _gh_runs_for_commit(
    sha: str, branch: str | None, timeout_seconds: float
) -> tuple[list[dict] | None, bool]:
    """Fetch every run recorded for `sha` (not just the most recent one).

    A single commit commonly has multiple parallel workflow runs (this
    repo has 12 workflow files); reading only the most recent one via
    `--limit 1` can land on a non-blocking workflow (e.g. a compatibility
    or dependency-bot lane) while a failed blocking `CI` run for the same
    commit goes unrecorded. `_rollup_conclusion` below resolves the full
    set into a single failure-dominant conclusion.
    """
    cmd = [
        "gh", "run", "list", "--json", "conclusion,databaseId",
        "--limit", str(_GH_RUN_LIMIT), "--commit", sha,
    ]
    if branch:
        cmd += ["--branch", branch]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_seconds, check=False)
    except (subprocess.TimeoutExpired, OSError):
        return None, False
    if result.returncode != 0:
        return None, False
    try:
        runs = json.loads(result.stdout or "[]")
    except json.JSONDecodeError:
        return None, False
    if not isinstance(runs, list):
        return None, False
    if not all(isinstance(run, dict) for run in runs):
        # A genuinely empty list ("no runs for this commit") is a legitimate
        # result -- distinct from a non-empty list containing entries that
        # don't match the documented run-object shape, which is malformed
        # and must fail closed rather than silently becoming "no runs".
        return None, False
    return runs, True


def _rollup_conclusion(runs: list[dict]) -> str | None:
    """Resolve every run for one commit into a single conclusion.

    Any run still queued/in-progress (`conclusion is None`) makes the
    whole commit non-terminal -- the caller must not record it yet, since
    a run that later fails would otherwise be permanently missed. Once
    every run has concluded, any failure/timed-out run makes the commit
    "failure"; otherwise "success".
    """
    conclusions = [run.get("conclusion") for run in runs]
    if any(conclusion is None for conclusion in conclusions):
        return None
    if any(conclusion in _FAILURE_CONCLUSIONS for conclusion in conclusions):
        return "failure"
    return "success"


def _compute_new_commits_range(
    prior_sha: str | None,
    commits: list[str],
    branch: str | None,
    timeout_seconds: float,
) -> tuple[list[str], int]:
    """Compute which commits (newest-first, same order as `commits`) are new
    since `prior_sha`, and how many were already covered by the watermark.

    No prior watermark -> everything in `commits` is new, 0 skipped.
    Prior watermark still an ancestor of HEAD and present in the bounded
    `commits` window -> only commits newer than it are new, 1 skipped.
    Otherwise (non-ancestor watermark from force-push/rebase/branch
    recreation, or a watermark that has rotated out of the bounded window)
    -> falls back to the full bounded window, 0 skipped, per ADR-066 AC-2 / AC-4's
    shared fallback path.
    """
    if not prior_sha:
        return commits, 0

    # Ancestry probe (pinned interface requirement): a non-ancestor
    # watermark means the incremental range can't be trusted, so both
    # branches below converge on the same bounded-window-from-HEAD
    # computation already used for log rotation. Membership in the
    # bounded window is also required: a watermark that IS still an
    # ancestor but has rotated out of the window must take the same
    # fallback, not an unbounded slice back to it.
    watermark_is_ancestor = _check_ancestor(prior_sha, branch, timeout_seconds)
    if watermark_is_ancestor and prior_sha in commits:
        idx = commits.index(prior_sha)
        return commits[:idx], 1
    return commits, 0


def backfill_ci_health(
    *,
    branch: str | None = None,
    lookback_commits: int = 20,
    timeout_seconds: float = 3.0,
) -> BackfillResult:
    """Query `gh run list` for recent commits missing from the event log
    and append their conclusion. Fails closed on any gh error; never raises.

    Range computation: verifies the watermark SHA is still an ancestor of
    HEAD (`git merge-base --is-ancestor`) before diffing against it. On a
    non-ancestor watermark (force-push/rebase/branch-recreation) or a
    rotated-past watermark, falls back to `lookback_commits` from HEAD
    rather than walking an unbounded or invalid local git range.

    Watermark writes: temp-file-then-`os.replace()` atomic swap only --
    never an in-place edit, never `flock()`-only coordination. Required
    for safety under concurrent git-worktree session-sync launches.
    """
    metrics_dir = _get_metrics_dir()
    watermark_path = metrics_dir / _WATERMARK_FILENAME
    state = _load_watermark(watermark_path)
    branch_key = branch or "HEAD"
    prior_sha = state.get(branch_key)

    commits = _list_commits(branch, lookback_commits, timeout_seconds)
    if commits is None:
        _health_record(metrics_dir, "git_log_failed")
        return BackfillResult(appended=0, skipped_existing=0, gh_unavailable=True)
    if not commits:
        return BackfillResult(appended=0, skipped_existing=0, gh_unavailable=False)

    head_sha = commits[0]

    if prior_sha == head_sha:
        # Nothing has landed since the last watermark -- skip entirely,
        # no gh re-query for an already-processed tip.
        return BackfillResult(appended=0, skipped_existing=1, gh_unavailable=False)

    new_commits, skipped_existing = _compute_new_commits_range(
        prior_sha, commits, branch, timeout_seconds
    )

    # Process oldest-to-newest (reverse of `commits`' newest-first order) so
    # that a mid-loop gh failure can checkpoint the watermark to the last
    # commit actually processed: `new_commits[:idx]`-style range computation
    # above assumes the watermark marks a contiguous "everything newer still
    # needs processing" boundary, which only holds if partial progress
    # advances from the old watermark forward, not backward from HEAD.
    appended = 0
    last_processed_sha: str | None = None
    for sha in reversed(new_commits):
        runs, is_available = _gh_runs_for_commit(sha, branch, timeout_seconds)
        if not is_available:
            _health_record(metrics_dir, "gh_run_list_failed")
            if last_processed_sha is not None:
                state[branch_key] = last_processed_sha
                _save_watermark(watermark_path, state)
            return BackfillResult(
                appended=appended, skipped_existing=skipped_existing, gh_unavailable=True
            )
        if not runs:
            # No CI run exists for this commit at all (e.g. a workflow's
            # path filter skipped it) -- distinct from a non-terminal
            # conclusion below. There is nothing to become terminal later,
            # so this must not block the watermark from advancing past it.
            last_processed_sha = sha
            continue
        conclusion = _rollup_conclusion(runs)
        if conclusion is None:
            # At least one run for this commit is still queued/in-progress.
            # Stop here (oldest-to-newest) rather than recording a
            # placeholder and advancing past it: the watermark boundary
            # means "everything newer still needs processing", so leaving
            # it at the last *terminal* commit lets the next sync re-query
            # this commit once its CI finishes -- otherwise a run that
            # later fails is never recorded.
            break
        last_processed_sha = sha
        failing_run = next(
            (run for run in runs if run.get("conclusion") in _FAILURE_CONCLUSIONS), None
        )
        run_id = (failing_run or runs[0]).get("databaseId")
        append_event(
            "ci_run_backfilled",
            category="ci_health",
            attributes={"commit_sha": sha, "conclusion": conclusion, "run_id": run_id},
        )
        appended += 1

    if last_processed_sha is not None:
        state[branch_key] = last_processed_sha
        _save_watermark(watermark_path, state)

    return BackfillResult(appended=appended, skipped_existing=skipped_existing, gh_unavailable=False)


def main() -> int:
    """CLI entrypoint for session-sync wiring (`scripts/_session_common.sh`).

    Always exits 0 -- `backfill_ci_health` already fails closed for expected
    subprocess/parse failures, but an unexpected exception (e.g. a bug, or a
    permissions error on the metrics directory) must not propagate out and
    fail the session-sync launch it's wired into.
    """
    try:
        backfill_ci_health()
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
