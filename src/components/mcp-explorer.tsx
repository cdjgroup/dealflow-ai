"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

const MCP_TOOLS = [
  { name: "checkCalendar", description: "Check Google Calendar for events or availability", scope: "read", provider: "Google" },
  { name: "searchEmails", description: "Search Gmail inbox for matching emails", scope: "read", provider: "Google" },
  { name: "listSlackChannels", description: "List Slack channels the user has access to", scope: "read", provider: "Slack" },
  { name: "listDeals", description: "List all deals in the CRM pipeline", scope: "read", provider: "CRM" },
  { name: "getDealDetails", description: "Get detailed information about a specific deal", scope: "read", provider: "CRM" },
  { name: "searchContacts", description: "Search contacts by name or company", scope: "read", provider: "CRM" },
];

const EXCLUDED_TOOLS = [
  { name: "draftEmail", reason: "Requires user approval (write action)" },
  { name: "sendSlackMessage", reason: "Requires user approval (write action)" },
  { name: "createDeal", reason: "Requires user approval (CRM write)" },
  { name: "updateDeal", reason: "Requires user approval (CRM write)" },
  { name: "createContact", reason: "Requires user approval (CRM write)" },
  { name: "logActivity", reason: "Requires user approval (CRM write)" },
  { name: "delegateResearch", reason: "Requires user approval (delegation)" },
];

const CLIENT_CONFIGS = {
  claude_desktop: {
    label: "Claude Desktop / Cursor",
    config: `{
  "mcpServers": {
    "dealflow-ai": {
      "url": "https://dealflow-ai-seven.vercel.app/api/mcp"
    }
  }
}`,
  },
  claude_api: {
    label: "Claude API",
    config: `{
  "mcp_servers": [{
    "type": "url",
    "url": "https://dealflow-ai-seven.vercel.app/api/mcp",
    "name": "dealflow-ai",
    "authorization_token": "<auth0-access-token>"
  }],
  "tools": [{
    "type": "mcp_toolset",
    "mcp_server_name": "dealflow-ai"
  }]
}`,
  },
  curl: {
    label: "curl",
    config: `# Discover tools
curl -X POST https://dealflow-ai-seven.vercel.app/api/mcp \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Call a tool
curl -X POST https://dealflow-ai-seven.vercel.app/api/mcp \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","method":"tools/call",
       "params":{"name":"checkCalendar",
                 "arguments":{"date":"2026-04-04"}},"id":2}'`,
  },
};

export function McpExplorer() {
  const [activeTab, setActiveTab] = useState<keyof typeof CLIENT_CONFIGS>("claude_desktop");
  const [copied, setCopied] = useState(false);
  const [endpointStatus, setEndpointStatus] = useState<"checking" | "live" | "down">("checking");

  useEffect(() => {
    fetch("/api/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 0 }) })
      .then(res => setEndpointStatus(res.status === 401 ? "live" : res.ok ? "live" : "down"))
      .catch(() => setEndpointStatus("down"));
  }, []);

  async function copyConfig() {
    try {
      await navigator.clipboard.writeText(CLIENT_CONFIGS[activeTab].config);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text for manual copy
    }
  }

  return (
    <div className="space-y-6">
      {/* Endpoint status */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border rounded-lg p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Endpoint</h2>
          {endpointStatus === "checking" ? (
            <span className="text-[10px] text-muted-foreground">Checking...</span>
          ) : endpointStatus === "live" ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-1">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              LIVE
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-2.5 py-1">
              DOWN
            </span>
          )}
        </div>
        <div className="rounded-lg bg-secondary/50 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <code className="text-sm font-mono text-foreground bg-muted/50 rounded px-2 py-1 flex-1">
              https://dealflow-ai-seven.vercel.app/api/mcp
            </code>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px]">
            <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">
              Streamable HTTP
            </span>
            <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">
              JSON-RPC 2.0
            </span>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-400">
              Auth Required
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Bearer token authentication via Auth0. Tokens validated against <code className="text-foreground/70">/userinfo</code> endpoint.
          </p>
        </div>
      </motion.div>

      {/* Available tools */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-card border border-border rounded-lg p-6"
      >
        <h2 className="text-lg font-semibold text-foreground mb-2">
          Available Tools ({MCP_TOOLS.length})
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          Only read-only tools are exposed via MCP. Write operations and tools requiring
          approval are excluded because MCP has no interactive approval UI.
        </p>
        <div className="space-y-2">
          {MCP_TOOLS.map((tool, i) => (
            <motion.div
              key={tool.name}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.03 }}
              className="flex items-center justify-between rounded-md bg-secondary/50 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono text-foreground">{tool.name}</code>
                <span className={`text-[10px] rounded px-1.5 py-0.5 ${
                  tool.provider === "Google" ? "text-blue-400 bg-blue-500/10" :
                  tool.provider === "Slack" ? "text-purple-400 bg-purple-500/10" :
                  "text-muted-foreground bg-muted"
                }`}>
                  {tool.provider}
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground hidden sm:inline">{tool.description}</span>
            </motion.div>
          ))}
        </div>

        {/* Excluded tools */}
        <details className="mt-4">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none">
            {EXCLUDED_TOOLS.length} tools excluded (requires approval) &darr;
          </summary>
          <div className="mt-2 space-y-1">
            {EXCLUDED_TOOLS.map((tool) => (
              <div key={tool.name} className="flex items-center justify-between text-xs px-3 py-1.5 text-muted-foreground/60">
                <code className="font-mono line-through">{tool.name}</code>
                <span className="text-[10px]">{tool.reason}</span>
              </div>
            ))}
          </div>
        </details>
      </motion.div>

      {/* Connection configs */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-card border border-border rounded-lg p-6"
      >
        <h2 className="text-lg font-semibold text-foreground mb-4">Connect Your Agent</h2>

        <div className="flex gap-1 mb-4 bg-muted/30 rounded-lg p-1">
          {(Object.entries(CLIENT_CONFIGS) as [keyof typeof CLIENT_CONFIGS, typeof CLIENT_CONFIGS[keyof typeof CLIENT_CONFIGS]][]).map(([key, { label }]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-1 text-xs py-2 px-3 rounded-md transition-all ${
                activeTab === key
                  ? "bg-card text-foreground shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative">
          <pre className="rounded-lg bg-secondary/50 border border-border p-4 text-xs font-mono text-foreground/80 overflow-x-auto whitespace-pre">
            {CLIENT_CONFIGS[activeTab].config}
          </pre>
          <button
            onClick={copyConfig}
            className="absolute top-2 right-2 text-[10px] bg-card border border-border rounded px-2 py-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </motion.div>

      {/* How it works */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-card border border-border rounded-lg p-6"
      >
        <h2 className="text-lg font-semibold text-foreground mb-4">How It Works</h2>
        <div className="space-y-3 text-sm text-muted-foreground">
          <div className="flex gap-3">
            <span className="text-primary font-bold shrink-0">1.</span>
            <p>
              External agent connects to <code className="text-foreground/70">/api/mcp</code> with
              a bearer token (Auth0 access token).
            </p>
          </div>
          <div className="flex gap-3">
            <span className="text-primary font-bold shrink-0">2.</span>
            <p>
              DealFlow AI validates the token against Auth0 <code className="text-foreground/70">/userinfo</code> and
              identifies the user.
            </p>
          </div>
          <div className="flex gap-3">
            <span className="text-primary font-bold shrink-0">3.</span>
            <p>
              Agent discovers available tools via <code className="text-foreground/70">tools/list</code>.
              Only read-only tools are exposed — write operations require the chat UI for approval.
            </p>
          </div>
          <div className="flex gap-3">
            <span className="text-primary font-bold shrink-0">4.</span>
            <p>
              Agent calls tools via <code className="text-foreground/70">tools/call</code>.
              Each call goes through the same Token Vault pipeline — Auth0 exchanges a short-lived
              token, the API call executes, and the action is logged to the audit trail.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
