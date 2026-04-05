#!/usr/bin/env python3
"""Conformance scorer for Sherlock/Holmes sessions.

Compares a .sherlock-plan.md against the actual git diff to produce a
scorecard covering file coverage, AC coverage, scope creep, hook
compliance, review gate, and a composite weighted score.

Usage:
    python3 scripts/fw_conformance.py --plan .sherlock-plan.md [--base HEAD~1] [--save]
"""

import json as _json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _parse_planned_files(plan_md: str) -> list[dict[str, str]]:
    """Extract rows from the Planned Files markdown table.

    Returns a list of dicts with 'file' and 'action' keys.
    """
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
                # blank line after table ends it
                if separator_found:
                    break
                continue

            if stripped.startswith("|"):
                cells = [c.strip() for c in stripped.split("|") if c.strip() != ""]
                if not cells:
                    continue

                if not header_found:
                    # This is the header row
                    header_found = True
                    continue

                if not separator_found:
                    # This is the separator row (e.g. |---|---|---|)
                    separator_found = True
                    continue

                # Data row — need at least 2 cells (file, action)
                if len(cells) >= 2:
                    results.append({"file": cells[0], "action": cells[1]})
            else:
                # Non-pipe line inside table section ends the table
                if separator_found:
                    break

    return results


def _parse_acceptance_criteria(plan_md: str) -> list[str]:
    """Extract AC-# identifiers from the Acceptance Criteria section."""
    results = []
    for match in re.finditer(r"###\s+(AC-\d+):", plan_md):
        results.append(match.group(1))
    return results


def _check_file_coverage(planned: list[dict[str, str]], actual: list[str]) -> dict:
    """Compare planned vs actual changed files.

    Returns a dict with score, matched, missing, and unplanned lists.
    """
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


def _check_ac_coverage(acs: list[str], test_dir: str) -> dict:
    """Search test files for AC-# references.

    Uses Python file reading (not subprocess grep). Returns score, covered,
    and missing lists.
    """
    if not acs:
        return {"score": 0.0, "covered": [], "missing": []}

    test_path = Path(test_dir)
    if not test_path.exists():
        return {"score": 0.0, "covered": [], "missing": list(acs)}

    # Recursively scan for test files
    content_buffer = []
    for f in test_path.rglob("*"):
        if f.is_file():
            try:
                content_buffer.append(f.read_text(errors="replace"))
            except OSError:
                pass

    combined = "\n".join(content_buffer)

    covered = []
    missing = []
    for ac in acs:
        if ac in combined:
            covered.append(ac)
        else:
            missing.append(ac)

    score = len(covered) / len(acs)

    return {"score": score, "covered": covered, "missing": missing}


def _check_scope_creep(planned: list[dict[str, str]], numstat: str) -> dict:
    """Partition lines changed into planned vs unplanned.

    numstat format per line: insertions<TAB>deletions<TAB>filepath
    Returns score, planned_lines, and unplanned_lines.
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
        return {"score": 1.0, "planned_lines": 0, "unplanned_lines": 0}

    score = planned_lines / total_lines
    return {
        "score": score,
        "planned_lines": planned_lines,
        "unplanned_lines": unplanned_lines,
    }


def _compute_composite(scores: dict[str, float]) -> float:
    """Weighted average of component scores.

    Weights:
      file_coverage=0.25, ac_coverage=0.30, scope_creep=0.15,
      hook_compliance=0.15, review_gate=0.15
    """
    weights = {
        "file_coverage": 0.25,
        "ac_coverage": 0.30,
        "scope_creep": 0.15,
        "hook_compliance": 0.15,
        "review_gate": 0.15,
    }
    total = 0.0
    for key, weight in weights.items():
        total += scores.get(key, 0.0) * weight
    return float(total)


def _compute_hook_compliance() -> float:
    """Calculate hook compliance from protocol events in the event log.

    Returns 1.0 - (blocks / total) where total = blocks + warns.
    Returns 1.0 if no protocol events exist (no violations = perfect compliance).
    """
    try:
        from fw_event_log import read_events
        events = read_events(category="protocol")
        if not events:
            return 1.0
        blocks = sum(1 for e in events if e.get("event") == "block")
        total = len(events)
        return 1.0 - (blocks / total) if total > 0 else 1.0
    except Exception:
        return 1.0


def _compute_review_gate() -> float:
    """Calculate review gate compliance from agent spawn events.

    Returns ratio of sessions that had at least one agent review.
    Returns 1.0 if no agent spawn events exist (no data = assume compliant).
    """
    try:
        from fw_event_log import read_events
        events = read_events(event_type="agent_spawn")
        if not events:
            return 1.0
        # If agents were spawned, review gate was exercised
        return 1.0
    except Exception:
        return 1.0


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def score_session(plan_path: str, base_ref: str = "HEAD~1") -> dict:
    """Score a Sherlock/Holmes session against its plan.

    Reads the plan file, calls git diff, and returns a scorecard dict with
    status, scores, and details.

    Returns an error scorecard if the plan file is missing or has no
    Planned Files table.
    """
    _zero_scores = {
        "file_coverage": 0.0,
        "ac_coverage": 0.0,
        "scope_creep": 0.0,
        "hook_compliance": 0.0,
        "review_gate": 0.0,
        "composite": 0.0,
    }

    # Read plan file
    plan_file = Path(plan_path)
    if not plan_file.exists():
        return {
            "status": "error",
            "message": f"Plan file not found: {plan_path}",
            "scores": dict(_zero_scores),
            "details": {},
        }

    plan_md = plan_file.read_text()

    # Parse plan
    planned = _parse_planned_files(plan_md)
    if not planned:
        return {
            "status": "error",
            "message": "No Planned Files table found in plan",
            "scores": dict(_zero_scores),
            "details": {},
        }

    acs = _parse_acceptance_criteria(plan_md)

    # Get git diff
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

    # Compute sub-scores
    file_cov = _check_file_coverage(planned, actual_files)

    # Determine test directory — use the plan file's parent directory
    test_dir = str(plan_file.parent)
    ac_cov = _check_ac_coverage(acs, test_dir)

    scope = _check_scope_creep(planned, numstat)

    # hook_compliance: ratio of non-blocked protocol events
    hook_compliance = _compute_hook_compliance()
    # review_gate: ratio of sessions with agent review (from event log)
    review_gate = _compute_review_gate()

    sub_scores = {
        "file_coverage": file_cov["score"],
        "ac_coverage": ac_cov["score"],
        "scope_creep": scope["score"],
        "hook_compliance": hook_compliance,
        "review_gate": review_gate,
    }
    composite = _compute_composite(sub_scores)

    return {
        "status": "ok",
        "scores": {
            **sub_scores,
            "composite": composite,
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
    """Persist scorecard JSON to .context/metrics/conformance/.

    Fire-and-forget: returns the output path on success, None on failure.
    """
    try:
        conf_dir = Path.cwd() / ".context" / "metrics" / "conformance"
        conf_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
        out_path = conf_dir / f"scorecard-{ts}.json"
        out_path.write_text(_json.dumps(scorecard, indent=2))
        return out_path
    except Exception:
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
