#!/bin/bash
# init-project.sh - First-time setup wizard for dev-framework projects
#
# This script:
# 1.  Replaces placeholder tokens in CLAUDE.md
# 2.  Sets up .claude/rules/ from templates
# 3.  Sets up .claude/skills/ from templates
# 4.  Sets up Claude hooks (settings.local.json)
# 5.  Distributes agents (optional)
# 6.  Distributes skills (optional)
# 7.  Scaffolds stack dependency files (requirements.txt, etc.)
# 8.  Makes all scripts executable
# 9.  Initializes git (if not already)
# 10. Sets up state directory
# 11. Version setup
# 12. Prompt versioning (opt-in)
# 13. QA reports directory
# 14. Retro storage directory
#
# Usage: ./scripts/init-project.sh
#        Or let Claude run it: `claude` then "set up this project"

set -e

# Source shared framework library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_framework.sh"

cd "$FW_PROJECT_ROOT"

TOTAL_STEPS=14

# Helper: enable/disable a config-driven item (rule file or skill directory)
# Usage: handle_item <enabled> <type> <path> <label>
#   type: "file" (rm file if disabled) or "dir" (rm -rf dir if disabled)
handle_item() {
    local enabled="$1" type="$2" path="$3" label="$4"
    if [ "$enabled" = "true" ] && [ -e "$path" ]; then
        return 0  # exists and enabled, count it
    elif [ "$enabled" = "false" ] && [ -e "$path" ]; then
        if [ "$type" = "file" ]; then
            rm "$path"
        else
            rm -rf "$path"
        fi
        echo "    Removed $label (disabled in config)"
        return 1
    fi
    return 1  # doesn't exist
}

echo ""
echo "================================================================"
echo "  dev-framework Project Setup"
echo "================================================================"
echo ""

# Validate required config
fw_require "project.name" "project.repo"

PROJECT_NAME=$(fw_get_nested "project.name")
PROJECT_REPO=$(fw_get_nested "project.repo")
PROJECT_DESC=$(fw_get_nested "project.description" "")

echo "  Project: $PROJECT_NAME"
echo "  Repo: $PROJECT_REPO"
[ -n "$PROJECT_DESC" ] && echo "  Description: $PROJECT_DESC"
echo ""

# Profile-based configuration
PROFILE=$(fw_get_nested "profile" "full")
echo "  Profile: $PROFILE"

# Apply profile defaults — these override individual toggles when a profile
# is explicitly set. Teams can still override individual settings afterward.
apply_profile() {
    local profile="$1"
    case "$profile" in
        minimal)
            # Safety gates + Hudson mode only
            echo "    Applying minimal profile (safety gates + Hudson)..."
            sedi 's/^  database_migrations:.*/  database_migrations: false/' "$FW_PROJECT_ROOT/config/framework.yaml"
            sedi 's/^  sherlock_review_gate:.*/  sherlock_review_gate: false/' "$FW_PROJECT_ROOT/config/framework.yaml"
            sedi 's/^  deploy:.*/  deploy: false/' "$FW_PROJECT_ROOT/config/framework.yaml"
            sedi 's/^  health:.*/  health: false/' "$FW_PROJECT_ROOT/config/framework.yaml"
            sedi 's/^  release_notes:.*/  release_notes: false/' "$FW_PROJECT_ROOT/config/framework.yaml"
            sedi 's/^  schema_check:.*/  schema_check: false/' "$FW_PROJECT_ROOT/config/framework.yaml"
            sedi 's/^  browse:.*/  browse: false/' "$FW_PROJECT_ROOT/config/framework.yaml"
            sedi 's/^  qa:.*/  qa: false/' "$FW_PROJECT_ROOT/config/framework.yaml"
            sedi 's/^  retro:.*/  retro: false/' "$FW_PROJECT_ROOT/config/framework.yaml"
            sedi 's/^  tdd_commit:.*/  tdd_commit: false/' "$FW_PROJECT_ROOT/config/framework.yaml"
            sedi 's/^  ship:.*/  ship: false/' "$FW_PROJECT_ROOT/config/framework.yaml"
            ;;
        standard)
            # Safety + Sherlock + core skills
            echo "    Applying standard profile (safety + Sherlock + core skills)..."
            sedi 's/^  database_migrations:.*/  database_migrations: true/' "$FW_PROJECT_ROOT/config/framework.yaml"
            sedi 's/^  sherlock_review_gate:.*/  sherlock_review_gate: true/' "$FW_PROJECT_ROOT/config/framework.yaml"
            sedi 's/^  deploy:.*/  deploy: true/' "$FW_PROJECT_ROOT/config/framework.yaml"
            sedi 's/^  health:.*/  health: true/' "$FW_PROJECT_ROOT/config/framework.yaml"
            sedi 's/^  release_notes:.*/  release_notes: true/' "$FW_PROJECT_ROOT/config/framework.yaml"
            sedi 's/^  schema_check:.*/  schema_check: false/' "$FW_PROJECT_ROOT/config/framework.yaml"
            sedi 's/^  browse:.*/  browse: false/' "$FW_PROJECT_ROOT/config/framework.yaml"
            sedi 's/^  qa:.*/  qa: false/' "$FW_PROJECT_ROOT/config/framework.yaml"
            sedi 's/^  retro:.*/  retro: false/' "$FW_PROJECT_ROOT/config/framework.yaml"
            sedi 's/^  tdd_commit:.*/  tdd_commit: true/' "$FW_PROJECT_ROOT/config/framework.yaml"
            sedi 's/^  ship:.*/  ship: true/' "$FW_PROJECT_ROOT/config/framework.yaml"
            ;;
        full)
            # Everything enabled (no changes needed — full is the default)
            echo "    Full profile — all features enabled"
            ;;
        *)
            echo "    ⚠  Unknown profile '$profile' — using full"
            ;;
    esac
}

# Apply profile if not "full" (full is the default, no changes needed)
if [ "$PROFILE" != "full" ]; then
    apply_profile "$PROFILE"
fi
echo ""

# Step 1: Replace placeholders in CLAUDE.md
echo "  [1/$TOTAL_STEPS] Updating CLAUDE.md placeholders..."
if [ -f "CLAUDE.md" ]; then
    # Replace common placeholders
    sedi "s/my-project/$PROJECT_NAME/g" CLAUDE.md
    sedi "s|myorg/my-project|$PROJECT_REPO|g" CLAUDE.md
    echo "    CLAUDE.md updated"
else
    echo "    CLAUDE.md not found (skipping)"
fi

# Step 2: Set up Claude rules
echo "  [2/$TOTAL_STEPS] Setting up Claude rules..."
if [ -d ".claude/rules" ]; then
    RULES_COPIED=0

    ANTI_PATTERNS=$(fw_get_nested "rules.anti_patterns" "true")
    SECURITY=$(fw_get_nested "rules.security" "true")
    DB_MIGRATIONS=$(fw_get_nested "rules.database_migrations" "true")
    SHERLOCK=$(fw_get_nested "rules.sherlock_review_gate" "true")

    handle_item "$ANTI_PATTERNS" file ".claude/rules/anti-patterns.md" "anti-patterns.md" && RULES_COPIED=$((RULES_COPIED + 1))
    handle_item "$SECURITY" file ".claude/rules/security.md" "security.md" && RULES_COPIED=$((RULES_COPIED + 1))
    handle_item "$DB_MIGRATIONS" file ".claude/rules/database-migrations.md" "database-migrations.md" && RULES_COPIED=$((RULES_COPIED + 1))
    handle_item "$SHERLOCK" file ".claude/rules/sherlock-review-gate.md" "sherlock-review-gate.md" && RULES_COPIED=$((RULES_COPIED + 1))
    handle_item "$SHERLOCK" file ".claude/rules/sherlock-methodology.md" "sherlock-methodology.md" && RULES_COPIED=$((RULES_COPIED + 1))

    echo "    $RULES_COPIED rule files active"
else
    echo "    .claude/rules/ not found (skipping)"
fi

# Step 3: Set up Claude skills
echo "  [3/$TOTAL_STEPS] Setting up Claude skills..."
if [ -d ".claude/skills" ]; then
    SKILLS_COPIED=0

    DEPLOY=$(fw_get_nested "skills.deploy" "true")
    HEALTH=$(fw_get_nested "skills.health" "true")
    RELEASE_NOTES=$(fw_get_nested "skills.release_notes" "true")
    SCHEMA_CHECK=$(fw_get_nested "skills.schema_check" "true")
    BROWSE=$(fw_get_nested "skills.browse" "true")
    QA=$(fw_get_nested "skills.qa" "true")
    RETRO=$(fw_get_nested "skills.retro" "true")
    TDD_COMMIT=$(fw_get_nested "skills.tdd_commit" "true")
    SHIP=$(fw_get_nested "skills.ship" "true")

    handle_item "$DEPLOY" dir ".claude/skills/deploy" "deploy skill" && SKILLS_COPIED=$((SKILLS_COPIED + 1))
    handle_item "$HEALTH" dir ".claude/skills/health" "health skill" && SKILLS_COPIED=$((SKILLS_COPIED + 1))
    handle_item "$RELEASE_NOTES" dir ".claude/skills/release-notes" "release-notes skill" && SKILLS_COPIED=$((SKILLS_COPIED + 1))
    handle_item "$SCHEMA_CHECK" dir ".claude/skills/schema-check" "schema-check skill" && SKILLS_COPIED=$((SKILLS_COPIED + 1))
    handle_item "$BROWSE" dir ".claude/skills/browse" "browse skill" && SKILLS_COPIED=$((SKILLS_COPIED + 1))
    handle_item "$QA" dir ".claude/skills/qa" "qa skill" && SKILLS_COPIED=$((SKILLS_COPIED + 1))
    handle_item "$RETRO" dir ".claude/skills/retro" "retro skill" && SKILLS_COPIED=$((SKILLS_COPIED + 1))
    handle_item "$TDD_COMMIT" dir ".claude/skills/tdd-commit" "tdd-commit skill" && SKILLS_COPIED=$((SKILLS_COPIED + 1))
    handle_item "$SHIP" dir ".claude/skills/ship" "ship skill" && SKILLS_COPIED=$((SKILLS_COPIED + 1))

    echo "    $SKILLS_COPIED skills active"
else
    echo "    .claude/skills/ not found (skipping)"
fi

# Step 4: Set up Claude hooks
echo "  [4/$TOTAL_STEPS] Setting up Claude hooks..."
if [ -f ".claude/settings.local.json.template" ] && [ ! -f ".claude/settings.local.json" ]; then
    cp ".claude/settings.local.json.template" ".claude/settings.local.json"
    echo "    settings.local.json created from template"
elif [ -f ".claude/settings.local.json" ]; then
    echo "    settings.local.json already exists (keeping existing)"
else
    echo "    No template found (skipping)"
fi

# Step 5: Distribute agents (optional)
echo "  [5/$TOTAL_STEPS] Agent distribution..."
DISTRIBUTE_AGENTS=$(fw_get_nested "team.distribute_agents" "false")
if [ "$DISTRIBUTE_AGENTS" = "true" ]; then
    GLOBAL_AGENTS_DIR="$HOME/.claude/agents"
    LOCAL_AGENTS_DIR=".claude/agents"
    mkdir -p "$LOCAL_AGENTS_DIR"
    if [ -d "$GLOBAL_AGENTS_DIR" ]; then
        AGENTS_COPIED=0
        for agent_file in "$GLOBAL_AGENTS_DIR"/*.md; do
            [ ! -f "$agent_file" ] && continue
            agent_name=$(basename "$agent_file")
            [ "$agent_name" = "AGENT_TEMPLATE.md" ] && continue
            cp "$agent_file" "$LOCAL_AGENTS_DIR/$agent_name"
            AGENTS_COPIED=$((AGENTS_COPIED + 1))
        done
        echo "    $AGENTS_COPIED agents distributed to .claude/agents/"
    else
        echo "    No global agents found at $GLOBAL_AGENTS_DIR"
    fi
else
    echo "    Agent distribution disabled (set team.distribute_agents: true)"
fi

# Step 6: Distribute skills (optional)
echo "  [6/$TOTAL_STEPS] Skill distribution..."
DISTRIBUTE_SKILLS=$(fw_get_nested "team.distribute_skills" "false")
if [ "$DISTRIBUTE_SKILLS" = "true" ]; then
    GLOBAL_SKILLS_DIR="$HOME/.claude/skills"
    LOCAL_SKILLS_DIR=".claude/skills"
    if [ -d "$GLOBAL_SKILLS_DIR" ]; then
        SKILLS_DIST=0
        for skill_dir in "$GLOBAL_SKILLS_DIR"/*/; do
            [ ! -d "$skill_dir" ] && continue
            skill_name=$(basename "$skill_dir")
            if [ -f "$skill_dir/SKILL.md" ] && [ ! -d "$LOCAL_SKILLS_DIR/$skill_name" ]; then
                mkdir -p "$LOCAL_SKILLS_DIR/$skill_name"
                cp "$skill_dir/SKILL.md" "$LOCAL_SKILLS_DIR/$skill_name/"
                SKILLS_DIST=$((SKILLS_DIST + 1))
            fi
        done
        echo "    $SKILLS_DIST new skills distributed to .claude/skills/"
    fi
else
    echo "    Skill distribution disabled (set team.distribute_skills: true)"
fi

# Step 7: Scaffold stack dependency files
echo "  [7/$TOTAL_STEPS] Scaffolding stack dependencies..."
BACKEND_LANG=$(fw_get_nested "stack.backend.language" "")
FRONTEND_LANG=$(fw_get_nested "stack.frontend.language" "")

SCAFFOLDED=0

# Python backend: ensure requirements.txt exists so CI installs pytest
if [ "$BACKEND_LANG" = "python" ]; then
    BACKEND_TEST_CMD=$(fw_get_nested "stack.backend.test_command" "")
    if [ ! -f "requirements.txt" ] && [ ! -f "backend/requirements.txt" ]; then
        # Determine which test runner is configured
        if echo "$BACKEND_TEST_CMD" | grep -q "pytest"; then
            echo "pytest>=7.0" > requirements.txt
            echo "    Created requirements.txt (pytest — needed by CI to run test_command)"
        else
            touch requirements.txt
            echo "    Created empty requirements.txt (add your dependencies)"
        fi
        SCAFFOLDED=$((SCAFFOLDED + 1))
    else
        echo "    requirements.txt already exists"
    fi
fi

# Node.js frontend: ensure package.json exists so CI can install/test
if [ "$FRONTEND_LANG" = "typescript" ] || [ "$FRONTEND_LANG" = "javascript" ]; then
    if [ ! -f "package.json" ] && [ ! -f "frontend/package.json" ]; then
        echo "    ⚠  No package.json found — CI frontend tests will be skipped"
        echo "       Run 'npm init' or 'cd frontend && npm init' to enable"
    fi
fi

if [ $SCAFFOLDED -eq 0 ] && [ -z "$BACKEND_LANG" ] && [ -z "$FRONTEND_LANG" ]; then
    echo "    No stack configured (remove stack section from framework.yaml if intentional)"
fi

# Step 8: Make all scripts executable
echo "  [8/$TOTAL_STEPS] Making scripts executable..."
chmod +x scripts/*.sh 2>/dev/null || true
chmod +x .claude/hooks/*.py 2>/dev/null || true
echo "    All scripts made executable"

# Step 9: Initialize git
echo "  [9/$TOTAL_STEPS] Checking git repository..."
if [ -d ".git" ] || [ -f ".git" ]; then
    echo "    Git repository already initialized"
else
    git init
    echo "    Git repository initialized"
fi

# Step 10: Create state directory
echo "  [10/$TOTAL_STEPS] Setting up state directory..."
mkdir -p .claude/state
if [ ! -f ".claude/state/.gitkeep" ]; then
    touch .claude/state/.gitkeep
    echo "    .claude/state/ created with .gitkeep"
else
    echo "    .claude/state/ already exists"
fi

# Step 11: Version setup
echo "  [11/$TOTAL_STEPS] Version setup..."
VERSION_SOURCE=$(fw_get_nested "versioning.primary_source" "package.json")
if [ -f "$VERSION_SOURCE" ]; then
    VERSION=$(grep -oE '[0-9]+\.[0-9]+\.[0-9]+' "$VERSION_SOURCE" | head -1)
    if [ -n "$VERSION" ]; then
        if git rev-parse "v$VERSION" >/dev/null 2>&1; then
            echo "    Tag v$VERSION already exists"
        else
            echo "    Version: $VERSION (from $VERSION_SOURCE)"
            echo "    (Tag will be created on first commit)"
        fi
    fi
else
    echo "    Version source not found: $VERSION_SOURCE"
    echo "    Create it before running bump-version.sh"
fi

# Step 12: Prompt versioning (opt-in)
echo "  [12/$TOTAL_STEPS] Checking prompt versioning..."
PROMPT_VERSIONING=$(fw_get_nested "prompts.versioning" "false")
if [ "$PROMPT_VERSIONING" = "true" ]; then
    SNAPSHOT_DIR=$(fw_get_nested "prompts.snapshot_dir" "prompt_snapshots")
    mkdir -p "$SNAPSHOT_DIR"
    mkdir -p "prompts"
    echo "    Prompt versioning enabled (snapshots: $SNAPSHOT_DIR)"
else
    echo "    Prompt versioning disabled (set prompts.versioning: true to enable)"
fi

# Step 13: QA reports directory
echo "  [13/$TOTAL_STEPS] Setting up QA reports..."
QA_ENABLED=$(fw_get_nested "qa.enabled" "true")
if [ "$QA_ENABLED" = "true" ]; then
    QA_REPORT_DIR=$(fw_get_nested "qa.report_dir" ".qa-reports")
    mkdir -p "$QA_REPORT_DIR"
    echo "    QA reports directory: $QA_REPORT_DIR"
else
    echo "    QA disabled (set qa.enabled: true)"
fi

# Step 14: Retro storage directory
echo "  [14/$TOTAL_STEPS] Setting up retro storage..."
RETRO_ENABLED=$(fw_get_nested "retro.enabled" "true")
if [ "$RETRO_ENABLED" = "true" ]; then
    RETRO_DIR=$(fw_get_nested "retro.storage_dir" ".context/retros")
    mkdir -p "$RETRO_DIR"
    if [ ! -f "$RETRO_DIR/.gitkeep" ]; then
        touch "$RETRO_DIR/.gitkeep"
    fi
    echo "    Retro storage: $RETRO_DIR"
else
    echo "    Retro disabled (set retro.enabled: true)"
fi

echo ""
echo "================================================================"
echo "  Your framework is ready!"
echo "================================================================"
echo ""
echo "Next steps:"
echo "  1. Review CLAUDE.md and update any remaining <!-- CUSTOMIZE --> markers"
echo "  2. Review .claude/rules/ and customize for your stack"
echo "  3. Configure GitHub secrets (see SETUP.md)"
echo "  4. Make your first commit"
echo "  5. Start a Claude session: ./scripts/claude-session.sh feature/first-feature"
echo "  6. Generate shell alias: ./scripts/generate-shell-alias.sh"
echo ""
echo "Run ./scripts/preflight.sh to verify everything is set up correctly."
echo ""
