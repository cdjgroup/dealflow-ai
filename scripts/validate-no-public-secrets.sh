#!/bin/bash
# validate-no-public-secrets.sh - Check for leaked secrets in public-facing code
#
# Reads allowlist from config/secret-guard-allowlist.yaml
#
# Usage: ./scripts/validate-no-public-secrets.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_framework.sh"

cd "$FW_PROJECT_ROOT"

ALLOWLIST="$FW_PROJECT_ROOT/config/secret-guard-allowlist.yaml"

echo "Scanning for potential secrets in public-facing code..."

FOUND=0

# Check for common secret patterns
for pattern in "API_KEY=" "SECRET_KEY=" "PASSWORD=" "TOKEN=" "PRIVATE_KEY=" "API[-_]KEY=" "APIKEY=" "PASSWD=" "BEARER=" "CREDENTIAL=" "AUTH_SECRET=" "SIGNING_KEY=" "ENCRYPTION_KEY=" "CLIENT_SECRET="; do
    # Search in common source directories
    matches=$(grep -rn "$pattern" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.py" --include="*.yaml" --include="*.yml" \
        --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=venv --exclude-dir=__pycache__ \
        "$FW_PROJECT_ROOT" 2>/dev/null | grep -v "process.env" | grep -v "os.environ" | grep -v "secrets\." | grep -v "config/secret-guard" | grep -v "test" | grep -v "#" || true)

    if [ -n "$matches" ]; then
        # Check against allowlist
        while IFS= read -r line; do
            allowed=false
            # Check allowed_prefixes
            if [ -f "$ALLOWLIST" ]; then
                while IFS= read -r prefix; do
                    prefix=$(echo "$prefix" | sed 's/^[- ]*//' | tr -d '"' | tr -d "'")
                    if [ -n "$prefix" ] && echo "$line" | grep -q "$prefix"; then
                        allowed=true
                        break
                    fi
                done < <(grep -A20 "allowed_prefixes:" "$ALLOWLIST" 2>/dev/null | grep "^  -" | sed 's/^  - //')
            fi

            if [ "$allowed" = false ]; then
                echo -e "${FW_YELLOW}  Potential secret: $line${FW_NC}"
                FOUND=$((FOUND + 1))
            fi
        done <<< "$matches"
    fi
done

if [ $FOUND -eq 0 ]; then
    echo -e "${FW_GREEN}No potential secrets found${FW_NC}"
else
    echo ""
    echo -e "${FW_YELLOW}Found $FOUND potential secret(s). Review above lines.${FW_NC}"
    echo "To allowlist, add to config/secret-guard-allowlist.yaml"
    exit 1
fi
