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
        "code_reviewer_tier": "standard",
        "agents": ["st-review-code", "st-review-api-contracts"],
        "skipped": ["st-author-migration", "st-review-ux"],
        "reason": "Standard pipeline: 150 LOC, mixed change type"
    }
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

import yaml

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
            "agents": ["st-review-code"],
            "code_reviewer_tier": "standard",
        }
    elif loc_changed <= 200:
        return {
            "strategy": "standard",
            "agents": ["st-review-code"],
            "code_reviewer_tier": "standard",
        }
    elif loc_changed <= 500:
        return {
            "strategy": "extended",
            "agents": ["st-review-code", "st-review-maintainability", "st-review-forensics"],
            "code_reviewer_tier": "standard",
        }
    else:
        return {
            "strategy": "full",
            "agents": ["st-review-code", "st-review-maintainability", "st-review-forensics"],
            "code_reviewer_tier": "high",
        }


def _add_domain_agents(agents: set[str], files: list[str]) -> None:
    """Add domain-specific agents based on file patterns."""
    if any(_matches_any(f, MIGRATION_PATTERNS) for f in files):
        agents.add("st-author-migration")

    if any(_matches_any(f, API_ROUTE_PATTERNS) for f in files):
        agents.add("st-review-api-contracts")

    if any(_matches_any(f, UI_COMPONENT_PATTERNS) for f in files):
        agents.add("st-review-ux")

    if any(_matches_any(f, TEST_PATTERNS) for f in files):
        agents.add("st-review-tests")

    if any(_matches_any(f, AUTH_PATTERNS) for f in files):
        agents.add("st-review-security")

    if any(_matches_any(f, ERROR_HANDLING_PATTERNS) for f in files):
        agents.add("st-review-error-handling")

    if any(_matches_any(f, TYPE_DEFINITION_PATTERNS) for f in files):
        agents.add("st-review-types")


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
            "docs-only": {"st-review-docs"},
            "config-only": {"st-review-code"},
            "deps-only": {"st-review-code", "st-review-dependencies"},
            "style-only": {"st-review-code"},
            "test-only": {"st-review-code", "st-review-tests"},
        }
        agents = base_agents.get(change_type, {"st-review-code"})
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
            "st-review-code",
            "st-review-docs",
            "st-review-security",
            "st-review-forensics",
            "st-review-comments",
            "st-review-error-handling",
            "st-review-types",
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
    "st-author-migration", "st-review-api-contracts", "st-review-ux",
    "st-review-tests", "st-review-maintainability", "st-review-forensics",
    "st-review-security", "st-review-docs", "st-review-comments",
    "st-review-error-handling", "st-review-types",
    "st-review-dependencies", "st-review-concurrency",
}


# Cost estimate lookup: (tier, loc_band) -> estimated $ per agent call
# Tiers are provider-agnostic capability levels (high/standard/fast).
COST_PER_AGENT_CALL = {
    ("fast", "small"):     0.005, ("fast", "medium"):    0.01,
    ("fast", "large"):     0.02,  ("fast", "xlarge"):    0.03,
    ("standard", "small"): 0.02,  ("standard", "medium"): 0.04,
    ("standard", "large"): 0.08,  ("standard", "xlarge"): 0.12,
    ("high", "small"):     0.03,  ("high", "medium"):    0.08,
    ("high", "large"):     0.15,  ("high", "xlarge"):    0.25,
}

# Agents with embedded web research capability (WebSearch + WebFetch).
# See .claude/rules/sherlock-review-gate.md → "Research-Enhanced Agents".
# Fallback only — the live source of truth is config/framework.yaml's
# cost.research_capable, read via _load_research_capable_agents().
_FALLBACK_RESEARCH_CAPABLE: frozenset[str] = frozenset({
    "st-advisor-architecture",
    "st-review-security",
    "st-review-dependencies",
    "st-advisor-release",
    "st-author-spec",
})

# Additional cost per invocation when a research-capable agent actually runs
# its research step (web search + synthesis). Not every invocation triggers it.
RESEARCH_SURCHARGE_USD: float = 0.10

# /st-deep-r invocation cost (workflow-level, not per-agent).
# Estimate: 2-3 research subagents per /st-deep-r call.
DEEP_R_COST_PER_INVOCATION_USD: float = 0.75


# ============================================================================
# Phase 1: shared config loader + tier/effort derivation
# ============================================================================

# Maps a model tier (config/framework.yaml -> cost.model_tiers) to a
# provider-agnostic reasoning-effort level.
EFFORT_BY_TIER: dict[str, str] = {
    "fast": "low",
    "standard": "high",
    "high": "xhigh",
}

# Maps a model tier to the Agent tool's `model` parameter value. None means
# omit the parameter entirely (the agent inherits its frontmatter default, or
# the parent session's model for agent types with no frontmatter model:).
#
# For every named review agent in .claude/agents/*.md, frontmatter model:
# already matches this mapping via cost.model_tiers -- so passing this value
# explicitly is a no-op for those calls. Its real value is narrower: (1) a
# drift guard if frontmatter and config ever diverge (see
# TestAgentFrontmatterModelDrift), and (2) a lever for ad-hoc
# Agent calls using a subagent_type with no frontmatter model: at all
# (general-purpose, Explore, Plan, claude-code-guide).
#
# Known upstream bug: the Agent tool's `model` override can silently no-op
# on some platform/version combos (anthropics/claude-code#43869, open).
# Empirically confirmed working in this environment as of 2026-07 -- if
# agent output stops reflecting the requested tier, check that issue first.
MODEL_BY_TIER: dict[str, str | None] = {
    "fast": "haiku",
    "standard": None,
    "high": "opus",
}

_TIER_RANK: dict[str, int] = {"high": 3, "standard": 2, "fast": 1}

# Priority order for --allow-max escalation: security > migration >
# architecture > forensics. Judgment call, not derived from config.
MAX_ESCALATION_PRIORITY: list[str] = [
    "st-review-security",
    "st-author-migration",
    "st-advisor-architecture",
    "st-review-forensics",
]


def _repo_root(diagnostics: list[str] | None = None) -> str:
    """Return the repo root via `git rev-parse --show-toplevel`.

    Fail-soft: returns "." if git exits non-zero or isn't found (unlike
    _get_changed_files/_get_loc_changed, this backs a fail-soft config
    loader and must never exit the process).
    """
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, check=True,
        )
        return result.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        if diagnostics is not None:
            diagnostics.append(f"git rev-parse failed, falling back to '.': {e}")
        return "."


# _load_yaml_section is the shared raw-value fetcher; its two consumers
# below (_load_model_tiers, _load_research_capable_agents) both follow the
# same pattern: (1) call _load_yaml_section for the raw value, (2) validate
# shape, (3) return typed result or fallback. If a 3rd consumer appears,
# consider factoring a generic _load_and_validate() wrapper with validator
# callbacks.
def _load_yaml_section(
    section: str,
    config_path: Path | None = None,
    diagnostics: list[str] | None = None,
) -> Any:
    """Read `cost.<section>` from config/framework.yaml.

    Returns whatever YAML value is stored at `cost.<section>` (dict, list,
    scalar, etc. — callers validate the shape they expect). Returns None
    (and appends a diagnostic) if the file is missing, fails to parse, or
    the `cost` / `<section>` keys are absent.
    """
    if config_path is None:
        config_path = Path(_repo_root(diagnostics)) / "config" / "framework.yaml"

    if not config_path.exists():
        if diagnostics is not None:
            diagnostics.append(f"config file not found: {config_path}")
        return None

    try:
        data = yaml.safe_load(config_path.read_text())
    except (OSError, yaml.YAMLError) as e:
        if diagnostics is not None:
            diagnostics.append(f"failed to read/parse {config_path}: {e}")
        return None

    if not isinstance(data, dict):
        if diagnostics is not None:
            diagnostics.append(f"{config_path} did not parse to a mapping")
        return None

    cost = data.get("cost")
    if not isinstance(cost, dict):
        if diagnostics is not None:
            diagnostics.append(f"'cost' section missing or not a mapping in {config_path}")
        return None

    if section not in cost:
        if diagnostics is not None:
            diagnostics.append(f"'cost.{section}' missing in {config_path}")
        return None

    value = cost[section]
    if value is None:
        if diagnostics is not None:
            diagnostics.append(f"'cost.{section}' is null in {config_path}")
        return None

    return value


def _load_model_tiers(
    config_path: Path | None = None,
    diagnostics: list[str] | None = None,
) -> dict[str, str]:
    """Load cost.model_tiers and invert {tier: [agents]} -> {agent: tier}."""
    raw = _load_yaml_section("model_tiers", config_path=config_path, diagnostics=diagnostics)

    if raw is None:
        # _load_yaml_section already logged a diagnostic for this failure.
        return {}

    if raw == {}:
        # Valid but empty — not a failure, no diagnostic.
        return {}

    if not isinstance(raw, dict):
        if diagnostics is not None:
            diagnostics.append("cost.model_tiers is not a mapping")
        return {}

    agent_tiers: dict[str, str] = {}
    for tier, agents in raw.items():
        if tier not in _TIER_RANK or not isinstance(agents, list):
            if diagnostics is not None:
                diagnostics.append(f"skipping invalid model_tiers entry: {tier!r}")
            continue
        for agent in agents:
            existing = agent_tiers.get(agent)
            if existing is None or _TIER_RANK[tier] > _TIER_RANK[existing]:
                agent_tiers[agent] = tier

    return agent_tiers


def _load_research_capable_agents(
    config_path: Path | None = None,
    diagnostics: list[str] | None = None,
) -> frozenset[str]:
    """Load cost.research_capable, falling back to _FALLBACK_RESEARCH_CAPABLE
    on any load failure (same fail-closed shape as _load_model_tiers)."""
    raw = _load_yaml_section("research_capable", config_path=config_path, diagnostics=diagnostics)

    if raw is None:
        # _load_yaml_section already logged a diagnostic for this failure.
        return _FALLBACK_RESEARCH_CAPABLE

    if not isinstance(raw, list):
        if diagnostics is not None:
            diagnostics.append("cost.research_capable is not a list, using fallback")
        return _FALLBACK_RESEARCH_CAPABLE

    return frozenset(raw)


def get_agent_tiers(
    agents: list[str],
    model_tiers: dict[str, str] | None = None,
) -> dict[str, str]:
    """Map each agent to its configured model tier, defaulting to 'standard'."""
    tiers = model_tiers or {}
    return {agent: tiers.get(agent, "standard") for agent in agents}


def get_agent_effort(
    agent_tiers: dict[str, str],
    allow_max: bool = False,
) -> tuple[dict[str, str], str | None]:
    """Map each agent's tier to a reasoning-effort level.

    If allow_max is True, the first agent in MAX_ESCALATION_PRIORITY order
    that is present in agent_tiers with tier "high" is escalated to "max"
    effort and returned as the escalated-agent element. If no such agent
    exists, no effort value changes and the escalated-agent element is None.
    """
    effort = {
        agent: EFFORT_BY_TIER.get(tier, EFFORT_BY_TIER["standard"])
        for agent, tier in agent_tiers.items()
    }

    escalated_agent: str | None = None
    if allow_max:
        escalated_agent = next(
            (
                agent
                for agent in MAX_ESCALATION_PRIORITY
                if agent_tiers.get(agent) == "high"
            ),
            None,
        )
        if escalated_agent is not None:
            effort[escalated_agent] = "max"

    return effort, escalated_agent


def get_agent_model(agent_tiers: dict[str, str]) -> dict[str, str | None]:
    """Map each agent's tier to its `model` parameter value (None = omit).

    No allow_max escalation counterpart: "high" already maps to "opus", the
    top of the Agent tool's model enum, so there is no stronger tier to
    escalate to (unlike effort, which has a "max" rung above "xhigh").
    """
    return {
        agent: MODEL_BY_TIER.get(tier, MODEL_BY_TIER["standard"])
        for agent, tier in agent_tiers.items()
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


# --- Agent Teams task formatting ---

# Human-readable descriptions for agent types
_AGENT_DESCRIPTIONS: dict[str, str] = {
    "st-review-code": "Review changed code for correctness and quality",
    "st-review-security": "Security review: auth, RLS, input validation, secrets",
    "st-review-performance": "Performance review: queries, rendering, endpoints",
    "st-review-tests": "Review test quality and coverage",
    "st-review-maintainability": "Review maintainability: DRY, SOLID, coupling",
    "st-review-api-contracts": "Validate API contracts and backward compatibility",
    "st-review-ux": "Review UX: accessibility, interaction, visual consistency",
    "st-review-docs": "Check if documentation needs updating",
    "st-review-forensics": "Scan for AI generation tells and supply chain risks",
    "st-review-comments": "Audit comment accuracy, staleness, and value",
    "st-review-error-handling": "Detect silently swallowed errors and empty catch blocks",
    "st-review-types": "Evaluate type design and invariant enforcement",
    "st-review-dependencies": "Review dependency changes for supply chain security",
    "st-review-concurrency": "Detect race conditions and deadlocks in async code",
    "st-author-migration": "Verify database migration safety and schema",
    "st-author-docs": "Write or update project documentation",
    "st-tdd-red": "Write failing tests from requirements (RED phase)",
    "st-tdd-green": "Write minimal implementation to pass tests (GREEN phase)",
    "st-tdd-refactor": "Refactor code while keeping tests green (REFACTOR phase)",
    "st-advisor-architecture": "Evaluate architecture and design trade-offs",
    "st-advisor-release": "Verify deployment readiness",
}


def format_as_tasks(
    agents: list[str],
    predecessor_task_id: str | None = None,
) -> list[dict[str, Any]]:
    """Convert agent list to Agent Teams task definitions with dependencies.

    Each task dict has:
    - teammate_type: str (agent name)
    - task_subject: str (human-readable task title)
    - blockedBy: list[str] (task IDs this depends on)
    """
    tasks = []
    for agent in agents:
        blocked_by = [predecessor_task_id] if predecessor_task_id else []
        subject = _AGENT_DESCRIPTIONS.get(agent, f"Run {agent}")
        tasks.append({
            "teammate_type": agent,
            "task_subject": subject,
            "blockedBy": blocked_by,
        })
    return tasks


def format_as_workflow_agents(
    agents: list[str],
    agent_tiers: dict[str, str],
    agent_effort: dict[str, str],
    agent_models: dict[str, str | None],
) -> list[dict[str, Any]]:
    """Convert agent list to Workflow-script-ready `agent()` call opts.

    Unlike format_as_tasks() (Agent Teams' TaskCreate, which has no
    model/effort fields), the Workflow tool's internal agent() helper is the
    only in-session tool surface with a real `effort` parameter -- this is
    the one place agent_effort has a code-reachable consumer. Each dict has:
    - agentType: str (agent name)
    - opts: {"model": str | None, "effort": str}

    agent_tiers/agent_effort/agent_models are expected to be co-derived from
    `agents` (as _build_output does), but callers are tolerated if an entry
    is missing -- falls back to the "standard" tier's effort and an omitted
    model, mirroring format_as_tasks()'s .get()-based tolerance.
    """
    return [
        {
            "agentType": agent,
            "opts": {
                "model": agent_models.get(agent),
                "effort": agent_effort.get(agent, EFFORT_BY_TIER["standard"]),
            },
        }
        for agent in agents
    ]


def _build_output(
    # Classification inputs (what changed and how much)
    files: list[str],
    loc: int,
    # Route control (how to handle this specific routing)
    final_gate: bool,
    allow_max: bool,
    # Output shape control (format of the return value)
    mode: str,
    predecessor_task: str | None,
) -> dict[str, Any]:
    """Build the full output JSON.

    Pure function (no I/O beyond config load) so it's testable without
    argparse/subprocess plumbing.
    """
    change_type = classify_change_type(files)
    loc_route = route_by_loc(loc)
    agents = get_review_agents(files, loc, final_gate=final_gate)
    skipped = sorted(ALL_DOMAIN_AGENTS - set(agents))

    # Reflect actual routing path in strategy field
    if change_type != "mixed" and not final_gate:
        strategy = f"fast-path:{change_type}"
    else:
        strategy = loc_route["strategy"]

    tier = loc_route["code_reviewer_tier"]
    est_savings = _estimate_savings(skipped, tier, loc)

    diagnostics: list[str] = []
    model_tiers = _load_model_tiers(diagnostics=diagnostics)
    agent_tiers = get_agent_tiers(agents, model_tiers)
    agent_effort, escalated_agent = get_agent_effort(agent_tiers, allow_max=allow_max)
    agent_models = get_agent_model(agent_tiers)

    output: dict[str, Any] = {
        "change_type": change_type,
        "loc_changed": loc,
        "strategy": strategy,
        "code_reviewer_tier": tier,
        "agents": agents,
        "skipped": skipped,
        "est_cost_saved": est_savings,
        "reason": f"{strategy} pipeline: {loc} LOC, {change_type} change type",
        "agent_tiers": agent_tiers,
        "agent_effort": agent_effort,
        "agent_models": agent_models,
        "max_escalated": escalated_agent,
        "diagnostics": diagnostics,
    }

    if mode == "agent-teams":
        output["orchestration_mode"] = "agent-teams"
        output["tasks"] = format_as_tasks(agents, predecessor_task_id=predecessor_task)
    elif mode == "workflow":
        output["orchestration_mode"] = "workflow"
        output["workflow_agents"] = format_as_workflow_agents(
            agents, agent_tiers, agent_effort, agent_models
        )

    return output


def _build_arg_parser() -> argparse.ArgumentParser:
    """Build the CLI parser. Extracted from main() so tests can exercise the
    actual argparse wiring (e.g. --allow-max -> args.allow_max) without a
    subprocess or git dependency."""
    parser = argparse.ArgumentParser(description="Cost routing for review pipeline")
    parser.add_argument("--final-gate", action="store_true", help="Run final gate (mandatory agents)")
    parser.add_argument("--base", default="HEAD~1", help="Git base ref for diff (default: HEAD~1)")
    parser.add_argument("--mode", default="subagent", choices=["subagent", "agent-teams", "workflow"],
                        help="Orchestration mode (default: subagent)")
    parser.add_argument("--predecessor-task", default=None,
                        help="Task ID that review tasks depend on (agent-teams mode)")
    parser.add_argument("--allow-max", action="store_true",
                        help="Allow escalating one high-tier agent to effort 'max'")
    return parser


def main() -> None:
    args = _build_arg_parser().parse_args()

    files = _get_changed_files(args.base)
    loc = _get_loc_changed(args.base)
    output = _build_output(
        files=files,
        loc=loc,
        final_gate=args.final_gate,
        allow_max=args.allow_max,
        mode=args.mode,
        predecessor_task=args.predecessor_task,
    )

    # Fire-and-forget metrics logging
    try:
        from fw_event_log import append_event
        append_event("route", "cost", output, hook="cost_routing")
    except Exception:
        pass

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
