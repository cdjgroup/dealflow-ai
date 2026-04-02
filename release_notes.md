# Release Notes — v0.1.0

## DealFlow AI: AI Sales Agent with Auth0 Token Vault

First release of DealFlow AI — a hackathon entry for "Authorized to Act: Auth0 for AI Agents."

### What it does
An AI-powered sales assistant that manages your deal pipeline, checks your Google Calendar, and drafts Gmail follow-ups — all with secure, delegated access through Auth0 Token Vault.

### Key features
- **Auth0 Token Vault** for secure Google Calendar + Gmail access (RFC 8693 federated token exchange)
- **Claude Sonnet 4.6** as the AI agent with multi-step tool calling
- **8 AI tools** spanning CRM operations and Google API integrations
- **Connected Accounts flow** with explicit user consent via Auth0
- **Security**: rate limiting, CSRF protection, input validation, prompt injection defense

### Deployment
- Live at: https://dealflow-ai-seven.vercel.app
- Repo: https://github.com/cdjgroup/dealflow-ai
