# Release Notes — v0.2.1

## DealFlow AI: UI Polish & Visual Storytelling

Animations, glassmorphism, metrics, and visual security storytelling for hackathon judges.

### What's new

- **Animated landing page**: Gradient "DealFlow AI" title (text-7xl), staggered card animations, Token Vault architecture diagram (User → Auth0 → Vault → AI → APIs), glow CTA button
- **Chat polish**: Staggered fade-in on messages/tool cards, AI avatar (gradient "D") and user avatar badges, glassmorphism on chat bubbles, animated suggestion chips
- **"Token Vault Active" scope card**: Signature animated indicator showing live OAuth scopes during tool execution — the security story made visual
- **Pipeline metrics + funnel**: Summary cards (Active Deals, Pipeline Value, Won) and horizontal bar funnel in dashboard sidebar
- **Expandable audit log**: Click rows to see full I/O JSON, risk-level badges (OAuth amber, Write yellow, Read green)
- **Animated ApprovalCard**: Slide-up entrance for step-up auth prompts
- **Glassmorphism throughout**: backdrop-blur-sm on cards, inputs, sidebar — modern 2025-2026 design trend
- **Removed redundant Connect Services card**: Connection handled by Token Vault interrupt + Permissions page

### Deployment
- Live at: https://dealflow-ai-seven.vercel.app
- Repo: https://github.com/cdjgroup/dealflow-ai
