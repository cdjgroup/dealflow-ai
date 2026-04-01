#!/bin/bash
# notify.sh - Send notifications to Discord or Slack
#
# Reads notification config from framework.yaml:
#   notifications.provider: "discord" | "slack" | "none"
#   notifications.webhook_env: name of env var holding webhook URL
#
# Usage:
#   ./scripts/notify.sh success "Deployment complete"
#   ./scripts/notify.sh failure "Tests failed on main"
#   ./scripts/notify.sh warning "Fast deploy used - monitor closely"

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_framework.sh"

# ── Arguments ──────────────────────────────────────────────────────────────
MSG_TYPE="${1:-info}"
MSG_TEXT="${2:-No message provided}"

if [ "$#" -lt 1 ]; then
    echo "Usage: $0 <success|failure|warning> <message>"
    exit 0
fi

# Validate message type
case "$MSG_TYPE" in
    success|failure|warning) ;;
    *)
        echo "Invalid message type: $MSG_TYPE (use: success, failure, warning)" >&2
        exit 1
        ;;
esac

# ── Read config ────────────────────────────────────────────────────────────
PROVIDER=$(fw_get_nested "notifications.provider" "none")
WEBHOOK_ENV=$(fw_get_nested "notifications.webhook_env" "NOTIFICATION_WEBHOOK_URL")
PROJECT_NAME=$(fw_get_nested "project.name" "unknown")

if [ "$PROVIDER" = "none" ]; then
    echo "Notifications not configured (provider: none). Skipping."
    exit 0
fi

# Get webhook URL from environment variable
WEBHOOK_URL="${!WEBHOOK_ENV:-}"

if [ -z "$WEBHOOK_URL" ]; then
    echo "Webhook URL not set (env var: $WEBHOOK_ENV). Skipping notification."
    exit 0
fi

# ── Build payload ──────────────────────────────────────────────────────────

# Type-specific formatting
case "$MSG_TYPE" in
    success)
        EMOJI="[SUCCESS]"
        COLOR=3066993     # Green (Discord embed color)
        SLACK_COLOR="good"
        ;;
    failure)
        EMOJI="[FAILURE]"
        COLOR=15158332    # Red
        SLACK_COLOR="danger"
        ;;
    warning)
        EMOJI="[WARNING]"
        COLOR=16776960    # Yellow
        SLACK_COLOR="warning"
        ;;
esac

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# ── Escape strings for JSON safety ────────────────────────────────────────
# Prevents JSON injection from message text or project names containing
# quotes, backslashes, newlines, or other special characters.
json_escape() {
    local str="$1"
    str="${str//\\/\\\\}"    # Backslash first (before other escapes)
    str="${str//\"/\\\"}"    # Double quotes
    str="${str//$'\n'/\\n}"  # Newlines
    str="${str//$'\r'/\\r}"  # Carriage returns
    str="${str//$'\t'/\\t}"  # Tabs
    echo "$str"
}

SAFE_MSG=$(json_escape "$MSG_TEXT")
SAFE_PROJECT=$(json_escape "$PROJECT_NAME")

# ── Send notification ──────────────────────────────────────────────────────

if [ "$PROVIDER" = "discord" ]; then
    PAYLOAD=$(cat <<EOF
{
  "embeds": [{
    "title": "$EMOJI $SAFE_PROJECT",
    "description": "$SAFE_MSG",
    "color": $COLOR,
    "timestamp": "$TIMESTAMP"
  }]
}
EOF
)
elif [ "$PROVIDER" = "slack" ]; then
    PAYLOAD=$(cat <<EOF
{
  "attachments": [{
    "color": "$SLACK_COLOR",
    "title": "$EMOJI $SAFE_PROJECT",
    "text": "$SAFE_MSG",
    "ts": "$(date +%s)"
  }]
}
EOF
)
else
    echo "Unknown provider: $PROVIDER (use: discord, slack, none)" >&2
    exit 1
fi

# Send the webhook
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    "$WEBHOOK_URL" 2>/dev/null) || true

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "204" ]; then
    echo "Notification sent ($PROVIDER): $MSG_TYPE"
else
    echo "Notification may have failed (HTTP $HTTP_CODE). Check webhook URL." >&2
    # Don't fail the script - notifications are best-effort
    exit 0
fi
