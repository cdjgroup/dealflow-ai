"""Conformance scorer for Sherlock/Holmes sessions.

Compares a .sherlock-plan.md against the actual git diff to produce a
scorecard covering file coverage, AC coverage, scope creep, hook
compliance, review gate, and a composite weighted score.

Schema v2 (2026-04-17): sub-scores use an inconclusive sentinel (None)
when signal is absent; None values are excluded from both numerator and
denominator when computing the composite (OpenSSF Scorecard pattern).
Scorecards include enrichment metadata (session_id, plan_hash, git_sha,
sherlock_tier, branch, project_root) at top level for multi-project
aggregation.

Usage:
    python3 scripts/fw_conformance.py --plan .sherlock-plan.md [--base HEAD~1] [--save]
"""

from __future__ import annotations

import hashlib
import json as _json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

#: A sub-score is either a float in [0.0, 1.0] or None for "signal absent".
SubScore = Optional[float]

_SCHEMA_VERSION = 2

#: Composite weighting — sums to 1.0 when every sub-score is observed.
_WEIGHTS: dict[str, float] = {
    "file_coverage": 0.25,
    "ac_coverage": 0.30,
    "scope_creep": 0.15,
    "hook_compliance": 0.15,
    "review_gate": 0.15,
}

#: Filename patterns scanned by _check_ac_coverage. A file qualifies as a
#: test file if its name matches any of these glob-like patterns.
_TEST_FILE_PATTERNS: tuple[str, ...] = (
    "test_*.py",
    "*_test.py",
    "*test*.py",
    "*spec*.py",
    "*.test.ts",
    "*.test.tsx",
    "*.spec.ts",
    "*.spec.tsx",
    "*_test.go",
    "test_*.go",
)

#: Recognised Sherlock tier names.
_SHERLOCK_TIERS: frozenset[str] = frozenset({"Hudson", "Sherlock Lite", "Full Sherlock"})


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _parse_planned_files(plan_md: str) -> list[dict[str, str]]:
    """Extract rows from the Planned Files markdown table."""
    results = []
    in_table = False
    header_found = False
    separator_found = False

    for line in plan_md.splitlines():
        stripped = line.strip()

        if re.match(r"^##\s+Planned Files", stripped):
            in_table = True
            header_found = False
            separator_found = False
            continue

        if in_table:
            if not stripped:
                if separator_found:
                    break
                continue

            if stripped.startswith("|"):
                cells = [c.strip() for c in stripped.split("|") if c.strip() != ""]
                if not cells:
                    continue

                if not header_found:
                    header_found = True
                    continue

                if not separator_found:
                    separator_found = True
                    continue

                if len(cells) >= 2:
                    results.append({"file": cells[0], "action": cells[1]})
            else:
                if separator_found:
                    break

    return results


def _parse_acceptance_criteria(plan_md: str) -> list[str]:
    """Extract AC-# identifiers from the Acceptance Criteria section."""
    results = []
    for match in re.finditer(r"###\s+(AC-\d+):", plan_md):
        results.append(match.group(1))
    return results


def _parse_sherlock_tier(plan_md: str) -> str:
    """Parse the Sherlock tier declared in a plan's header.

    Looks for a ``Tier: <name>`` line where ``<name>`` is one of
    ``Hudson``, ``Sherlock Lite``, or ``Full Sherlock``. Returns the
    literal tier name on match, else ``"unknown"``.
    """
    for match in re.finditer(r"(?m)^\s*Tier:\s*(.+?)\s*$", plan_md):
        candidate = match.group(1).strip()
        if candidate in _SHERLOCK_TIERS:
            return candidate
    return "unknown"


def _filename_matches_test_pattern(name: str) -> bool:
    """Return True if ``name`` matches any recognised test-file pattern."""
    from fnmatch import fnmatch
    return any(fnmatch(name, pattern) for pattern in _TEST_FILE_PATTERNS)


def _check_file_coverage(planned: list[dict[str, str]], actual: list[str]) -> dict:
    """Compare planned vs actual changed files."""
    if not planned:
        return {
            "score": 0.0,
            "matched": [],
            "missing": [],
            "unplanned": list(actual),
        }

    planned_set = {row["file"] for row in planned}
    actual_set = set(actual)

    matched = list(planned_set & actual_set)
    missing = list(planned_set - actual_set)
    unplanned = list(actual_set - planned_set)

    score = len(matched) / len(planned_set)

    return {
        "score": score,
        "matched": matched,
        "missing": missing,
        "unplanned": unplanned,
    }


def _check_ac_coverage(
    acs: list[str],
    test_dir: str,
    plan_path: Optional[str] = None,
) -> dict:
    """Search test files for AC-# references.

    Scans ``test_dir`` recursively for files whose names match a
    recognised test-file pattern. When ``plan_path`` is provided, the
    plan file is excluded from the scan so that AC-# headers in the
    plan itself do not self-match.

    Returns a dict with ``score``, ``covered`` and ``missing`` keys.
    The score is a float in [0.0, 1.0] when at least one test file is
    found, ``None`` when zero test-pattern files are found (inconclusive
    — no signal), and ``0.0`` when the supplied AC list is empty.

    Note: 2-arg callers (no ``plan_path``) receive legacy behaviour —
    every file under ``test_dir`` is scanned, including non-test-pattern
    files and the plan itself if present. New callers should pass
    ``plan_path`` to opt into self-match exclusion + test-file filtering.
    """
    if not acs:
        return {"score": 0.0, "covered": [], "missing": []}

    test_path = Path(test_dir)
    if not test_path.exists():
        return {"score": 0.0, "covered": [], "missing": list(acs)}

    plan_resolved: Optional[Path] = None
    if plan_path is not None:
        try:
            plan_resolved = Path(plan_path).resolve()
        except OSError:
            plan_resolved = None

    content_buffer: list[str] = []
    matched_any_test_file = False

    for candidate in test_path.rglob("*"):
        if not candidate.is_file():
            continue
        if plan_resolved is not None:
            try:
                if candidate.resolve() == plan_resolved:
                    continue
            except OSError:
                pass
        # When plan_path is NOT supplied we preserve the legacy behaviour
        # (scan all files) to keep older callers working; when it IS
        # supplied we filter to test-file patterns.
        if plan_path is not None and not _filename_matches_test_pattern(candidate.name):
            continue
        matched_any_test_file = True
        try:
            content_buffer.append(candidate.read_text(errors="replace"))
        except OSError:
            pass

    # Inconclusive signal: test_dir exists, plan_path-driven filter applied,
    # yet no files matched any test-name pattern → score=None.
    if plan_path is not None and not matched_any_test_file:
        return {"score": None, "covered": [], "missing": list(acs)}

    combined = "\n".join(content_buffer)

    covered = []
    missing = []
    for ac in acs:
        # Word-boundary match: "AC-1" must not match within "AC-10" or "AC-100".
        if re.search(rf"\b{re.escape(ac)}\b", combined):
            covered.append(ac)
        else:
            missing.append(ac)

    score = len(covered) / len(acs)

    return {"score": score, "covered": covered, "missing": missing}


def _check_scope_creep(planned: list[dict[str, str]], numstat: str) -> dict:
    """Partition lines changed into planned vs unplanned.

    ``numstat`` format per line: ``insertions<TAB>deletions<TAB>filepath``.
    Binary files (``-\\t-\\t<file>``) are silently skipped.

    Returns a dict with ``score``, ``planned_lines`` and
    ``unplanned_lines``. The score is a float in [0.0, 1.0] when the
    diff has at least one non-zero line change, and ``None`` when the
    diff is empty (inconclusive — no signal to measure).
    """
    planned_files = {row["file"] for row in planned}

    planned_lines = 0
    unplanned_lines = 0

    for line in numstat.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        try:
            added = int(parts[0])
            deleted = int(parts[1])
        except ValueError:
            continue
        filepath = parts[2]
        total = added + deleted

        if filepath in planned_files:
            planned_lines += total
        else:
            unplanned_lines += total

    total_lines = planned_lines + unplanned_lines
    if total_lines == 0:
        return {"score": None, "planned_lines": 0, "unplanned_lines": 0}

    score = planned_lines / total_lines
    return {
        "score": score,
        "planned_lines": planned_lines,
        "unplanned_lines": unplanned_lines,
    }


def _compute_composite(scores: dict[str, SubScore]) -> tuple[SubScore, float]:
    """Return ``(composite, coverage_ratio)`` from weighted sub-scores.

    Sub-scores whose value is ``None`` are excluded from BOTH the
    numerator and the denominator (OpenSSF Scorecard pattern). The
    coverage ratio is ``observed_sub_scores / 5``.

    When every sub-score is ``None`` the composite is ``None`` and the
    coverage ratio is ``0.0`` — never ``0.0 / 0.0``.
    """
    numerator = 0.0
    denominator = 0.0
    observed = 0
    total_slots = len(_WEIGHTS)

    for key, weight in _WEIGHTS.items():
        value = scores.get(key)
        if value is None:
            continue
        numerator += weight * float(value)
        denominator += weight
        observed += 1

    coverage_ratio = observed / total_slots if total_slots else 0.0

    if denominator == 0:
        return (None, coverage_ratio)

    composite = numerator / denominator
    return (float(composite), coverage_ratio)


def _import_fw_event_log():
    """Import ``fw_event_log`` whether running as CLI (scripts/ on path)
    or via pytest (scripts as package). Returns the module, or ``None``
    if neither import path works.
    """
    try:
        import fw_event_log  # type: ignore[import-not-found]
        return fw_event_log
    except ImportError:
        pass
    try:
        from scripts import fw_event_log as _mod  # type: ignore[import-not-found]
        return _mod
    except ImportError:
        return None


def _compute_hook_compliance() -> SubScore:
    """Compliance ratio derived from protocol events in the event log.

    Returns a float in [0.0, 1.0] when protocol events exist, computed
    as ``1.0 - (blocks / total)``. Returns ``None`` when the event log
    is empty, the event-log module fails to load, or metrics are
    disabled — signal absent is inconclusive, not compliant.
    """
    mod = _import_fw_event_log()
    if mod is None:
        return None
    try:
        events = mod.read_events(category="protocol")
    except Exception:
        return None
    if not events:
        return None
    blocks = sum(1 for e in events if e.get("event") == "block")
    total = len(events)
    if total <= 0:
        return None
    return 1.0 - (blocks / total)


def _compute_review_gate() -> SubScore:
    """Review-gate compliance scoped to the current session.

    Returns ``1.0`` when ``agent_spawn`` or ``task_completed`` events
    exist for the current session (matched by ``sid``). Returns ``None``
    when no session id is resolvable, when the event-log module fails
    to load, or when no events match the current session.
    """
    mod = _import_fw_event_log()
    if mod is None:
        return None

    try:
        session_id = mod.get_session_id()
    except Exception:
        return None
    if not session_id or session_id == "unknown":
        return None

    try:
        spawn_events = mod.read_events(event_type="agent_spawn")
        task_events = mod.read_events(event_type="task_completed")
    except Exception:
        return None

    def _for_session(events: list[dict]) -> list[dict]:
        return [e for e in events if e.get("sid") == session_id]

    if _for_session(spawn_events) or _for_session(task_events):
        return 1.0
    return None


def _compute_plan_hash(plan_content: str) -> str:
    """Return the first 12 hex chars of sha256 over the plan bytes."""
    return hashlib.sha256(plan_content.encode("utf-8")).hexdigest()[:12]


def _git_output(args: list[str]) -> str:
    """Run ``git <args>`` and return stripped stdout; empty string on failure."""
    try:
        result = subprocess.run(
            ["git", *args],
            capture_output=True,
            text=True,
            check=False,
        )
    except Exception:
        return ""
    return (result.stdout or "").strip()


def _sanitize_project_root(project_root: str) -> str:
    """Redact the user's home-directory segment from an absolute project path.

    Keeps the value absolute (required by the schema v2 contract — see
    AC-2 T-5 / ``test_ac2_t5_project_root_is_absolute_path``) while removing
    the OS-specific home-directory component, which embeds the local
    username (e.g. ``$HOME/...`` on macOS). Per ADR-007 bright-line
    sanitization: a scorecard JSON file can outlive the machine it was
    written on (bug reports, a zipped-up ``.context/``, cross-project
    aggregation reading another user's metrics dir), so the username
    shouldn't be baked into every scorecard by default.

    Paths outside the home directory are returned unchanged — there's no
    username segment to redact.

    Assumes ``project_root`` and ``Path.home()`` agree on case. On a
    case-insensitive-but-case-preserving filesystem (default macOS/APFS),
    ``Path.resolve()`` does not correct case — if the two ever disagree
    (e.g. ``$HOME`` case differs from what ``git rev-parse
    --show-toplevel`` reports), ``relative_to`` raises and this falls
    through to the unredacted-passthrough branch below.
    """
    resolved = Path(project_root).resolve()
    try:
        relative = resolved.relative_to(Path.home().resolve())
    except (ValueError, RuntimeError):
        return str(resolved)
    return str(Path("/<home>") / relative)


def _compute_schema_version_2_enrichment(
    plan_path: str,
    base_ref: str,
    plan_content: str,
    sherlock_tier: str,
) -> dict:
    """Collect v2 enrichment metadata for a scorecard.

    Returns a dict with ``timestamp``, ``session_id``, ``plan_hash``,
    ``git_sha``, ``base_ref``, ``sherlock_tier``, ``branch`` and
    ``project_root`` keys. Never raises — best-effort values are
    returned with sensible fallbacks on failure.
    """
    mod = _import_fw_event_log()
    try:
        session_id = (mod.get_session_id() if mod is not None else "unknown") or "unknown"
    except Exception:
        session_id = "unknown"

    git_sha = _git_output(["rev-parse", "HEAD"])
    branch = _git_output(["rev-parse", "--abbrev-ref", "HEAD"])
    project_root = _git_output(["rev-parse", "--show-toplevel"]) or str(Path.cwd())

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "session_id": session_id,
        "plan_hash": _compute_plan_hash(plan_content),
        "git_sha": git_sha,
        "base_ref": base_ref,
        "sherlock_tier": sherlock_tier,
        "branch": branch,
        "project_root": _sanitize_project_root(project_root),
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def score_session(plan_path: str, base_ref: str = "HEAD~1") -> dict:
    """Score a Sherlock/Holmes session against its plan.

    Returns a scorecard dict with ``status``, ``scores`` (sub-scores +
    composite + coverage_ratio), ``details`` (file lists and AC sets)
    and ``plan_path``/``base_ref`` for downstream enrichment by
    ``save_scorecard``.

    On missing plan file or missing Planned Files table, returns an
    error scorecard with all sub-scores at ``0.0``.
    """
    _zero_scores = {
        "file_coverage": 0.0,
        "ac_coverage": 0.0,
        "scope_creep": 0.0,
        "hook_compliance": 0.0,
        "review_gate": 0.0,
        "composite": 0.0,
    }

    plan_file = Path(plan_path)
    if not plan_file.exists():
        return {
            "status": "error",
            "message": f"Plan file not found: {plan_path}",
            "scores": dict(_zero_scores),
            "details": {},
        }

    plan_md = plan_file.read_text()

    planned = _parse_planned_files(plan_md)
    if not planned:
        return {
            "status": "error",
            "message": "No Planned Files table found in plan",
            "scores": dict(_zero_scores),
            "details": {},
        }

    acs = _parse_acceptance_criteria(plan_md)

    diff_names_result = subprocess.run(
        ["git", "diff", "--name-only", base_ref],
        capture_output=True,
        text=True,
    )
    diff_numstat_result = subprocess.run(
        ["git", "diff", "--numstat", base_ref],
        capture_output=True,
        text=True,
    )

    actual_files = [
        f for f in diff_names_result.stdout.splitlines() if f.strip()
    ]
    numstat = diff_numstat_result.stdout

    file_cov = _check_file_coverage(planned, actual_files)

    test_dir = str(plan_file.parent)
    ac_cov = _check_ac_coverage(acs, test_dir, plan_path=plan_path)

    scope = _check_scope_creep(planned, numstat)

    hook_compliance = _compute_hook_compliance()
    review_gate = _compute_review_gate()

    sub_scores: dict[str, SubScore] = {
        "file_coverage": file_cov["score"],
        "ac_coverage": ac_cov["score"],
        "scope_creep": scope["score"],
        "hook_compliance": hook_compliance,
        "review_gate": review_gate,
    }
    composite, coverage_ratio = _compute_composite(sub_scores)

    return {
        "status": "ok",
        "plan_path": str(plan_file),
        "base_ref": base_ref,
        "scores": {
            **sub_scores,
            "composite": composite,
            "coverage_ratio": coverage_ratio,
        },
        "details": {
            "planned_files": [row["file"] for row in planned],
            "actual_files": actual_files,
            "missing_files": file_cov["missing"],
            "unplanned_files": file_cov["unplanned"],
            "acs_total": len(acs),
            "acs_covered": ac_cov["covered"],
            "acs_missing": ac_cov["missing"],
        },
    }


def save_scorecard(scorecard: dict) -> Path | None:
    """Persist a schema v2 scorecard JSON to ``.context/metrics/conformance/``.

    Reads ``plan_path`` and ``base_ref`` from the scorecard, collects
    enrichment metadata via ``_compute_schema_version_2_enrichment``,
    and writes top-level keys: ``schema_version`` (=2), ``timestamp``,
    ``composite_score``, ``components`` (flat copy of sub-scores,
    preserving ``None`` as JSON ``null``), ``session_id``, ``plan_hash``,
    ``git_sha``, ``base_ref``, ``sherlock_tier``, ``branch``,
    ``project_root``, alongside the legacy ``status``/``scores``/``details``
    bodies for backward compat.

    Fire-and-forget: returns the output path on success, ``None`` on
    failure.
    """
    try:
        conf_dir = Path.cwd() / ".context" / "metrics" / "conformance"
        conf_dir.mkdir(parents=True, exist_ok=True)

        scores = scorecard.get("scores") or {}

        components = {
            key: scores.get(key)
            for key in _WEIGHTS.keys()
        }

        plan_path = scorecard.get("plan_path") or ""
        base_ref = scorecard.get("base_ref") or "HEAD~1"

        plan_content = ""
        sherlock_tier = "unknown"
        if plan_path:
            try:
                plan_content = Path(plan_path).read_text(encoding="utf-8")
                sherlock_tier = _parse_sherlock_tier(plan_content)
            except OSError:
                plan_content = ""
                sherlock_tier = "unknown"

        enrichment = _compute_schema_version_2_enrichment(
            plan_path=plan_path,
            base_ref=base_ref,
            plan_content=plan_content,
            sherlock_tier=sherlock_tier,
        )

        payload = {
            "schema_version": _SCHEMA_VERSION,
            "composite_score": scores.get("composite"),
            "components": components,
            **enrichment,
            "status": scorecard.get("status"),
            "scores": scores,
            "details": scorecard.get("details", {}),
        }

        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
        out_path = conf_dir / f"scorecard-{ts}-{os.getpid()}.json"
        out_path.write_text(_json.dumps(payload, indent=2))
        return out_path
    except Exception as e:
        print(f"[fw_conformance] save_scorecard failed: {e}", file=sys.stderr)
        return None


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Score a Sherlock session against its plan"
    )
    parser.add_argument(
        "--plan", default=".sherlock-plan.md",
        help="Path to .sherlock-plan.md (default: .sherlock-plan.md)",
    )
    parser.add_argument(
        "--base", default="HEAD~1",
        help="Git base ref for diff (default: HEAD~1)",
    )
    parser.add_argument(
        "--save", action="store_true",
        help="Save scorecard to .context/metrics/conformance/",
    )
    args = parser.parse_args()

    result = score_session(args.plan, base_ref=args.base)

    if args.save and result["status"] == "ok":
        saved = save_scorecard(result)
        if saved:
            print(f"Scorecard saved to: {saved}", file=sys.stderr)

    print(_json.dumps(result, indent=2))
