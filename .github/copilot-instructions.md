# Copilot Instructions — DealFlow AI

## Project
AI sales agent using Auth0 Token Vault for secure Google Calendar/Gmail access. Next.js 16 + Claude Sonnet 4.6 + Upstash Redis.

## Key Patterns
- Auth0 Token Vault uses direct RFC 8693 token exchange (NOT the @auth0/ai-vercel SDK wrapper — incompatible with AI SDK v6)
- Tools are defined with `inputSchema` (zod v4) not `parameters` (AI SDK v6 change)
- CRM data stored in Upstash Redis via HTTP REST API
- All Google API tokens are ephemeral and server-side only

## Do Not
- Use `@auth0/ai-vercel` `withTokenVault` wrapper — it silently fails with AI SDK v6
- Use `parameters` instead of `inputSchema` in tool definitions
- Store Google tokens in Redis or logs
- Use `maxSteps` (renamed to `stopWhen: stepCountIs(n)` in AI SDK v6)
- Use `maxTokens` (renamed to `maxOutputTokens` in AI SDK v6)
