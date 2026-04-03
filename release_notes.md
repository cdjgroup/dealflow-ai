# Release Notes — v0.4.0

## DealFlow AI: Action Center

AI-suggested next steps with human-in-the-loop review, inline editing, and Token Vault execution.

### What's new

- **Action Center page** (`/dashboard/actions`): Dedicated page where the AI agent's suggested actions are queued for user review. Each card shows the action type (Email, Calendar, Slack), the justification (why the AI recommends it), and a draft preview.
- **Inline draft editing**: Expand any action card to edit the draft content before approving. Email cards show To/Subject/Body fields, Calendar cards show title/date/time/duration/attendees, Slack cards show channel/message.
- **Approve/Dismiss/Execute workflow**: Pending actions can be approved (queued for execution) or dismissed. Approved actions show an Execute button that triggers the real API call via Token Vault OAuth exchange.
- **Batch approve**: "Approve All Pending" button with count badge for fast review of multiple suggestions.
- **Calendar event creation**: New capability — creates Google Calendar events via Events.insert API using the `calendar.events` scope (upgraded from read-only).
- **Execution feedback**: Cards show real-time status transitions (pending → approved → executing → sent/failed) with appropriate colors and animations. Failed actions show error messages and a Retry button.
- **Nav badge**: Pending action count displayed as a badge on the Actions link in the navigation bar.
- **Seeded demo data**: 5 realistic suggested actions tied to existing CRM deals, created automatically during data seeding.
- **Type-specific validation**: Zod schemas validate email addresses, date formats, field lengths, and Slack channel names on all draft payloads.

### Security

- All action endpoints require Auth0 session + CSRF header
- Draft payloads validated with type-specific Zod schemas (prevents CRLF injection, enforces size limits)
- Execute endpoint returns 502 on downstream API failure (not silent 200)
- Action creation hardcoded to "pending" status (no approval bypass)
- Redis keys user-scoped for data isolation

### Deployment
- Live at: https://dealflow-ai-seven.vercel.app
- Repo: https://github.com/cdjgroup/dealflow-ai
