#!/usr/bin/env python3
"""Framework event logging module.

Appends structured events to date-partitioned JSONL files under
.context/metrics/. Enabled/disabled via metrics.enabled in
config/framework.yaml. All writes are fire-and-forget (never raises).
"""

from __future__ import annotations

import fcntl
import json
import os
from datetime import datetime, timezone
from pathlib import Path

try:
    import yaml
    _YAML_AVAILABLE = True
except ImportError:
    _YAML_AVAILABLE = False

# ---------------------------------------------------------------------------
# Module-level constants
# ---------------------------------------------------------------------------

#: Prefix for all monthly event log filenames (e.g. "events-2026-01.jsonl").
_EVENTS_FILE_PREFIX = "events-"

#: Path to the metrics directory relative to the project root.
_METRICS_SUBDIR = Path(".context") / "metrics"

#: Default maximum total size of event log files (bytes).
_DEFAULT_MAX_BYTES = 50 * 1024 * 1024


def _is_enabled() -> bool:
    """Read metrics.enabled from config/framework.yaml. Returns False on any failure."""
    config_path = Path.cwd() / "config" / "framework.yaml"
    if not config_path.exists():
        return False
    try:
        text = config_path.read_text()
        if _YAML_AVAILABLE:
            data = yaml.safe_load(text)
            if isinstance(data, dict):
                metrics = data.get("metrics")
                if isinstance(metrics, dict):
                    return bool(metrics.get("enabled", False))
            return False
        else:
            # Simple line-by-line fallback
            in_metrics = False
            for line in text.splitlines():
                if line.strip() == "metrics:":
                    in_metrics = True
                    continue
                if in_metrics:
                    stripped = line.strip()
                    if stripped.startswith("enabled:"):
                        value = stripped.split(":", 1)[1].strip().lower()
                        return value == "true"
            return False
    except Exception:
        return False


def _get_metrics_dir() -> Path:
    """Return (and create) .context/metrics/ under the project root (cwd)."""
    metrics_dir = Path.cwd() / _METRICS_SUBDIR
    metrics_dir.mkdir(parents=True, exist_ok=True)
    return metrics_dir


def _rotate_if_needed(metrics_dir: Path, max_bytes: int) -> None:
    """Prune oldest monthly files (alphabetical sort) until total size < max_bytes."""
    files = sorted(metrics_dir.glob(f"{_EVENTS_FILE_PREFIX}*.jsonl"))
    if not files:
        return
    total = sum(f.stat().st_size for f in files)
    while total > max_bytes and files:
        oldest = files.pop(0)
        total -= oldest.stat().st_size
        oldest.unlink()


def get_session_id() -> str:
    """Read session_id from .claude/state/session-lock.json. Returns 'unknown' on failure."""
    lock_path = Path.cwd() / ".claude" / "state" / "session-lock.json"
    try:
        data = json.loads(lock_path.read_text())
        return data.get("session_id", "unknown") or "unknown"
    except Exception:
        return "unknown"


def append_event(
    event: str,
    category: str,
    data: dict,
    hook: str | None = None,
) -> None:
    """Append a single event record to the monthly JSONL file.

    Fire-and-forget: never raises. Silently skips if metrics are disabled.
    Uses fcntl.flock(LOCK_EX) for safe concurrent writes.
    """
    try:
        if not _is_enabled():
            return

        metrics_dir = _get_metrics_dir()
        now = datetime.now(timezone.utc)
        month_str = now.strftime("%Y-%m")
        jsonl_path = metrics_dir / f"{_EVENTS_FILE_PREFIX}{month_str}.jsonl"

        record = {
            "sid": get_session_id(),
            "ts": now.isoformat(),
            "event": event,
            "category": category,
            "data": data,
            "hook": hook,
        }

        line = json.dumps(record) + "\n"

        with open(jsonl_path, "a", encoding="utf-8") as fh:
            fcntl.flock(fh, fcntl.LOCK_EX)
            fh.write(line)
            fcntl.flock(fh, fcntl.LOCK_UN)

        _rotate_if_needed(metrics_dir, _DEFAULT_MAX_BYTES)
    except Exception:
        return


def read_events(
    since: str | None = None,
    event_type: str | None = None,
    category: str | None = None,
) -> list[dict]:
    """Read events from all monthly JSONL files, with optional filters.

    Args:
        since: ISO date string (YYYY-MM-DD). Skip files/records before this date.
        event_type: Only return records where event == event_type.
        category: Only return records where category matches.

    Returns:
        List of event dicts. Malformed JSON lines are silently skipped.
    """
    metrics_dir = Path.cwd() / _METRICS_SUBDIR
    if not metrics_dir.exists():
        return []

    results: list[dict] = []
    files = sorted(metrics_dir.glob(f"{_EVENTS_FILE_PREFIX}*.jsonl"))

    for path in files:
        # If since is set, skip files whose month is entirely before the cutoff
        if since:
            # Extract YYYY-MM from filename
            name = path.stem  # events-YYYY-MM
            year_month = name[len("events-"):]  # YYYY-MM
            # Compare YYYY-MM against the since YYYY-MM prefix
            since_ym = since[:7]  # YYYY-MM
            if year_month < since_ym:
                continue

        try:
            text = path.read_text(encoding="utf-8")
        except Exception:
            continue

        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue

            # since filter: check the actual ts field
            if since and record.get("ts", "") < since:
                continue
            if event_type and record.get("event") != event_type:
                continue
            if category and record.get("category") != category:
                continue

            results.append(record)

    return results
