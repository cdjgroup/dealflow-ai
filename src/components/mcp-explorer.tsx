"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { McpClient } from "@/lib/types/policy";
import { McpClientCard } from "@/components/mcp-client-card";
import { MCP_SAFE_TOOLS } from "@/lib/constants/tools";

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
    "dealflow": {
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
    "name": "dealflow",
    "authorization_token": "<your-api-key>"
  }],
  "tools": [{
    "type": "mcp_toolset",
    "mcp_server_name": "dealflow"
  }]
}`,
  },
  curl: {
    label: "curl",
    config: `# Discover tools
curl -X POST https://dealflow-ai-seven.vercel.app/api/mcp \\
  -H "Authorization: Bearer <your-api-key>" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Call a tool
curl -X POST https://dealflow-ai-seven.vercel.app/api/mcp \\
  -H "Authorization: Bearer <your-api-key>" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","method":"tools/call",
       "params":{"name":"checkCalendar",
                 "arguments":{"date":"2026-04-04"}},"id":2}'`,
  },
};

const TRUST_TIERS = [
  { tier: "readonly", label: "Read Only", desc: "CRM data only", color: "border-muted-foreground/30 text-muted-foreground" },
  { tier: "restricted", label: "Restricted", desc: "CRM + Calendar + Email", color: "border-amber-500/30 text-amber-700" },
  { tier: "standard", label: "Standard", desc: "All read-only tools", color: "border-blue-500/30 text-blue-600" },
  { tier: "full", label: "Full", desc: "All MCP tools", color: "border-emerald-500/30 text-emerald-600" },
];

interface ConstraintRow {
  tool: string;
  param: string;
  pattern: string;
  description: string;
}

interface CreateForm {
  name: string;
  description: string;
  trustTier: string;
  rateLimit: string;
  selectedTools: string[];
  constraints: ConstraintRow[];
}

export function McpExplorer() {
  const [activeTab, setActiveTab] = useState<keyof typeof CLIENT_CONFIGS>("claude_desktop");
  const [copied, setCopied] = useState(false);
  const [endpointStatus, setEndpointStatus] = useState<"checking" | "live" | "down">("checking");
  const [clients, setClients] = useState<McpClient[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<CreateForm>({
    name: "",
    description: "",
    trustTier: "standard",
    rateLimit: "60",
    selectedTools: Array.from(MCP_SAFE_TOOLS),
    constraints: [],
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 0 }) })
      .then(res => setEndpointStatus(res.status === 401 ? "live" : res.ok ? "live" : "down"))
      .catch(() => setEndpointStatus("down"));
  }, []);

  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch("/api/mcp/clients");
      if (res.ok) setClients(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  async function copyConfig() {
    try {
      await navigator.clipboard.writeText(CLIENT_CONFIGS[activeTab].config);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch("/api/mcp/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({
          name: createForm.name,
          description: createForm.description || undefined,
          trustTier: createForm.trustTier,
          rateLimit: parseInt(createForm.rateLimit, 10) || 60,
          allowedTools: createForm.selectedTools,
          ...(createForm.constraints.length > 0 && {
            parameterConstraints: createForm.constraints.reduce((acc, c) => {
              if (!c.tool || !c.param || !c.pattern) return acc;
              if (!acc[c.tool]) acc[c.tool] = [];
              acc[c.tool].push({ param: c.param, pattern: c.pattern, ...(c.description && { description: c.description }) });
              return acc;
            }, {} as Record<string, { param: string; pattern: string; description?: string }[]>),
          }),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewApiKey(data.rawApiKey);
        setShowCreateForm(false);
        setCreateForm({ name: "", description: "", trustTier: "standard", rateLimit: "60", selectedTools: Array.from(MCP_SAFE_TOOLS), constraints: [] });
        await fetchClients();
      }
    } catch { /* ignore */ }
    setCreating(false);
  }

  async function handleDelete(clientId: string) {
    await fetch(`/api/mcp/clients/${clientId}`, {
      method: "DELETE",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    await fetchClients();
  }

  async function handleRotateKey(clientId: string) {
    const res = await fetch(`/api/mcp/clients/${clientId}/rotate-key`, {
      method: "POST",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    if (res.ok) {
      const data = await res.json();
      setNewApiKey(data.rawApiKey);
      await fetchClients();
    }
  }

  const allMcpTools = Array.from(MCP_SAFE_TOOLS);

  return (
    <div className="space-y-6">
      {/* Trust Tier Spectrum */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border rounded-lg p-6"
      >
        <h2 className="text-lg font-semibold text-foreground mb-3">Trust Spectrum</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Each MCP client operates within a trust tier that controls which tools it can access.
          Higher tiers grant access to more tool categories.
        </p>
        <div className="flex gap-2">
          {TRUST_TIERS.map((t, i) => (
            <div key={t.tier} className="flex-1 flex items-center gap-2">
              <div className={`flex-1 rounded-md border px-3 py-2 text-center ${t.color}`}>
                <div className="text-xs font-medium">{t.label}</div>
                <div className="text-[10px] mt-0.5 opacity-70">{t.desc}</div>
              </div>
              {i < TRUST_TIERS.length - 1 && (
                <span className="text-muted-foreground/30 text-xs shrink-0">&rarr;</span>
              )}
            </div>
          ))}
        </div>
      </motion.div>

      {/* MCP Clients */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="bg-card border border-border rounded-lg p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">
            Your MCP Clients ({clients.length})
          </h2>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="text-xs bg-primary text-primary-foreground rounded-md px-3 py-1.5 hover:bg-primary/90 transition-colors"
          >
            {showCreateForm ? "Cancel" : "Create Client"}
          </button>
        </div>

        {/* New API Key Alert */}
        <AnimatePresence>
          {newApiKey && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/15 p-4"
            >
              <p className="text-xs font-medium text-amber-700 mb-2">
                Save this API key — it will not be shown again:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono bg-muted/50 rounded px-3 py-2 text-foreground break-all">
                  {newApiKey}
                </code>
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(newApiKey);
                    setNewApiKey(null);
                  }}
                  className="text-xs bg-amber-500/20 border border-amber-500/30 rounded px-3 py-2 text-amber-700 hover:bg-amber-500/30 transition-colors shrink-0"
                >
                  Copy & Dismiss
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Create Form */}
        <AnimatePresence>
          {showCreateForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 overflow-hidden"
            >
              <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground block mb-1">Name</label>
                    <input
                      type="text"
                      value={createForm.name}
                      onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                      placeholder="e.g., Claude Desktop"
                      className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground block mb-1">Description</label>
                    <input
                      type="text"
                      value={createForm.description}
                      onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                      placeholder="Optional"
                      className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground block mb-1">Trust Tier</label>
                    <select
                      value={createForm.trustTier}
                      onChange={(e) => setCreateForm({ ...createForm, trustTier: e.target.value })}
                      className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="full">Full Access</option>
                      <option value="standard">Standard</option>
                      <option value="restricted">Restricted</option>
                      <option value="readonly">Read Only</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground block mb-1">Rate Limit (req/min)</label>
                    <input
                      type="number"
                      value={createForm.rateLimit}
                      onChange={(e) => setCreateForm({ ...createForm, rateLimit: e.target.value })}
                      min={1}
                      max={1000}
                      className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground block mb-1.5">Allowed Tools</label>
                  <div className="flex flex-wrap gap-1.5">
                    {allMcpTools.map((tool) => {
                      const selected = createForm.selectedTools.includes(tool);
                      return (
                        <button
                          key={tool}
                          type="button"
                          onClick={() => {
                            setCreateForm({
                              ...createForm,
                              selectedTools: selected
                                ? createForm.selectedTools.filter((t) => t !== tool)
                                : [...createForm.selectedTools, tool],
                            });
                          }}
                          className={`text-[10px] rounded px-2 py-1 border transition-colors ${
                            selected
                              ? "text-emerald-600 bg-emerald-500/15 border-emerald-500/20"
                              : "text-muted-foreground bg-muted/30 border-border hover:border-muted-foreground/30"
                          }`}
                        >
                          {tool}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <details className="group">
                  <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none">
                    Parameter Constraints ({createForm.constraints.length}) &darr;
                  </summary>
                  <div className="mt-2 space-y-2">
                    <p className="text-[10px] text-muted-foreground">
                      Restrict what parameters MCP clients can pass to tools (e.g., only search emails from specific domains).
                    </p>
                    {createForm.constraints.map((c, i) => (
                      <div key={i} className="grid grid-cols-[1fr_1fr_2fr_2fr_auto] gap-1.5 items-center">
                        <select
                          value={c.tool}
                          onChange={(e) => {
                            const updated = [...createForm.constraints];
                            updated[i] = { ...c, tool: e.target.value };
                            setCreateForm({ ...createForm, constraints: updated });
                          }}
                          className="h-7 rounded border border-border bg-background px-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          <option value="">Tool</option>
                          {allMcpTools.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <input
                          value={c.param}
                          onChange={(e) => {
                            const updated = [...createForm.constraints];
                            updated[i] = { ...c, param: e.target.value };
                            setCreateForm({ ...createForm, constraints: updated });
                          }}
                          placeholder="param"
                          className="h-7 rounded border border-border bg-background px-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <input
                          value={c.pattern}
                          onChange={(e) => {
                            const updated = [...createForm.constraints];
                            updated[i] = { ...c, pattern: e.target.value };
                            setCreateForm({ ...createForm, constraints: updated });
                          }}
                          placeholder="regex pattern"
                          className="h-7 rounded border border-border bg-background px-1 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <input
                          value={c.description}
                          onChange={(e) => {
                            const updated = [...createForm.constraints];
                            updated[i] = { ...c, description: e.target.value };
                            setCreateForm({ ...createForm, constraints: updated });
                          }}
                          placeholder="description (optional)"
                          className="h-7 rounded border border-border bg-background px-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setCreateForm({
                              ...createForm,
                              constraints: createForm.constraints.filter((_, j) => j !== i),
                            });
                          }}
                          className="h-7 w-7 rounded border border-border text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors text-[10px]"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setCreateForm({
                          ...createForm,
                          constraints: [...createForm.constraints, { tool: "", param: "", pattern: "", description: "" }],
                        });
                      }}
                      className="text-[10px] text-primary hover:text-primary/80 transition-colors"
                    >
                      + Add constraint
                    </button>
                  </div>
                </details>
                <button
                  onClick={handleCreate}
                  disabled={!createForm.name || creating}
                  className="text-xs bg-primary text-primary-foreground rounded-md px-4 py-2 hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create Client"}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Client Cards */}
        {clients.length === 0 && !showCreateForm && (
          <p className="text-xs text-muted-foreground text-center py-6">
            No MCP clients configured. Create one to generate an API key for external agents.
          </p>
        )}
        <div className="space-y-3">
          <AnimatePresence>
            {clients.map((client) => (
              <McpClientCard
                key={client.id}
                client={client}
                onDelete={handleDelete}
                onRotateKey={handleRotateKey}
              />
            ))}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Endpoint status */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-card border border-border rounded-lg p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Endpoint</h2>
          {endpointStatus === "checking" ? (
            <span className="text-[10px] text-muted-foreground">Checking...</span>
          ) : endpointStatus === "live" ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-emerald-600 bg-emerald-500/15 border border-emerald-500/20 rounded-full px-2.5 py-1">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              LIVE
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-red-600 bg-red-500/15 border border-red-500/20 rounded-full px-2.5 py-1">
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
            <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-amber-700">
              Auth Required
            </span>
            <span className="rounded-full border border-purple-500/30 bg-purple-500/15 px-2 py-0.5 text-purple-600">
              Per-Client Policy
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Supports both Auth0 bearer tokens (default access) and DealFlow API keys (per-client policy).
            API keys are generated when you create an MCP client above.
          </p>
        </div>
      </motion.div>

      {/* Available tools */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="bg-card border border-border rounded-lg p-6"
      >
        <h2 className="text-lg font-semibold text-foreground mb-2">
          Available Tools ({MCP_TOOLS.length})
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          Tools available via MCP. Per-client policies can restrict which tools each client can access.
          Write operations require the chat UI for approval.
        </p>
        <div className="space-y-2">
          {MCP_TOOLS.map((tool, i) => (
            <motion.div
              key={tool.name}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.03 }}
              className="flex items-center justify-between rounded-md bg-secondary/50 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono text-foreground">{tool.name}</code>
                <span className={`text-[10px] rounded px-1.5 py-0.5 ${
                  tool.provider === "Google" ? "text-blue-600 bg-blue-500/15" :
                  tool.provider === "Slack" ? "text-purple-600 bg-purple-500/15" :
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
        transition={{ delay: 0.25 }}
        className="bg-card border border-border rounded-lg p-6"
      >
        <h2 className="text-lg font-semibold text-foreground mb-4">How It Works</h2>
        <div className="space-y-3 text-sm text-muted-foreground">
          <div className="flex gap-3">
            <span className="text-primary font-bold shrink-0">1.</span>
            <p>
              Create an MCP client above and choose a trust tier. You&apos;ll get a unique API key
              (<code className="text-foreground/70">dfk_...</code>).
            </p>
          </div>
          <div className="flex gap-3">
            <span className="text-primary font-bold shrink-0">2.</span>
            <p>
              Configure your AI agent (Claude Desktop, Cursor, or API) with the key as the bearer token.
            </p>
          </div>
          <div className="flex gap-3">
            <span className="text-primary font-bold shrink-0">3.</span>
            <p>
              DealFlow validates the key, applies your per-client policy (tool allowlist + rate limit),
              and enforces the trust tier.
            </p>
          </div>
          <div className="flex gap-3">
            <span className="text-primary font-bold shrink-0">4.</span>
            <p>
              All tool calls are logged to the audit trail with the client name, enabling cross-surface
              telemetry (Chat vs MCP vs Actions).
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
