---
name: fw-stats
description: Framework metrics summary. Aggregates safety events, cost routing decisions, conformance scores, and TDD health over a time window.
allowed-tools: Bash, Read, Grep, Glob
argument-hint: "[7d|30d|all] [--detail]"
---

Display framework operational metrics. Arguments: $ARGUMENTS

## Configuration

Read from `config/framework.yaml`:
- `metrics.enabled`: whether metrics collection is active
- `metrics.storage_dir`: where event logs are stored (default: `.context/metrics`)
- `retro.track_tdd_phases`: whether to include TDD phase analysis

## Steps

### Step 1: Check Metrics Enabled

Read `config/framework.yaml` and check `metrics.enabled`. If false or missing:
```
Framework metrics are disabled. Enable with: metrics.enabled: true in config/framework.yaml
```

### Step 2: Determine Time Window

Parse arguments:
- `7d`, `30d` -> filter events to last N days
- `all` -> no time filter
- No argument -> default to `30d`
- `--detail` -> show per-session conformance breakdown

### Step 3: Aggregate Safety Events

Read JSONL files from `.context/metrics/events-*.jsonl`. Filter by time window.

Count events by type:
```bash
# Count blocks by category
python3 -c "
import json, sys
from pathlib import Path
from datetime import datetime, timedelta

window_days = 30  # adjust based on argument
cutoff = (datetime.now() - timedelta(days=window_days)).isoformat()
metrics_dir = Path('.context/metrics')

blocks = {}
approvals = 0
routes = []
violations = []

for f in sorted(metrics_dir.glob('events-*.jsonl')):
    for line in f.read_text().splitlines():
        try:
            e = json.loads(line)
            if e.get('ts', '') < cutoff:
                continue
            if e['event'] == 'block' and e['category'] == 'safety':
                reason = e.get('data', {}).get('reason', 'unknown')
                blocks[reason] = blocks.get(reason, 0) + 1
            elif e['event'] == 'approve':
                approvals += 1
            elif e['event'] == 'route':
                routes.append(e.get('data', {}))
            elif e['category'] == 'protocol':
                violations.append(e)
        except (json.JSONDecodeError, KeyError):
            continue

print(json.dumps({
    'blocks': blocks,
    'block_total': sum(blocks.values()),
    'approvals': approvals,
    'routes': len(routes),
    'skipped_agents': sum(len(r.get('skipped', [])) for r in routes),
    'est_savings': sum(r.get('est_cost_saved', 0) for r in routes),
    'violations': len(violations),
}, indent=2))
"
```

### Step 4: Read Conformance Scorecards

Check `.context/metrics/conformance/` for scorecard JSON files:
```bash
ls -t .context/metrics/conformance/scorecard-*.json 2>/dev/null | head -20
```

If scorecards exist, aggregate:
- Average composite score
- Average file_coverage, ac_coverage, scope_creep scores
- Count of sessions scored
- Sessions with composite >= 0.90 (passing)

### Step 4b: Agent Spawn Events

Count `agent_spawn` events from the event log (these are captured by the SubagentStart hook):

```python
# Add to the event aggregation in Step 3:
# For events where event == 'agent_spawn' and category == 'cost':
#   Count by data.agent_type
```

Display agent invocation frequency alongside cost routing data.

### Step 5: TDD Phase Analysis

**Primary source**: Read `tdd_phase` events from the JSONL event log (emitted by tdd-commit.sh):

```python
# In the Step 3 aggregation, also extract:
# For events where event == 'tdd_phase' and category == 'tdd':
#   Count by data.phase (red, green, refactor)
```

**Fallback**: If no `tdd_phase` events exist, fall back to git log grep:
```bash
git log --since="<window>" --oneline | grep -c "tdd(red):" || echo 0
git log --since="<window>" --oneline | grep -c "tdd(green):" || echo 0
git log --since="<window>" --oneline | grep -c "tdd(refactor):" || echo 0
```

### Step 6: Format and Display

Output formatted summary:

```
Framework Stats (last <window>)
══════════════════════════════════════════════════

Safety
  N destructive ops blocked
     N force-push  N rm -rf  N DROP without WHERE
  N operations auto-approved

Cost Routing
  N routing decisions | N agent spawns tracked
  N agent invocations skipped
  Est. savings: ~$X.XX
  Top agents: fw-review-code (N), fw-review-tests (N), ...

Quality Gates
  N protocol violations caught
     N doc-stale blocks  N push-main warnings

Plan Conformance (N sessions scored)
  Composite: XX% avg (target: 90%)
  ├─ File coverage:    XX%
  ├─ AC coverage:      XX%
  ├─ Scope creep:      XX%
  ├─ Hook compliance:  XX%
  └─ Review gate:      XX%

TDD Health
  RED:GREEN:REFACTOR = N:N:N
  Ratio: X.X : X.X : X.X (target: 1:1:0.5)
```

If `--detail` flag, also show per-session conformance table:
```
Session Conformance Detail
| Date | Branch | Composite | File Cov | AC Cov | Scope |
|------|--------|-----------|----------|--------|-------|
| 2026-03-28 | feature/foo | 94% | 100% | 100% | 82% |
```

### Step 7: Show Recommendations

Based on the data, suggest improvements:
- If file_coverage < 90%: "Consider more detailed Planned Files tables in sherlock plans"
- If ac_coverage < 90%: "Ensure test files reference AC-# identifiers from the plan"
- If scope_creep < 80%: "Watch for unplanned file modifications — use the Pivot Log"
- If no conformance data: "Run Sherlock/Holmes sessions with `python3 scripts/fw_conformance.py --plan .sherlock-plan.md` to start tracking"
- If no events: "Metrics are enabled but no events logged yet — they'll appear after hook activity"

### Step 8: Profile Graduation Suggestion

Read the `profile` key from `config/framework.yaml`:

```python
# Read current profile
profile = "full"  # default
try:
    import re
    with open("config/framework.yaml") as f:
        for line in f:
            m = re.match(r'^profile:\s*(\S+)', line)
            if m:
                profile = m.group(1).strip('"').strip("'")
                break
except FileNotFoundError:
    pass
```

Display profile status with graduation suggestion:

```
Profile
  Current: <profile>
  → <suggestion based on profile>
```

Suggestion logic:
- `minimal`: "Ready to graduate? Enable `profile: standard` in framework.yaml for Sherlock methodology, TDD subagents, and the review pipeline. See docs/ADOPTION.md for the day-by-day learning path."
- `standard`: "Consider `profile: full` when you're comfortable — adds visual QA, forensics, concurrency review, and architecture evaluation."
- `full`: "All features enabled."
- Missing/unknown: Default to "full" (matches init-project.sh behavior).
