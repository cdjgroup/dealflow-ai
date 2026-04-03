# Release Notes — v0.3.0

## DealFlow AI: Conversation Management & Help-Kit

Fresh chat support, conversation history, onboarding checklist, and resource center.

### What's new

- **New Chat button**: Start a fresh conversation anytime via the collapsible sidebar. Previous conversations are listed with titles, message counts, and timestamps.
- **Conversation persistence**: Every chat auto-saves to Redis when the AI finishes responding. Conversations persist for 30 days and include full tool call history.
- **Conversation switching**: Click any previous conversation to reload it. Key-based remount ensures clean state transitions.
- **Onboarding checklist**: 5-step "Getting Started" guide in the dashboard sidebar — Connect Google, Connect Slack, Try a chat command, Check pipeline, Review permissions. Progress persists in localStorage. Dismissible and collapsible.
- **Resource center**: Help drawer (?) icon in the nav bar with external doc links (Auth0 Token Vault, RFC 8693, AI SDK), quick actions, and a glossary of 8 DealFlow-specific terms.
- **Auto-detection ready**: Onboarding provider accepts `autoCompletions` prop for automatically marking steps complete based on token status.

### Bug fixes

- Conversation save now includes tool call steps from all reasoning rounds (was only saving final text)
- Redis conversation keys now have 30-day TTL applied (was defined but never used — unbounded storage growth)

### Deployment
- Live at: https://dealflow-ai-seven.vercel.app
- Repo: https://github.com/cdjgroup/dealflow-ai
