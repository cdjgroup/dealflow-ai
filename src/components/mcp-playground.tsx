"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { mcpCall } from "@/lib/mcp/client";
import { McpToolForm } from "@/components/mcp-tool-form";
import { McpExecutionCard, type ExecutionPhase } from "@/components/mcp-execution-card";
import { WRITE_TOOLS, toolIcons, TOOL_DISPLAY_NAMES } from "@/lib/constants/tools";
import type { McpClient } from "@/lib/types/policy";

interface ToolDef {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, { type?: string; description?: string; enum?: string[]; default?: unknown }>;
    required?: string[];
  };
}

export function McpPlayground() {
  // API key state
  const [clients, setClients] = useState<McpClient[]>([]);
  const [manualKey, setManualKey] = useState("");
  const apiKey = manualKey;

  // Tool state
  const [tools, setTools] = useState<ToolDef[]>([]);
  const [selectedTool, setSelectedTool] = useState<ToolDef | null>(null);
  const [params, setParams] = useState<Record<string, unknown>>({});

  // Execution state
  const [phase, setPhase] = useState<ExecutionPhase>("idle");
  const [durationMs, setDurationMs] = useState<number | undefined>();
  const [response, setResponse] = useState<unknown>();
  const [error, setError] = useState<string | undefined>();
  const [discovering, setDiscovering] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Fetch MCP clients for dropdown
  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch("/api/mcp/clients");
      if (res.ok) setClients(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  // Clean up in-flight requests on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  // Discover tools
  async function discoverTools() {
    if (!apiKey) return;
    setDiscovering(true);
    setTools([]);
    setSelectedTool(null);
    setPhase("idle");
    setResponse(undefined);
    setError(undefined);
    setDurationMs(undefined);
    try {
      const res = await mcpCall("tools/list", {}, apiKey, 10000);
      if (res.error) {
        setError(res.error.message);
        return;
      }
      const toolList = (res.result as { tools: ToolDef[] })?.tools ?? [];
      setTools(toolList);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to discover tools");
    } finally {
      setDiscovering(false);
    }
  }

  // Select a tool
  function handleToolSelect(toolName: string) {
    const tool = tools.find((t) => t.name === toolName);
    setSelectedTool(tool ?? null);
    setParams({});
    setPhase("idle");
    setResponse(undefined);
    setError(undefined);
  }

  function cancelExecution() {
    abortRef.current?.abort();
    abortRef.current = null;
  }

  // Execute selected tool
  async function executeTool() {
    if (!selectedTool || !apiKey) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("executing");
    setDurationMs(undefined);
    setResponse(undefined);
    setError(undefined);

    const start = Date.now();
    try {
      const res = await mcpCall(
        "tools/call",
        { name: selectedTool.name, arguments: params },
        apiKey,
        undefined,
        controller.signal
      );
      const elapsed = Date.now() - start;
      setDurationMs(elapsed);

      if (res.error) {
        setError(res.error.message);
        setPhase("error");
        return;
      }

      const content = res.result as { content?: Array<{ text?: string }>; isError?: boolean };
      if (content?.isError) {
        const parsed = content.content?.[0]?.text;
        let msg = "Tool execution failed";
        if (parsed) {
          try { msg = JSON.parse(parsed).error || msg; } catch { msg = parsed; }
        }
        setError(msg);
        setPhase("error");
        return;
      }

      // Parse successful result
      let resultData: unknown = content;
      if (content?.content?.[0]?.text) {
        try { resultData = JSON.parse(content.content[0].text); } catch { resultData = content.content[0].text; }
      }
      setResponse(resultData);
      setPhase("success");
    } catch (err) {
      setDurationMs(Date.now() - start);
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        setError("Request timed out — CIBA approval may have expired");
      } else {
        setError(err instanceof Error ? err.message : "Execution failed");
      }
      setPhase("error");
    }
  }

  function resetExecution() {
    setPhase("idle");
    setResponse(undefined);
    setError(undefined);
    setDurationMs(undefined);
  }

  const hasKey = apiKey.length > 0;
  const cibaRequired = selectedTool ? WRITE_TOOLS.has(selectedTool.name) : false;

  return (
    <div className="space-y-6">
      {/* API Key Selection */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border rounded-lg p-6"
      >
        <h2 className="text-lg font-semibold text-foreground mb-1">Connection</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Select an MCP client or paste an API key to authenticate as an external agent.
        </p>

        {clients.length > 0 && (
          <div className="mb-3">
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Your MCP Clients
            </label>
            <div className="flex flex-wrap gap-2">
              {clients.map((c) => (
                <span key={c.id} className="text-xs rounded-full border border-border px-2.5 py-1 text-muted-foreground">
                  {c.name} ({c.trustTier}) — {c.apiKeyPrefix}...
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Paste the full API key from one of these clients below.
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            API Key {clients.length > 0 && "(paste the full key)"}
          </label>
          <div className="flex gap-2">
            <input
              type="password"
              value={manualKey}
              onChange={(e) => setManualKey(e.target.value)}
              placeholder="dfk_..."
              className="flex-1 h-8 rounded-md border border-border bg-background px-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={discoverTools}
              disabled={!hasKey || discovering}
              className="text-xs bg-primary text-primary-foreground rounded-md px-4 py-1.5 hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {discovering ? "Discovering..." : "Discover Tools"}
            </button>
          </div>
        </div>

        {error && tools.length === 0 && (
          <p className="text-sm text-red-400 mt-3">
            {error}
          </p>
        )}

        {!hasKey && clients.length === 0 && (
          <p className="text-sm text-amber-700 mt-3">
            No MCP clients found.{" "}
            <a href="/dashboard/mcp" className="underline hover:text-amber-500">
              Create one in MCP Explorer
            </a>{" "}
            first, then paste the API key here.
          </p>
        )}
      </motion.div>

      {/* Tool Selection + Form */}
      {tools.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-card border border-border rounded-lg p-6"
        >
          <h2 className="text-lg font-semibold text-foreground mb-1">
            Available Tools ({tools.length})
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Select a tool to configure and execute. Write tools (email, calendar, Slack) require Guardian push approval via CIBA.
          </p>

          {/* Tool picker */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-muted-foreground mb-1">Tool</label>
            <select
              value={selectedTool?.name ?? ""}
              onChange={(e) => handleToolSelect(e.target.value)}
              className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select a tool...</option>
              {tools.map((t) => (
                <option key={t.name} value={t.name}>
                  {TOOL_DISPLAY_NAMES[t.name] ?? t.name}
                  {WRITE_TOOLS.has(t.name) ? " (write — CIBA)" : " (read)"}
                </option>
              ))}
            </select>
          </div>

          {/* Selected tool info + form */}
          {selectedTool && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-sm">{toolIcons[selectedTool.name]}</span>
                <span className="text-sm font-medium text-foreground">
                  {TOOL_DISPLAY_NAMES[selectedTool.name] ?? selectedTool.name}
                </span>
                {cibaRequired ? (
                  <span className="text-xs rounded-full border px-2.5 py-1 border-amber-500/30 bg-amber-500/15 text-amber-700">
                    CIBA Required
                  </span>
                ) : (
                  <span className="text-xs rounded-full border px-2.5 py-1 border-emerald-500/30 bg-emerald-500/15 text-emerald-600">
                    Read Only
                  </span>
                )}
              </div>

              {selectedTool.description && (
                <p className="text-sm text-muted-foreground">{selectedTool.description}</p>
              )}

              <McpToolForm
                schema={selectedTool.inputSchema}
                values={params}
                onChange={setParams}
                disabled={phase === "executing"}
              />

              <button
                onClick={executeTool}
                disabled={phase === "executing"}
                className="text-xs bg-primary text-primary-foreground rounded-md px-4 py-2 hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {phase === "executing"
                  ? cibaRequired
                    ? "Waiting for approval..."
                    : "Executing..."
                  : "Execute"}
              </button>
            </div>
          )}
        </motion.div>
      )}

      {/* Execution Result */}
      <McpExecutionCard
        phase={phase}
        toolName={selectedTool?.name ?? ""}
        cibaRequired={cibaRequired}
        durationMs={durationMs}
        response={response}
        error={error}
        onReset={resetExecution}
        onCancel={phase === "executing" ? cancelExecution : undefined}
      />
    </div>
  );
}
