#!/bin/bash
# codex-hooks-install.sh - Idempotently register ShipTeam's Codex PreToolUse
# hooks (safety gate + session-lock guard) into the operator's own
# $CODEX_HOME/config.toml.
#
# `shipteam init --host codex` prints the TOML block an operator needs but
# cannot write it for them (it lives outside the project, in the operator's
# own home directory). This script closes that "paste it by hand" gap.
#
# It does NOT and cannot replace the one remaining manual step: Codex has no
# non-interactive hook pre-trust (ADR-035, upstream #21615), so you still
# have to run `/hooks` inside a Codex session once to trust these entries —
# until then they're registered but inert.
#
# Usage:
#   ./scripts/codex-hooks-install.sh              # Install into $CODEX_HOME/config.toml
#   ./scripts/codex-hooks-install.sh --dry-run    # Show what would change, write nothing
#   ./scripts/codex-hooks-install.sh --codex-home /path/to/.codex
#
# Idempotent: safe to re-run. Detects each hook entry independently (exact-line
# match) and appends only the ones missing -- a partial install (e.g. only one
# hook present, from a manual edit or an interrupted prior run) is repaired
# without duplicating the entry that's already there.
# Backs up config.toml (timestamped) before writing, whenever one exists.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/_framework.sh
source "$SCRIPT_DIR/_framework.sh"

CODEX_HOME_DIR="${CODEX_HOME:-$HOME/.codex}"
DRY_RUN=0

while [ $# -gt 0 ]; do
    case "$1" in
        --codex-home)
            if [ $# -lt 2 ]; then
                echo "ERROR: --codex-home requires a value" >&2
                exit 1
            fi
            CODEX_HOME_DIR="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=1
            shift
            ;;
        --help|-h)
            sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *)
            echo "ERROR: unknown argument: $1" >&2
            exit 1
            ;;
    esac
done

if [ ! -d "$CODEX_HOME_DIR" ]; then
    echo "ERROR: Codex home not found: $CODEX_HOME_DIR" >&2
    echo "       Run the Codex CLI at least once to create it, or pass --codex-home." >&2
    exit 1
fi

CONFIG_TOML="$CODEX_HOME_DIR/config.toml"
GATE_PATH="$FW_PROJECT_ROOT/.claude/hooks/auto-approve.py"
GUARD_PATH="$FW_PROJECT_ROOT/.claude/hooks/checkout-guard.py"

for p in "$GATE_PATH" "$GUARD_PATH"; do
    if [ ! -f "$p" ]; then
        echo "ERROR: expected hook script not found: $p" >&2
        exit 1
    fi
done

python3 - "$CONFIG_TOML" "$GATE_PATH" "$GUARD_PATH" "$FW_PROJECT_ROOT" "$DRY_RUN" <<'PYEOF'
import re
import shutil
import sys
import tomllib
from datetime import datetime
from pathlib import Path

config_path_str, gate_path, guard_path, project_root, dry_run_str = sys.argv[1:6]
config_path = Path(config_path_str)
dry_run = dry_run_str == "1"

sys.path.insert(0, str(Path(project_root) / "src"))
from shipteam.codex_config import CodexHookSpec, render_codex_config_multi  # noqa: E402

specs = [
    CodexHookSpec(gate_path, status_message="ShipTeam safety gate"),
    CodexHookSpec(guard_path, status_message="ShipTeam session-lock guard"),
]

# Render each spec independently (rather than one combined call) so a partial
# install -- one hook present, one missing, e.g. from a manual edit or an
# interrupted prior run -- can be detected and repaired precisely: only the
# missing block gets appended, never a duplicate of the block already there.
rendered_blocks = []
for spec in specs:
    rendered = render_codex_config_multi([spec])
    header, _, block_text = rendered.partition("\n\n")
    assert header == "[features]\nhooks = true", f"unexpected renderer header: {header!r}"
    block_text = block_text.rstrip("\n")
    command_line = next(line for line in block_text.splitlines() if line.startswith("command = "))
    rendered_blocks.append((command_line, block_text))

content = config_path.read_text(encoding="utf-8") if config_path.exists() else ""

# Bug D migration: Codex >= v0.144.5 deprecated the `codex_hooks` feature flag in
# favor of `hooks`. Older installs (or hand-pasted blocks predating the rename)
# left a `codex_hooks = ...` line; a newer install appended `hooks = true`
# alongside it rather than removing the stale one, so Codex now prints a
# deprecation warning on every launch. Strip every `codex_hooks = ...` line here
# (the `hooks` key handled below is the live switch); done BEFORE the early-exit
# and the [features] detection so a config that is otherwise fully installed but
# still carries the deprecated key is repaired, and so downstream offsets are
# computed against the cleaned content.
#
# Assumes `codex_hooks` has a SINGLE-LINE value (it is always a boolean in
# practice) — this regex would strip only the first line of a hypothetical
# multi-line value. If that assumption ever breaks, the post-write tomllib.load()
# validation + backup-restore below catches the resulting invalid TOML rather
# than silently corrupting the config.
content, codex_hooks_removed = re.subn(
    r"^[ \t]*codex_hooks[ \t]*=.*\n?", "", content, flags=re.MULTILINE
)


def _line_present(line, text):
    # Exact-line match, not substring: a commented-out `# command = "..."` (a
    # user disabling the hook) contains the bare command string as a
    # substring but must NOT read as "already installed".
    return re.search(r"^" + re.escape(line) + r"\s*$", text, re.MULTILINE) is not None


missing_blocks = [block_text for command_line, block_text in rendered_blocks if not _line_present(command_line, content)]

if not missing_blocks and not codex_hooks_removed:
    print(f"Already installed: both ShipTeam hook entries found in {config_path}. No changes made.")
    sys.exit(0)

if not missing_blocks and codex_hooks_removed:
    print(
        f"Both ShipTeam hook entries already present; migrating {codex_hooks_removed} "
        f"deprecated `codex_hooks` line(s) to rely on `hooks` (Codex >= v0.144.5)."
    )

if len(missing_blocks) < len(rendered_blocks):
    print(
        f"Repairing partial install: {len(rendered_blocks) - len(missing_blocks)} of "
        f"{len(rendered_blocks)} hook entries already present; appending the rest."
    )

hook_blocks_text = "\n".join(missing_blocks)

features_match = re.search(r"^\[features\]\s*$", content, re.MULTILINE)
if features_match:
    table_start = features_match.end()
    next_table = re.search(r"^\[", content[table_start:], re.MULTILINE)
    table_end = table_start + next_table.start() if next_table else len(content)
    table_body = content[table_start:table_end]
    # \b (not \s*$) so a trailing inline comment -- `hooks = true  # note` --
    # still reads as effectively true instead of triggering the "not `true`"
    # warning below for a value that already is true.
    hooks_true = re.search(r"^hooks\s*=\s*true\b", table_body, re.MULTILINE)
    hooks_key = re.search(r"^hooks\s*=.*$", table_body, re.MULTILINE)
else:
    hooks_true = hooks_key = None

if dry_run:
    print(f"[dry-run] Would back up {config_path} (if it exists) and write:")
    print()
    if codex_hooks_removed:
        print(f"(would remove {codex_hooks_removed} deprecated `codex_hooks` line(s); `hooks` is the current switch)")
    if features_match:
        if hooks_true:
            print("(existing [features] table already has `hooks = true` — left as-is)")
        elif hooks_key:
            print(f"WARNING: existing [features] has {hooks_key.group(0).strip()!r} (not `true`) — would NOT override; hooks will not fire until this reads `true`.")
        else:
            print("(would insert `hooks = true` into the existing [features] table)")
    else:
        print("(no existing [features] table — would append one with `hooks = true`)")
    print()
    print("--- hook blocks that would be appended ---")
    print(hook_blocks_text)
    sys.exit(0)

def _ensure_trailing_blank_line(text):
    if not text:
        return text
    if not text.endswith("\n"):
        text += "\n"
    if not text.endswith("\n\n"):
        text += "\n"
    return text


config_existed_before = config_path.exists()

backup_path = None
if config_existed_before:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S%f")
    backup_path = config_path.with_name(config_path.name + f".bak-{stamp}")
    shutil.copy2(config_path, backup_path)
    print(f"Backed up {config_path} -> {backup_path}")
else:
    config_path.parent.mkdir(parents=True, exist_ok=True)

if features_match:
    if hooks_true:
        pass
    elif hooks_key:
        print(
            f"WARNING: existing [features] has {hooks_key.group(0).strip()!r} (not `true`) — "
            "leaving it as-is. Codex hooks will NOT fire until this reads `true`.",
            file=sys.stderr,
        )
    else:
        insertion_point = features_match.end()
        content = content[:insertion_point] + "\nhooks = true" + content[insertion_point:]
else:
    content = _ensure_trailing_blank_line(content)
    content += "[features]\nhooks = true\n"

if hook_blocks_text:
    # May be empty on a migration-only run (hooks already installed, only the
    # deprecated `codex_hooks` line needed removing) — don't append a stray block.
    content = _ensure_trailing_blank_line(content)
    content += hook_blocks_text + "\n"

config_path.write_text(content, encoding="utf-8")

try:
    with open(config_path, "rb") as f:
        tomllib.load(f)
except Exception as exc:
    if backup_path is not None:
        shutil.copy2(backup_path, config_path)
        print(f"ERROR: generated config.toml is invalid TOML, restored backup: {exc}", file=sys.stderr)
    else:
        # No pre-existing file means no backup -- unlink the broken file we
        # just wrote so failure leaves the true prior state (no file), not a
        # newly-created broken one.
        config_path.unlink()
        print(f"ERROR: generated config.toml is invalid TOML, removed it (no prior file to restore): {exc}", file=sys.stderr)
    sys.exit(1)

print(f"Installed ShipTeam Codex hooks into {config_path}")
print(
    "ACTION REQUIRED: run `/hooks` in Codex to trust the safety gate and "
    "session-lock guard — they will NOT fire until trusted."
)
PYEOF
