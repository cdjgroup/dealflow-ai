# Release Notes — v0.2.2

## DealFlow AI: Landing Page & Permissions Refinement

Enhanced user education, simplified information architecture, and fixed chat readability.

### What's new

- **"How It Works" on landing page**: Four-step walkthrough explaining Token Vault flow — from requesting tokens, to consent popups, to short-lived access, to approval requirements. Makes the security story clear for first-time visitors.
- **"Built for Security" landing section**: Four security highlights: Zero Stored Credentials, Granular Permissions, Step-Up Authorization, Full Audit Trail. Directly addresses hackathon judging criteria.
- **Simplified navigation**: Removed "Audit Log" from top nav (still accessible via Permissions > Recent Activity). Reduces cognitive load.
- **Decluttered Permissions page**: Removed redundant Profile section. Made Capability Matrix collapsible. Focused layout on core actions: toggle tools, check connections, disconnect accounts.
- **Chat bubble readability fix**: Fixed prose colors in light mode — user bubbles now use prose-invert for white text on indigo background. Fixed table header contrast.
- **Accessibility improvements**: aria-hidden on decorative icons/arrows, heading hierarchy (h1->h2->h3), focus-visible styles on interactive elements, Safari VoiceOver-safe details/summary.

### Deployment
- Live at: https://dealflow-ai-seven.vercel.app
- Repo: https://github.com/cdjgroup/dealflow-ai
