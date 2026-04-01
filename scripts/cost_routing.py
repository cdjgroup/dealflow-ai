#!/usr/bin/env python3
"""Cost routing for Sherlock/Holmes review pipeline.

Classifies git changes by type and size, then determines which review
agents to invoke. Reduces cost by skipping irrelevant agents and
escalating model tier only when diff size warrants it.

Usage:
    python3 scripts/cost_routing.py [--final-gate] [--base HEAD~1]

Output (JSON):
    {
        "change_type": "mixed",
        "loc_changed": 150,
        "strategy": "standard",
        "code_reviewer_tier": "sonnet",
        "agents": ["fw-review-code", "fw-review-api-contracts"],
        "skipped": ["fw-author-migration", "fw-review-ux"],
        "reason": "Standard pipeline: 150 LOC, mixed change type"
    }
"""

from __future__ import annotations

import fnmatch
import json
import re
import subprocess
import sys
from pathlib import Path

# --- File pattern definitions ---

DOC_PATTERNS = {"*.md", "*.txt", "*.rst", "*.adoc"}
CONFIG_PATTERNS = {"*.yaml", "*.yml", "*.json", "*.toml", "*.ini", "*.cfg"}
STYLE_PATTERNS = {"*.css", "*.scss", "*.sass", "*.less"}
TEST_PATTERNS = {"*test*", "*spec*", "*.test.*", "*.spec.*"}
LOCKFILE_PATTERNS = {
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    "Pipfile.lock", "poetry.lock", "Gemfile.lock",
    "requirements.txt", "package.json", "Pipfile",
    "pyproject.toml", "Gemfile", "go.sum", "go.mod",
    "Cargo.toml", "Cargo.lock",
}
AUTH_PATTERNS = {"*auth*", "*.env*", "*secret*", "*credential*", "*permission*", "*rbac*"}

MIGRATION_PATTERNS = {"*migration*", "*.sql", "*migrate*"}
API_ROUTE_PATTERNS = {"*route*", "*router*", "*endpoint*", "*/api/*"}
UI_COMPONENT_PATTERNS = {
    "*.tsx", "*.jsx", "*.vue", "*.svelte",
    "*component*", "*/pages/*", "*/components/*",
}
ERROR_HANDLING_PATTERNS = {
    "*error*", "*exception*", "*fallback*", "*handler*",
    "*middleware*", "*catch*",
}
TYPE_DEFINITION_PATTERNS = {
    "*model*", "*schema*", "*types*", "*interface*",
    "*entity*", "*enum*",
}


def _matches_any(filename: str, patterns: set[str]) -> bool:
    name = Path(filename).name.lower()
    full = filename.lower()
    return any(
        fnmatch.fnmatch(name, p.lower()) or fnmatch.fnmatch(full, p.lower())
        for p in patterns
    )


def _is_auth_config(filename: str) -> bool:
    return _matches_any(filename, AUTH_PATTERNS)


def classify_change_type(files: list[str]) -> str:
    """Classify a set of changed files into a change type category.

    Returns one of: docs-only, config-only, deps-only, style-only,
    test-only, or mixed.
    """
    if not files:
        return "mixed"

    all_docs = all(_matches_any(f, DOC_PATTERNS) for f in files)
    if all_docs:
        return "docs-only"

    # Check deps before config (lockfiles match *.json config patterns too)
    all_deps = all(
        _matches_any(f, LOCKFILE_PATTERNS) or Path(f).name.lower() in {
            p.lower() for p in LOCKFILE_PATTERNS
        }
        for f in files
    )
    if all_deps:
        return "deps-only"

    all_config = all(
        _matches_any(f, CONFIG_PATTERNS) and not _is_auth_config(f)
        for f in files
    )
    if all_config:
        return "config-only"

    all_style = all(_matches_any(f, STYLE_PATTERNS) for f in files)
    if all_style:
        return "style-only"

    all_test = all(_matches_any(f, TEST_PATTERNS) for f in files)
    if all_test:
        return "test-only"

    return "mixed"


def route_by_loc(loc_changed: int) -> dict:
    """Determine review strategy based on lines of code changed.

    Returns a dict with strategy name, base agent list, and code
    reviewer tier.
    """
    if loc_changed < 20:
        return {
            "strategy": "minimal",
            "agents": ["fw-review-code"],
            "code_reviewer_tier": "sonnet",
        }
    elif loc_changed <= 200:
        return {
            "strategy": "standard",
            "agents": ["fw-review-code"],
            "code_reviewer_tier": "sonnet",
        }
    elif loc_changed <= 500:
        return {
            "strategy": "extended",
            "agents": ["fw-review-code", "fw-review-maintainability", "fw-review-forensics"],
            "code_reviewer_tier": "sonnet",
        }
    else:
        return {
            "strategy": "full",
            "agents": ["fw-review-code", "fw-review-maintainability", "fw-review-forensics"],
            "code_reviewer_tier": "opus",
        }


def _add_domain_agents(agents: set[str], files: list[str]) -> None:
    """Add domain-specific agents based on file patterns."""
    if any(_matches_any(f, MIGRATION_PATTERNS) for f in files):
        agents.add("fw-author-migration")

    if any(_matches_any(f, API_ROUTE_PATTERNS) for f in files):
        agents.add("fw-review-api-contracts")

    if any(_matches_any(f, UI_COMPONENT_PATTERNS) for f in files):
        agents.add("fw-review-ux")

    if any(_matches_any(f, TEST_PATTERNS) for f in files):
        agents.add("fw-review-tests")

    if any(_matches_any(f, AUTH_PATTERNS) for f in files):
        agents.add("fw-review-security")

    if any(_matches_any(f, ERROR_HANDLING_PATTERNS) for f in files):
        agents.add("fw-review-error-handling")

    if any(_matches_any(f, TYPE_DEFINITION_PATTERNS) for f in files):
        agents.add("fw-review-types")


def get_review_agents(
    files: list[str],
    loc_changed: int,
    final_gate: bool = False,
) -> list[str]:
    """Determine which review agents to run.

    Combines change type classification, LOC routing, and file-type
    skip rules to produce the minimal effective agent list.

    When final_gate=True, always includes the mandatory final gate set.
    """
    change_type = classify_change_type(files)

    # Fast-path for homogeneous change types (still check domain agents)
    if not final_gate and change_type != "mixed":
        base_agents: dict[str, set[str]] = {
            "docs-only": {"fw-review-docs"},
            "config-only": {"fw-review-code"},
            "deps-only": {"fw-review-code", "fw-review-dependencies"},
            "style-only": {"fw-review-code"},
            "test-only": {"fw-review-code", "fw-review-tests"},
        }
        agents = base_agents.get(change_type, {"fw-review-code"})
        _add_domain_agents(agents, files)
        return sorted(agents)

    # Mixed or final gate: start with LOC-based routing
    loc_route = route_by_loc(loc_changed)
    agents = set(loc_route["agents"])

    # Add domain-specific agents based on file patterns
    _add_domain_agents(agents, files)

    # Final gate mandatory set
    if final_gate:
        agents.update([
            "fw-review-code",
            "fw-review-docs",
            "fw-review-security",
            "fw-review-forensics",
            "fw-review-comments",
            "fw-review-error-handling",
            "fw-review-types",
        ])

    return sorted(agents)


def _get_changed_files(base: str = "HEAD~1") -> list[str]:
    try:
        result = subprocess.run(
            ["git", "diff", "--name-only", base],
            capture_output=True, text=True, check=True,
        )
        return [f for f in result.stdout.strip().split("\n") if f]
    except subprocess.CalledProcessError as e:
        print(json.dumps({"error": f"git diff failed: {e.stderr.strip()}"}), file=sys.stderr)
        sys.exit(1)


def _get_loc_changed(base: str = "HEAD~1") -> int:
    try:
        result = subprocess.run(
            ["git", "diff", "--stat", base],
            capture_output=True, text=True, check=True,
        )
        # Last line: " N files changed, N insertions(+), N deletions(-)"
        match = re.search(r"(\d+) insertion", result.stdout)
        insertions = int(match.group(1)) if match else 0
        match = re.search(r"(\d+) deletion", result.stdout)
        deletions = int(match.group(1)) if match else 0
        return insertions + deletions
    except subprocess.CalledProcessError as e:
        print(json.dumps({"error": f"git diff --stat failed: {e.stderr.strip()}"}), file=sys.stderr)
        sys.exit(1)


# --- All possible agents for skip reporting ---
ALL_DOMAIN_AGENTS = {
    "fw-author-migration", "fw-review-api-contracts", "fw-review-ux",
    "fw-review-tests", "fw-review-maintainability", "fw-review-forensics",
    "fw-review-security", "fw-review-docs", "fw-review-comments",
    "fw-review-error-handling", "fw-review-types",
    "fw-review-dependencies", "fw-review-concurrency",
}


# Cost estimate lookup: (tier, loc_band) -> estimated $ per agent call
COST_PER_AGENT_CALL = {
    ("haiku", "small"):   0.005, ("haiku", "medium"):  0.01,
    ("haiku", "large"):   0.02,  ("haiku", "xlarge"):  0.03,
    ("sonnet", "small"):  0.02,  ("sonnet", "medium"): 0.04,
    ("sonnet", "large"):  0.08,  ("sonnet", "xlarge"): 0.12,
    ("opus", "small"):    0.03,  ("opus", "medium"):   0.08,
    ("opus", "large"):    0.15,  ("opus", "xlarge"):   0.25,
}


def _loc_band(loc: int) -> str:
    if loc < 20:
        return "small"
    elif loc <= 200:
        return "medium"
    elif loc <= 500:
        return "large"
    return "xlarge"


def _estimate_savings(skipped: list[str], tier: str, loc: int) -> float:
    """Estimate $ saved by skipping agents, based on tier + LOC band."""
    band = _loc_band(loc)
    cost = COST_PER_AGENT_CALL.get((tier, band), 0.04)
    return round(len(skipped) * cost, 2)


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Cost routing for review pipeline")
    parser.add_argument("--final-gate", action="store_true", help="Run final gate (mandatory agents)")
    parser.add_argument("--base", default="HEAD~1", help="Git base ref for diff (default: HEAD~1)")
    args = parser.parse_args()

    files = _get_changed_files(args.base)
    loc = _get_loc_changed(args.base)
    change_type = classify_change_type(files)
    loc_route = route_by_loc(loc)
    agents = get_review_agents(files, loc, final_gate=args.final_gate)
    skipped = sorted(ALL_DOMAIN_AGENTS - set(agents))

    # Reflect actual routing path in strategy field
    if change_type != "mixed" and not args.final_gate:
        strategy = f"fast-path:{change_type}"
    else:
        strategy = loc_route["strategy"]

    tier = loc_route["code_reviewer_tier"]
    est_savings = _estimate_savings(skipped, tier, loc)

    output = {
        "change_type": change_type,
        "loc_changed": loc,
        "strategy": strategy,
        "code_reviewer_tier": tier,
        "agents": agents,
        "skipped": skipped,
        "est_cost_saved": est_savings,
        "reason": f"{strategy} pipeline: {loc} LOC, {change_type} change type",
    }

    # Fire-and-forget metrics logging
    try:
        from fw_event_log import append_event
        append_event("route", "cost", output, hook="cost_routing")
    except Exception:
        pass

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
