#!/bin/bash
#
# TDD Commit Helper Script
# Purpose: Simplify TDD RED-GREEN-REFACTOR commits with validation
# Usage: ./scripts/tdd-commit.sh [red|green|refactor] "commit message"
#
# Examples:
#   ./scripts/tdd-commit.sh red "Add tests for UUID staleness (3 tests)"
#   ./scripts/tdd-commit.sh green "Implement UUID comparison"
#   ./scripts/tdd-commit.sh refactor "Extract to utility module"
#
# Shortcuts: r=red, g=green, ref=refactor
#

set -e

# Source shared framework library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_framework.sh"

cd "$FW_PROJECT_ROOT"

# Configure git worktree if needed
fw_setup_git_env

# Parse arguments (use ${1:-} to avoid set -u errors when no args provided)
PHASE="${1:-}"
MESSAGE="${2:-}"

if [ -z "$PHASE" ] || [ -z "$MESSAGE" ]; then
    echo -e "${FW_BLUE}TDD Commit Helper${FW_NC}"
    echo "======================================="
    echo ""
    echo "Usage: $0 [phase] \"message\""
    echo ""
    echo "Phases:"
    echo -e "  ${FW_RED}red${FW_NC}, r       Write failing tests (tests SHOULD fail)"
    echo -e "  ${FW_GREEN}green${FW_NC}, g     Make tests pass (tests MUST pass)"
    echo -e "  ${FW_BLUE}refactor${FW_NC}, ref  Improve code (tests MUST still pass)"
    echo ""
    echo "Examples:"
    echo "  $0 red \"Add tests for UUID staleness (3 tests)\""
    echo "  $0 g \"Implement UUID comparison\""
    echo "  $0 ref \"Extract to utility module\""
    echo ""
    exit 1
fi

# Normalize phase
case "$PHASE" in
    red|r)
        PHASE="red"
        PHASE_EMOJI="RED"
        PHASE_DESC="Writing failing tests"
        ;;
    green|g)
        PHASE="green"
        PHASE_EMOJI="GREEN"
        PHASE_DESC="Making tests pass"
        ;;
    refactor|ref)
        PHASE="refactor"
        PHASE_EMOJI="REFACTOR"
        PHASE_DESC="Improving without behavior change"
        ;;
    *)
        echo -e "${FW_RED}Error: Invalid phase '$PHASE'${FW_NC}"
        echo "Valid phases: red (r), green (g), refactor (ref)"
        exit 1
        ;;
esac

echo -e "${FW_BLUE}TDD Commit: [$PHASE_EMOJI] $PHASE phase${FW_NC}"
echo "Message: $MESSAGE"
echo "Description: $PHASE_DESC"
echo ""

# Read config for test validation
REQUIRE_TESTS=$(fw_get_nested "tdd.require_tests" "true")
BACKEND_TEST_CMD=$(fw_get_nested "stack.backend.test_command" "")
FRONTEND_TEST_CMD=$(fw_get_nested "stack.frontend.test_command" "")

# Security: allowlist of safe test runner commands (prevents injection via config)
# Anchored both ends; argument chars restricted to block shell metacharacters (&&, |, $(), ;, etc.)
ALLOWED_TEST_CMDS="^(pytest|python -m pytest|npm test|npx jest|yarn test)(\s+[a-zA-Z0-9_./:@=,-]+)*\s*$"

validate_test_cmd() {
    local cmd="$1"
    local label="$2"
    if ! echo "$cmd" | grep -qE "$ALLOWED_TEST_CMDS"; then
        echo -e "${FW_RED}ERROR: $label test command '$cmd' does not match allowed patterns${FW_NC}"
        echo "Allowed: pytest, python -m pytest, npm test, npx jest, yarn test"
        exit 1
    fi
}

# Validation for GREEN and REFACTOR phases
if [ "$PHASE" = "green" ] || [ "$PHASE" = "refactor" ]; then
    if [ "$REQUIRE_TESTS" = "true" ]; then
        echo -e "${FW_YELLOW}Running tests to validate $PHASE phase...${FW_NC}"

        # Run backend tests if configured
        if [ -n "$BACKEND_TEST_CMD" ]; then
            validate_test_cmd "$BACKEND_TEST_CMD" "Backend"
            echo -e "${FW_BLUE}Running backend tests: $BACKEND_TEST_CMD${FW_NC}"
            if bash -c "$BACKEND_TEST_CMD" 2>/dev/null; then
                echo -e "${FW_GREEN}Backend tests passing${FW_NC}"
            else
                echo ""
                echo -e "${FW_RED}Backend tests failing!${FW_NC}"
                if [ "$PHASE" = "green" ]; then
                    echo "Cannot commit GREEN phase with failing tests."
                    echo "Implementation is incomplete."
                else
                    echo "Cannot commit REFACTOR phase - behavior changed!"
                    echo "This should be a GREEN phase commit instead."
                fi
                exit 1
            fi
        fi

        # Run frontend tests if configured
        if [ -n "$FRONTEND_TEST_CMD" ]; then
            validate_test_cmd "$FRONTEND_TEST_CMD" "Frontend"
            echo -e "${FW_BLUE}Running frontend tests: $FRONTEND_TEST_CMD${FW_NC}"
            if bash -c "$FRONTEND_TEST_CMD" 2>/dev/null; then
                echo -e "${FW_GREEN}Frontend tests passing${FW_NC}"
            else
                echo ""
                echo -e "${FW_RED}Frontend tests failing!${FW_NC}"
                if [ "$PHASE" = "green" ]; then
                    echo "Cannot commit GREEN phase with failing tests."
                else
                    echo "Cannot commit REFACTOR phase - behavior changed!"
                fi
                exit 1
            fi
        fi

        if [ -z "$BACKEND_TEST_CMD" ] && [ -z "$FRONTEND_TEST_CMD" ]; then
            echo -e "${FW_YELLOW}No test commands configured - skipping validation${FW_NC}"
        else
            echo -e "${FW_GREEN}All tests passing - $PHASE phase valid${FW_NC}"
        fi
    fi
fi

# Read attribution from config
ATTRIBUTION=$(fw_get_nested "tdd.attribution" "")

# Create the commit
COMMIT_MSG="tdd($PHASE): $MESSAGE

[$PHASE_EMOJI] TDD $PHASE phase - $PHASE_DESC"

if [ -n "$ATTRIBUTION" ]; then
    COMMIT_MSG="$COMMIT_MSG

$ATTRIBUTION"
fi

echo ""
echo -e "${FW_BLUE}Creating commit...${FW_NC}"
git commit -m "$COMMIT_MSG"

echo ""
echo -e "${FW_GREEN}TDD commit created successfully!${FW_NC}"
echo "Commit: tdd($PHASE): $MESSAGE"

# Log TDD phase event (fire-and-forget, no error if unavailable)
# Pass message via env var to avoid shell/Python injection (see ADR-004)
TDD_PHASE="$PHASE" TDD_MESSAGE="$MESSAGE" FW_ROOT="$FW_PROJECT_ROOT" python3 -c "
import os, sys
sys.path.insert(0, os.environ['FW_ROOT'] + '/scripts')
try:
    from fw_event_log import append_event
    append_event('tdd_phase', 'tdd', {'phase': os.environ['TDD_PHASE'], 'message': os.environ['TDD_MESSAGE']}, hook='tdd_commit')
except Exception:
    pass
" 2>/dev/null || true
