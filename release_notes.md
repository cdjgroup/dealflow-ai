# Release Notes — v0.3.1

## DealFlow AI: Permissions & Audit Log Polish

Professional, accessible UI overhaul for the permissions page and audit log.

### What's new

- **Audit log filters**: Filter entries by tool name, result (success/error), and date range presets (Last 24h / 3 days / 7 days). Filters apply server-side with a smooth client-side UX. "Clear filters" button and empty-state message when no entries match.
- **Structured audit detail panel**: Expanded audit entries now show a formatted key-value grid (tool, timestamp, status, duration, thread, parameters) instead of raw JSON. Empty parameters show "No parameters" instead of `{}`. Error details rendered in a highlighted box.
- **Grouped capability toggles**: Toggles organized into collapsible CRM / Google / Slack sections. Each group header shows "X of Y enabled" summary. Groups default to collapsed for a clean overview.
- **Impact descriptions**: Every toggle now includes a descriptive line explaining what the AI agent can do when that capability is enabled (e.g., "AI agent can access your Google Calendar to check availability and view upcoming meetings via Token Vault").
- **Connection health badges**: Google and Slack toggle group headers show live Connected/Disconnected badges pulled from the Token Vault status API. Badges refresh on connection changes.

### Accessibility improvements

- Audit table: proper `<td>` cells (was `colSpan` wrapping), `<time datetime>`, `aria-expanded`/`aria-controls`, keyboard navigation (Tab + Enter/Space)
- Capability matrix: `scope="col"` on headers, sr-only `<caption>`
- Decorative emojis: `aria-hidden="true"` throughout
- Error rows: red left-border severity indicator with text labels (not color-only)
- Loading spinner: `role="status"` with `aria-label`

### Bug fixes

- Audit filtering fetches larger Redis window when filters active (prevents incomplete results)
- Date preset dropdown stores state explicitly (prevents visual flicker over time)
- Fetch errors show visible error banner instead of silent failure

### Deployment
- Live at: https://dealflow-ai-seven.vercel.app
- Repo: https://github.com/cdjgroup/dealflow-ai
