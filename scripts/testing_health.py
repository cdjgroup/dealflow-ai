#!/usr/bin/env python3
"""Testing-health signals for the /st-retro and /st-stats skills.

Replaces the dead TDD-phase-ratio metric (0 tdd() commits ever) with a
research-grounded diagnostic. These are TREND signals, NOT a quality score
or target: a LOC test:code ratio is the weakest member of the test-metric
family (below coverage%, which itself only weakly predicts defects —
Inozemtseva & Holmes ICSE 2014; Kochhar IEEE-TR 2017), and "% of commits
touching a test" is Goodhart-gameable (assertion-free / generated / unrelated
edits inflate it). Google (SWE-book ch11), Fowler (TestCoverage), and DORA all
reject single-number test targets. So this module reports direction-of-travel
and labels itself accordingly; it never emits a pass/fail verdict.

Signals:
  * Test:code ratio (structural)  — whole-tree test LOC / source LOC, post-exclusion.
  * Test-churn ratio (this period) — test LOC changed / source LOC changed in the
    window (git numstat), floored and flagged when one commit dominates, because
    a rename+edit renders as a compound path that must be resolved to the new
    path before classification (see _resolve_rename_path), or its churn is
    mis-bucketed.
  * Feat/fix commits shipping tests — % of feat|fix commits in the window that
    touch >=1 test file (a weak trend signal, not a gate).
  * Agents run — top agent_type counts from agent_spawn events in the window.

File classification is the SonarQube/Codecov two-axis model: union of affix +
directory globs for TEST, MINUS an explicit EXCLUDE bucket (vendored, golden,
fixtures, and project-declared frozen/benchmark suites) that is neither team
test nor team source. There is no auto-detection for excluded suites — the
exclude list is explicit and config-extensible (retro.test_exclude_globs).
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import collections
from datetime import datetime, timedelta, timezone
from pathlib import Path

SRC_EXT = (".py", ".js", ".jsx", ".ts", ".tsx", ".rs", ".go", ".sh")

# .bats (Bash Automated Testing System) files are tests by definition but are
# NOT a SRC_EXT source language — so classify() must recognize them before the
# SRC_EXT short-circuit, or a bats-tested shell script looks untested to the
# tests-exist gate (the blind spot that falsely blocked scripts/bump-guard.sh).
TEST_EXT = (".bats",)

TEST_GLOBS = [
    r"(^|/)tests?/",
    r"(^|/)__tests__/",
    r"test_[^/]*\.py$",
    r"[^/]*_test\.py$",
    r"[^/]*_test\.go$",
    r"[^/]*\.test\.(js|jsx|ts|tsx|mjs|cjs)$",
    r"[^/]*\.spec\.(js|jsx|ts|tsx)$",
]

# Neither team test nor team source: vendored, generated, golden/snapshot, and
# project frozen/benchmark suites. Extend via config: retro.test_exclude_globs.
DEFAULT_EXCLUDE_GLOBS = [
    r"(^|/)vendor/",
    r"(^|/)third_party/",
    r"(^|/)node_modules/",
    r"(^|/)testdata/",
    r"(^|/)fixtures/",
    r"(^|/)__snapshots__/",
    r"\.golden$",
    r"\.snap$",
    r"(^|/)task_packs/",
    r"(^|/)workspace_seed/",
    r"/frozen",
]

CHURN_FLOOR = 50          # below this many changed source lines, the ratio is noise
DOMINATE_FRAC = 0.6       # one commit contributing > this share of source churn is flagged
DOMINATE_MIN = 100        # ...and only when it is also this many lines (ignore tiny windows)


class Classifier:
    """Buckets a repo path into 'test', 'source', 'exclude', or 'other'."""

    def __init__(self, extra_excludes: list[str] | None = None) -> None:
        self._test = re.compile("|".join(TEST_GLOBS))
        self._excl = re.compile("|".join(DEFAULT_EXCLUDE_GLOBS + (extra_excludes or [])))

    def classify(self, path: str) -> str:
        if self._excl.search(path):
            return "exclude"
        if path.endswith(TEST_EXT):
            return "test"
        if not path.endswith(SRC_EXT):
            return "other"
        if self._test.search(path):
            return "test"
        return "source"


#: `Classifier`/`SRC_EXT`/`TEST_GLOBS`/`DEFAULT_EXCLUDE_GLOBS` above are also
#: independently duplicated (not imported) in
#: src/shipteam/framework/hooks/_gate_classify.py for the tests-exist gate —
#: CI's `scripts/tests/` step runs before `shipteam` is pip-installed, so a
#: cross-package import would break that step. The two copies are kept in
#: sync by scripts/tests/test_gate_classify_drift.py; update both together.

_RENAME_BRACE = re.compile(r"^(.*)\{(.*) => (.*)\}(.*)$")


def _resolve_rename_path(path: str) -> str:
    """Extract the post-rename path from a numstat path field.

    `git log --numstat` (rename detection on by default) renders renames two ways:
      * prefix-compressed:  `tests/{old.py => new.py}`  ->  `tests/new.py`
      * full:               `tests/a.py => src/a.py`     ->  `src/a.py`
    Classifying the raw field mis-buckets the churn (the `}` suffix defeats the
    extension check; the old path's directory can match a test/exclude glob),
    silently corrupting the core churn statistic. Resolve to the new path first.
    """
    m = _RENAME_BRACE.match(path)
    if m:
        pre, _old, new, post = m.groups()
        return f"{pre}{new}{post}"
    if " => " in path:
        return path.split(" => ", 1)[1]
    return path


def _git(args: list[str], diagnostics: list[str] | None = None) -> str:
    """Run git; on nonzero exit, record a diagnostic and return "" (degrade, not crash).

    A git failure (not a repo, worktree invoked without GIT_DIR/GIT_WORK_TREE,
    corrupt .git) must be DISTINGUISHABLE from a legitimately tiny repo — else
    every downstream signal silently reads 'n/a'. So we surface it rather than
    swallow it.
    """
    proc = subprocess.run(["git", *args], capture_output=True, text=True)
    if proc.returncode != 0:
        if diagnostics is not None:
            first = (proc.stderr or "").strip().splitlines()
            diagnostics.append(f"git {args[0]} failed (rc={proc.returncode})"
                               + (f": {first[0]}" if first else ""))
        return ""
    return proc.stdout


def _repo_root() -> str:
    """Repo root via git; falls back to '.' — never trust a bare relative path
    (breaks the moment cwd drifts; a recorded project failure mode)."""
    root = subprocess.run(["git", "rev-parse", "--show-toplevel"],
                          capture_output=True, text=True).stdout.strip()
    return root or "."


def _loc(path: str) -> int:
    """Line count; raises OSError to the caller so an unreadable tracked file is
    counted as an anomaly, not silently folded into the ratio as 0."""
    with open(path, "rb") as fh:
        return sum(1 for _ in fh)


def snapshot_ratio(clf: Classifier, diagnostics: list[str] | None = None
                   ) -> tuple[float | None, int, int]:
    """Whole-tree test LOC / source LOC over tracked files, post-exclusion."""
    test_loc = src_loc = unreadable = 0
    for f in _git(["ls-files"], diagnostics).split():
        bucket = clf.classify(f)
        if bucket not in ("test", "source"):
            continue
        try:
            n = _loc(f)
        except OSError:
            unreadable += 1
            continue
        if bucket == "test":
            test_loc += n
        else:
            src_loc += n
    if unreadable and diagnostics is not None:
        diagnostics.append(f"{unreadable} tracked file(s) unreadable — ratio may be skewed")
    ratio = (test_loc / src_loc) if src_loc else None
    return ratio, test_loc, src_loc


def parse_commits(clf: Classifier, log_text: str) -> list[dict]:
    """Parse `git log --numstat --pretty=format:__C__ %H %s` into per-commit churn.

    State machine over the interleaved log: a `__C__` sentinel line opens a new
    commit (the sentinel lets us tell a commit header from its numstat rows,
    since `%s` is single-line and cannot contain the marker), and the tab-
    delimited numstat rows that follow accumulate test/source LOC deltas into
    the currently-open commit until the next sentinel.
    """
    commits: list[dict] = []
    cur: dict | None = None
    for line in log_text.splitlines():
        if line.startswith("__C__"):  # commit boundary
            if cur is not None:
                commits.append(cur)
            parts = line.split(" ", 2)
            h = parts[1] if len(parts) > 1 else ""
            subj = parts[2] if len(parts) > 2 else ""
            cur = {"h": h, "ff": subj.startswith(("feat", "fix")),
                   "touch_test": False, "tD": 0, "sD": 0}
        elif cur is not None and "\t" in line:
            cols = line.split("\t")
            if len(cols) == 3:
                add, dele, path = cols
                delta = (int(add) if add.isdigit() else 0) + (int(dele) if dele.isdigit() else 0)
                bucket = clf.classify(_resolve_rename_path(path))
                if bucket == "test":
                    cur["tD"] += delta
                    cur["touch_test"] = True
                elif bucket == "source":
                    cur["sD"] += delta
    if cur is not None:
        commits.append(cur)
    return commits


def churn_signal(commits: list[dict]) -> dict:
    """Windowed test-churn ratio + %-feat/fix-with-tests, with guards."""
    t_churn = sum(c["tD"] for c in commits)
    s_churn = sum(c["sD"] for c in commits)
    ff = [c for c in commits if c["ff"]]
    ff_with_test = sum(1 for c in ff if c["touch_test"])
    dominating = None
    if s_churn:
        for c in commits:
            if c["sD"] > DOMINATE_FRAC * s_churn and c["sD"] > DOMINATE_MIN:
                dominating = c["h"][:8]
                break
    ratio = (t_churn / s_churn) if s_churn >= CHURN_FLOOR else None
    return {
        "ratio": ratio,
        "test_churn": t_churn,
        "source_churn": s_churn,
        "dominating_commit": dominating,
        "ff_total": len(ff),
        "ff_with_test": ff_with_test,
    }


def agents_run(metrics_dir: Path, cutoff_iso: str | None,
               diagnostics: list[str] | None = None) -> dict[str, int]:
    """Top agent_type counts from agent_spawn events (SubagentStart telemetry).

    A wholly-corrupt or unreadable log must not read as a silent 'no telemetry'
    (indistinguishable from genuinely-zero) — surface parse/read failures.
    """
    counts: collections.Counter = collections.Counter()
    if not metrics_dir.exists():
        return {}
    parse_failures = 0
    for f in sorted(metrics_dir.glob("events-*.jsonl")):
        try:
            text = f.read_text()
        except (OSError, UnicodeDecodeError) as exc:
            if diagnostics is not None:
                diagnostics.append(f"event log {f.name} unreadable: {exc}")
            continue
        for line in text.splitlines():
            try:
                e = json.loads(line)
            except ValueError:
                parse_failures += 1
                continue
            if e.get("event") != "agent_spawn":
                continue
            if cutoff_iso and e.get("ts", "") < cutoff_iso:
                continue
            counts[e.get("data", {}).get("agent_type", "unknown")] += 1
    if parse_failures and diagnostics is not None:
        diagnostics.append(f"{parse_failures} unparseable event line(s) skipped")
    return dict(counts)


def collect(window: str, metrics_dir: str, extra_excludes: list[str] | None = None,
            now: datetime | None = None, diagnostics: list[str] | None = None) -> dict:
    """Compute all testing-health signals for a window ('7', '30', 'all').

    `diagnostics` accumulates operator-visible warnings (git/log/config failures)
    so an ERROR is never silently rendered as a legitimate empty 'n/a'.
    """
    diagnostics = diagnostics if diagnostics is not None else []
    clf = Classifier(extra_excludes)
    days = None if window == "all" else int(window)
    ratio, test_loc, src_loc = snapshot_ratio(clf, diagnostics)

    since = [] if days is None else [f"--since={days} days ago"]
    log_text = _git(["log", *since, "--numstat", "--pretty=format:__C__ %H %s"], diagnostics)
    churn = churn_signal(parse_commits(clf, log_text))

    now = now or datetime.now(timezone.utc)
    cutoff = None if days is None else (now - timedelta(days=days)).isoformat()
    agents = agents_run(Path(metrics_dir), cutoff, diagnostics)

    return {
        "window": window,
        "snapshot_ratio": ratio,
        "test_loc": test_loc,
        "source_loc": src_loc,
        "churn": churn,
        "agents": agents,
        "diagnostics": diagnostics,
    }


def render_text(data: dict) -> str:
    """Human-readable block shared by /st-retro and /st-stats."""
    lines = ["Testing Health  (diagnostic/trend signal — NOT a quality score or target)"]
    r = data["snapshot_ratio"]
    lines.append(f"  Test:code ratio (structural): {r:.2f}"
                 f"   [test {data['test_loc']} / source {data['source_loc']} LOC]"
                 if r is not None else "  Test:code ratio (structural): n/a (no source)")
    ch = data["churn"]
    if ch["ratio"] is not None:
        flag = f"  (!) window dominated by commit {ch['dominating_commit']}" if ch["dominating_commit"] else ""
        lines.append(f"  Test-churn ratio (this period): {ch['ratio']:.2f}{flag}")
    else:
        lines.append(f"  Test-churn ratio (this period): n/a "
                     f"(<{CHURN_FLOOR} source lines changed)")
    if ch["ff_total"]:
        pct = 100 * ch["ff_with_test"] // ch["ff_total"]
        lines.append(f"  Feat/fix commits shipping tests: "
                     f"{ch['ff_with_test']}/{ch['ff_total']} ({pct}%)")
    else:
        lines.append("  Feat/fix commits shipping tests: n/a (0 feat/fix commits)")
    if data["agents"]:
        top = sorted(data["agents"].items(), key=lambda kv: -kv[1])[:5]
        lines.append("  Agents run: " + ", ".join(f"{a} ({n})" for a, n in top))
    else:
        lines.append("  Agents run: no agent telemetry in window")
    for d in data.get("diagnostics", []):
        lines.append(f"  (!) {d}")
    return "\n".join(lines)


def _load_extra_excludes(framework_yaml: str | None = None,
                         diagnostics: list[str] | None = None) -> list[str]:
    """Best-effort read of retro.test_exclude_globs (no yaml dep required).

    The path is anchored to the repo root (not a bare relative string, which
    breaks the moment cwd drifts). If the file exists but the key is absent —
    distinct from 'no config' — a diagnostic is surfaced, because a silently
    dropped exclude list would mis-count fixtures as team tests.
    """
    path = Path(framework_yaml) if framework_yaml else Path(_repo_root()) / "config/framework.yaml"
    if not path.exists():
        return []
    globs: list[str] = []
    in_retro = in_list = found_key = False
    for line in path.read_text().splitlines():
        if re.match(r"^\S", line):
            in_retro = line.startswith("retro:")
            in_list = False
            continue
        if in_retro and re.match(r"\s+test_exclude_globs\s*:", line):
            in_list = found_key = True
            continue
        if in_list:
            m = re.match(r"\s+-\s+['\"]?([^'\"]+)['\"]?\s*$", line)
            if m:
                globs.append(m.group(1))
            elif re.match(r"\s+\S+\s*:", line):
                in_list = False
    if not found_key and diagnostics is not None:
        diagnostics.append(f"retro.test_exclude_globs not found in {path.name}; "
                           "using built-in excludes only")
    return globs


def main() -> None:
    ap = argparse.ArgumentParser(description="Testing-health signals for /st-retro and /st-stats")
    ap.add_argument("--window", default="30", help="7 | 30 | all (days)")
    ap.add_argument("--metrics-dir", default=".context/metrics")
    ap.add_argument("--json", action="store_true", help="emit structured JSON")
    args = ap.parse_args()
    diags: list[str] = []
    extra = _load_extra_excludes(diagnostics=diags)
    data = collect(args.window, args.metrics_dir, extra, diagnostics=diags)
    print(json.dumps(data, indent=2) if args.json else render_text(data))
    for d in data.get("diagnostics", []):
        print(f"testing_health: {d}", file=sys.stderr)


if __name__ == "__main__":
    main()
