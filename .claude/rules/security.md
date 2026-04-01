# Security & Privacy Guidelines -- MANDATORY

> These rules apply to all development. Adapt specific technologies to your stack.

## RULE 1: Never Introduce OWASP Top 10 Vulnerabilities

| Threat | Prevention |
|--------|------------|
| SQL Injection | Parameterized queries only. NEVER concatenate user input into SQL. ORMs parameterize by default but raw query escape hatches bypass protection — audit all raw SQL. For dynamic table/column names (cannot be parameterized), use strict allowlist validation. |
| XSS | Primary defense: output encoding (context-aware escaping for HTML, JS, CSS, URL). Use framework auto-escaping (React JSX, Angular). For rich text requiring HTML, sanitize with DOMPurify (keep patched). Prefer `textContent`/`innerText` over `innerHTML`. Deploy CSP as defense-in-depth. |
| Broken Access | Every table needs access control. Every endpoint needs auth. |
| LLM Injection | No single defense prevents prompt injection. Use layered defense: (1) constrain model role/task/output format in system prompt, (2) separate untrusted content with delimiters, (3) validate and filter outputs, (4) enforce least-privilege on LLM tool access, (5) human-in-the-loop for privileged ops, (6) defend against indirect injection from external data sources. Regular red-teaming required. See OWASP LLM01:2025. |
| Security Misconfig | Never bypass rate limiting, CORS, or auth middleware. |
| Vulnerable Deps | Integrate SCA into CI/CD — block PRs with HIGH+ CVEs. Scan every PR, not just after dependency changes. Track transitive dependencies. Enable automated monitoring for new CVEs (Dependabot, Snyk, Renovate). |

## RULE 2: Every New Table Gets Access Control
- Enable row-level security or equivalent access control
- Add user isolation policies
- Restrict function search paths
- Verify access control after table creation

## RULE 3: No PII in Logs
- Log only UUIDs and anonymous identifiers
- Redact PII in error messages
- Never log full request/response bodies that may contain PII
- Alerting: system status only, no user-identifying information

## RULE 4: LLM Data Transmission
- Separate untrusted content with delimiters and clear boundaries
- Rate limit AI endpoints with layered controls: per-user request limits AND per-user token budgets (daily/monthly caps). Enforce per-request input/output token limits and execution timeouts.
- Validate input length before LLM call, not after
- Never send to LLMs: credentials, tokens, API keys, private keys
- Never send without de-identification: PII, PHI, financial data, biometric data
- Require user consent for any user-generated content sent to third-party LLM providers
- Require DPAs (Data Processing Agreements) with all LLM providers before sending user data
- Content moderation: fail-closed (block on API failure, not allow)

## RULE 5: Privacy-by-Design Checklist
For every feature handling user data:
- [ ] Access control configured?
- [ ] PII storage documented?
- [ ] Third-party transmission documented?
- [ ] User can delete this data?
- [ ] User can export this data?
- [ ] PII redacted in logs?
- [ ] Consent required?

## RULE 6: Authentication and Authorization
- Every endpoint requires auth (except health checks)
- Admin endpoints require admin permissions
- Store session tokens in HttpOnly, Secure, SameSite=Strict cookies with `__Host-` prefix, `Path=/`, and `Max-Age`. Never use localStorage for sensitive tokens. For SPAs: refresh token in HttpOnly cookie, short-lived access token in memory. Implement token rotation and revocation.
- Never bypass auth middleware

## RULE 7: File Upload Security
- Whitelist extensions. Validate MIME types AND magic bytes (do not trust Content-Type header alone).
- Enforce max size. Rename files to random names on storage. Store uploads outside web root on a separate domain/host.
- Re-encode images to strip polyglot payloads. Sanitize filenames (strip null bytes, path separators, special characters).
- Scan uploads with antivirus. Use safe XML parsers (prevent XXE).

## RULE 8: CORS and API Security
- Never use wildcard CORS origins
- Whitelist browser extension IDs explicitly
- Rate-limit by default
- Never leak stack traces, SQL errors, or file paths in responses

## RULE 9: Data Lifecycle Awareness
- Deletion endpoints must cascade to new tables
- Export endpoints must include new data
- Document retention expectations
- Ask user about retention limits for indefinite storage

## RULE 10: Security Anti-Patterns
- Never hardcode secrets
- Never use `eval()`/`exec()`/`shell=True` with user input
- Never disable SSL verification
- Never suppress security warnings without explanation
- Never commit credentials
- Use Argon2id for password hashing (preferred: memory 19 MiB, iterations 2, parallelism 1). Alternatives in order: scrypt, bcrypt (work factor 10+, 72-byte limit — legacy only), PBKDF2-HMAC-SHA256 (600k+ iterations — FIPS only). Never MD5/SHA1/plain SHA256.
