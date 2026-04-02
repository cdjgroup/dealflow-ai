# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-04-02

### Added
- Auth0 authentication with Universal Login (Google social connection)
- AI chat agent powered by Claude Sonnet 4.6 via Vercel AI SDK v6
- Token Vault integration for Google Calendar and Gmail (direct RFC 8693 exchange)
- CRM data layer in Upstash Redis (deals, contacts, activities)
- 8 AI tools: checkCalendar, draftEmail, searchEmails, listDeals, getDealDetails, searchContacts, createDeal, logActivity
- Custom UpstashStore implementing @auth0/ai Store interface
- Connect Google Account button using Auth0 Connected Accounts flow
- Permissions dashboard showing connected accounts and scopes
- Hardcoded seed data for demo reliability
- Rate limiting on AI endpoint via @upstash/ratelimit
- Corrupted cookie recovery in middleware
- LLM prompt injection defense in system prompt
- Request body validation and CSRF protection
- Landing page with Auth0 login
- Unit tests (vitest) + E2E smoke tests (Playwright)
- Vercel production deployment

### Architecture Decisions
- Direct Auth0 /oauth/token calls instead of @auth0/ai-vercel SDK wrapper (incompatible with AI SDK v6)
- Upstash Redis via HTTP for all data (no PostgreSQL, Edge-compatible)
- Claude Sonnet 4.6 as the LLM (configurable via ANTHROPIC_MODEL env var)
