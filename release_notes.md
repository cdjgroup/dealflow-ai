# Release Notes — v0.6.3

## DealFlow: MCP Playground + Claude Code Integration

Interactive MCP tool testing page and Claude Code project configuration for external agent demos.

### What's new

- **MCP Playground** (`/dashboard/mcp-playground`): Simulate external AI agent MCP calls from within the app. Paste a `dfk_` API key, discover tools via JSON-RPC, fill dynamic forms from `inputSchema`, and execute with CIBA consent visualization for write tools.
- **Dynamic form generation**: Tool parameter forms generated automatically from MCP tool JSON Schema — string, number, boolean, and enum inputs with required field indicators.
- **CIBA waiting state**: Write tool execution shows pulsing "Waiting for Guardian approval..." with cancel button. Read tools return instantly with "No approval required" badge.
- **Claude Code integration**: `.mcp.json` project config with `${DEALFLOW_API_KEY}` env var expansion — `claude mcp` auto-discovers the DealFlow MCP server.
- **`mcpCall()` helper**: JSON-RPC utility with AbortController support, 55s timeout, and proper error handling for both HTTP and JSON-RPC error paths.

### Architecture

- Raw `fetch` to existing `/api/mcp` endpoint — no new API routes, no MCP SDK client needed
- `mcp-handler` runs stateless (no `initialize` handshake required) — each JSON-RPC call is independent
- CIBA wait handled server-side by `cibaGate()` blocking up to 50s — client just holds the fetch open
- AbortController cleanup on unmount prevents orphaned requests

### Deployment

- Live at: https://dealflow-ai-seven.vercel.app
- Repo: https://github.com/cdjgroup/dealflow-ai
