# Sherlock Mode: Multi-Agent Review Pipeline

When operating in Sherlock or Holmes mode, the following review gates are MANDATORY.

## Per-Phase Reviews (after each TDD phase)

Run RELEVANT reviewers in parallel based on files changed:
- **fw-review-code** -- ALWAYS required
- **fw-review-tests** -- when tests are written or modified
- **fw-review-security** -- if auth, RLS, input validation, or secrets touched
- **fw-review-performance** -- if DB queries, React components, or API endpoints changed
- **fw-review-maintainability** -- if refactoring or touching 3+ files
- **fw-author-migration** -- if database migrations created (run `/schema-check` first)
- **fw-review-api-contracts** -- if API endpoints added or modified
- **fw-review-ux** -- if UI components, layouts, forms, or data visualizations changed
- **fw-review-forensics** -- when LOC changed > 200 (scan for AI tells, hallucinated deps, safety guard removal)
- **fw-review-error-handling** -- when try/catch, error handling, or fallback logic touched
- **fw-review-types** -- when new types, classes, or models introduced
- **fw-review-dependencies** -- when lockfiles or dependency manifests change (package.json, requirements.txt, Cargo.toml, go.mod, pyproject.toml)
- **fw-review-concurrency** -- when async/await, Promise, useEffect, threading, or database transaction code is touched

Fix all Critical and High issues before proceeding to next phase.

## Pre-Review Routing (Cost Optimization)

Before spawning review agents, classify the change to optimize cost and speed.

### Change Type Classification

Determine change type from `git diff --name-only`:

| Change Type | Detection | Review Strategy |
|---|---|---|
| docs-only | All files match `*.md`, `*.txt`, `*.rst` | fw-review-docs (Haiku) only |
| config-only | All files match `*.yaml`, `*.json`, `*.toml` (non-auth) | fw-review-code only |
| deps-only | Only lockfiles or dependency manifests | fw-review-code + fw-review-dependencies |
| style-only | Only `.css`, `.scss`, formatting changes | fw-review-code only |
| test-only | All files match `*test*`, `*spec*`, `*.test.*` | fw-review-code + fw-review-tests |

### Diff Size Routing

Determine LOC changed from `git diff --stat`:

| LOC Changed | Strategy |
|---|---|
| < 20 | fw-review-code only (single pass) |
| 20-200 | Standard per-phase pipeline |
| 200-500 | Standard pipeline + fw-review-maintainability + fw-review-forensics |
| > 500 | Full pipeline + fw-review-forensics; escalate fw-review-code to Opus tier |

### File-Type Skip Rules
- No database files changed -> skip fw-author-migration and /schema-check
- No API route files changed -> skip fw-review-api-contracts
- No UI component files changed -> skip fw-review-ux
- No test files changed -> skip fw-review-tests
- No error handling changes (no try/catch/except) -> skip fw-review-error-handling
- No new type/class/model definitions -> skip fw-review-types
- No dependency/lockfile changes -> skip fw-review-dependencies
- No async/concurrent code changes (no async/await, Promise, useEffect, threading) -> skip fw-review-concurrency

These rules apply to per-phase reviews only. The Final Review Gate always runs its full set.

## Final Review Gate (before commit)

Run ALL of these in parallel:
1. **fw-review-code** -- comprehensive final pass across all changes
2. **fw-review-docs** -- check if docs need updating
3. **fw-review-security** -- final security scan
4. **fw-review-forensics** -- AI tell detection, supply chain verification, safety guard audit (ALWAYS runs since all Sherlock/Holmes code is AI-assisted)
5. **fw-review-comments** -- comment accuracy, staleness, and value audit (ALWAYS runs pre-commit)
6. Plus any domain-specific reviewers relevant to the full changeset

If **fw-review-docs** identifies docs that need updating, invoke **fw-author-docs** to write/update those docs.

## Commit Criteria

- Zero unresolved Critical issues
- Zero unaddressed High issues (addressed = fixed OR explicitly deferred with documented reason)
- Documentation-reviewer output acted on (docs updated or noted as not needed)

## Conflict Resolution Protocol

When parallel review agents produce contradictory findings:

### Severity Hierarchy
Critical > High > Medium > Low. Higher severity always wins regardless of domain.

### Domain Authority
Each reviewer is authoritative within their domain:

| Priority | Domain | Authoritative Agent |
|---|---|---|
| 1 (highest) | Security | fw-review-security |
| 1.5 | Supply Chain Security | fw-review-dependencies |
| 2 | AI Code Quality & Supply Chain | fw-review-forensics |
| 3 | Correctness | fw-review-code |
| 3.5 | Error Handling | fw-review-error-handling |
| 4 | Data Integrity | fw-author-migration |
| 4.5 | Concurrency | fw-review-concurrency |
| 5 | Performance | fw-review-performance |
| 6 | API Contracts | fw-review-api-contracts |
| 7 | UX/Accessibility | fw-review-ux |
| 8 | Maintainability | fw-review-maintainability |
| 8.5 | Type Design | fw-review-types |
| 9 (lowest) | Style | fw-review-code (secondary) |
| 9.5 | Comments | fw-review-comments |

### Resolution Rules
1. **Different severity**: Higher severity wins automatically
2. **Same severity, different domains**: Both recommendations stand (no conflict)
3. **Same severity, overlapping domains**: Higher-priority domain wins (table above)
4. **Cross-domain trade-off**: Present compromise if possible, otherwise higher priority wins
5. **Subjective disagreements**: fw-review-code wins as tiebreaker

### Escalation
- **Max 2 resolution rounds** -- if agents cannot converge, escalate to human
- **Report format**: `CONFLICT: [Agent A] recommends X because [reason]. [Agent B] recommends Y because [reason]. Domain priority: [resolution]. Please decide.`

## Agent Selection Guide

| Files Changed | Agents to Run |
|---------------|---------------|
| Any code | fw-review-code (always) |
| Auth/middleware code | + fw-review-security |
| Database migrations | + fw-author-migration |
| API routes/endpoints | + fw-review-api-contracts, + fw-review-performance |
| Services/queries | + fw-review-performance |
| UI components/pages | + fw-review-performance, + fw-review-ux, + /qa skill |
| Tests written/modified | + fw-review-tests |
| 3+ files changed | + fw-review-maintainability |
| RLS policies, secrets, validation | + fw-review-security |
| Error handling code | + fw-review-error-handling |
| New types/models | + fw-review-types |
| 200+ LOC changed | + fw-review-forensics |
| Dependency/lockfile changes | + fw-review-dependencies |
| Async/concurrent code | + fw-review-concurrency |
| Before commit (always) | + fw-review-docs, + fw-review-forensics, + fw-review-comments |
