#!/usr/bin/env bash
# =============================================================================
# Deny-by-default firewall for Claude Code DevContainer
# =============================================================================
# Restricts outbound network access to only the services Claude Code needs.
# Requires NET_ADMIN and NET_RAW capabilities (set in devcontainer.json).
#
# NET_ADMIN: required for iptables/ip6tables rule management
# NET_RAW:   required for REJECT --reject-with icmp-port-unreachable
#            (sends ICMP error packets). If removed, REJECT degrades to DROP
#            and connections timeout instead of failing immediately.
#
# Security note: The firewall is the primary protection for ANTHROPIC_API_KEY.
# Weakening it (e.g., adding broad IP ranges) expands the exfiltration surface.
#
# Allowlist:
#   - Anthropic API (api.anthropic.com)
#   - GitHub (for git operations and gh CLI)
#   - npm registry (for Claude Code CLI updates)
#   - VS Code extensions marketplace
#   - DNS (required for all of the above)
#
# To add project-specific hosts (e.g., your Supabase instance, Sentry),
# add to the EXTRA_ALLOWED_HOSTS array below.
# =============================================================================

set -euo pipefail

# --- Project-specific additions (fork and customize) ---
EXTRA_ALLOWED_HOSTS=(
  # "your-supabase-project.supabase.co"
  # "sentry.io"
)

# --- Core allowlist (do not remove) ---
# Wildcards are NOT supported -- enumerate each subdomain explicitly.
# CDN subdomains resolve to different IPs than their base domain.
ALLOWED_HOSTS=(
  "api.anthropic.com"
  "github.com"
  "api.github.com"
  "raw.githubusercontent.com"
  "objects.githubusercontent.com"
  "codeload.github.com"
  "registry.npmjs.org"
  "marketplace.visualstudio.com"
  "az764295.vo.msecnd.net"
  "update.code.visualstudio.com"
)

echo "=== Initializing deny-by-default firewall ==="

# Flush existing filter OUTPUT rules (IPv4 and IPv6)
# Note: We do not flush -t nat or -t mangle OUTPUT. Standard Docker
# devcontainer setups do not add NAT OUTPUT rules for container-initiated
# traffic. If your Docker config adds such rules, add flushes here.
sudo iptables  -F OUTPUT 2>/dev/null || true
sudo ip6tables -F OUTPUT 2>/dev/null || true

# --- IPv4 base rules ---
sudo iptables -A OUTPUT -o lo -j ACCEPT
sudo iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
sudo iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
sudo iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT

# --- IPv6 base rules ---
sudo ip6tables -A OUTPUT -o lo -j ACCEPT
sudo ip6tables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
sudo ip6tables -A OUTPUT -p udp --dport 53 -j ACCEPT
sudo ip6tables -A OUTPUT -p tcp --dport 53 -j ACCEPT

# Resolve and allow each host (both IPv4 and IPv6)
allow_host() {
  local host="$1"
  local allowed=0

  # IPv4
  local ipv4s
  ipv4s=$(getent ahostsv4 "$host" 2>/dev/null | awk '{print $1}' | sort -u) || true
  for ip in $ipv4s; do
    sudo iptables -A OUTPUT -d "$ip" -j ACCEPT
    allowed=1
  done

  # IPv6
  local ipv6s
  ipv6s=$(getent ahostsv6 "$host" 2>/dev/null | awk '{print $1}' | sort -u) || true
  for ip in $ipv6s; do
    sudo ip6tables -A OUTPUT -d "$ip" -j ACCEPT
    allowed=1
  done

  if [[ "$allowed" -eq 0 ]]; then
    echo "  WARN: Could not resolve $host -- skipping"
  else
    echo "  OK: $host"
  fi
}

echo "--- Allowing core hosts ---"
for host in "${ALLOWED_HOSTS[@]}"; do
  allow_host "$host"
done

if [[ ${#EXTRA_ALLOWED_HOSTS[@]} -gt 0 ]]; then
  echo "--- Allowing project-specific hosts ---"
  for host in "${EXTRA_ALLOWED_HOSTS[@]}"; do
    allow_host "$host"
  done
fi

# Default deny all other outbound traffic (IPv4 and IPv6)
sudo iptables  -A OUTPUT -j REJECT --reject-with icmp-port-unreachable
sudo ip6tables -A OUTPUT -j REJECT --reject-with icmp6-port-unreachable

rule_count=$(sudo iptables -L OUTPUT --line-numbers 2>/dev/null | tail -n +3 | wc -l)
echo "=== Firewall active: deny-by-default with ${rule_count} IPv4 rules ==="
echo ""
echo "To add hosts at runtime:"
echo "  sudo iptables -I OUTPUT -d \$(dig +short -4 example.com | head -1) -j ACCEPT"
