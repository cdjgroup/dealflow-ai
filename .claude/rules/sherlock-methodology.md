# Sherlock/Holmes/Hudson Methodology — MANDATORY

> Tiered workflow for AI-assisted development. Classifies task complexity and routes to the appropriate process: Hudson (quick fix), Sherlock Lite (medium), Full Sherlock (complex), or Holmes (execution of an approved plan). Includes spec-anchored development with structured Acceptance Criteria and Interface Contracts.

## Complexity Routing — Step 0

When the user describes a task (or types "sherlock", "hudson", or "holmes"), FIRST classify its complexity before choosing a workflow. Do this silently unless the user typed a specific keyword.

### Classification Method

1. **Identify affected files**: Use Glob/Grep to trace what will change. List them.
2. **Count and categorize**: How many files? Any risk multipliers?
3. **Apply risk multipliers** (each bumps the tier UP by one):
   - Database migrations or schema changes
   - Authentication/authorization logic
   - Payment/billing code (Stripe)
   - RLS policies
   - API contract changes (breaking)
   - Shared utility used by 5+ consumers
4. **Route to tier**:

| Tier | Files | Steps | Keyword | When |
|------|-------|-------|---------|------|
| **Hudson** | 1-2, no risk multipliers | 4 | `hudson` | Quick fixes, typos, simple additions |
| **Sherlock Lite** | 3-5, 0-1 risk multipliers | 6 | `sherlock` (auto) | Medium features, refactors |
| **Full Sherlock** | 6+ OR 2+ risk multipliers | 8 | `sherlock` (auto) | Large features, cross-cutting changes |

5. **Present ALL THREE options** to user with a recommendation:
   ```
   COMPLEXITY ASSESSMENT:
   Files affected: [list with reasons]
   Risk multipliers: [list or "none"]

   Choose your workflow:
   → 🏠 Hudson (4 steps) — Quick fix, minimal review [RECOMMENDED if 1-2 files / or not]
   → 🔍 Sherlock Lite (6 steps) — Plan + TDD + targeted review [RECOMMENDED if 3-5 files / or not]
   → 🔍 Full Sherlock (8 steps) — Research + architecture + full review pipeline [RECOMMENDED if 6+ files / or not]

   My recommendation: [tier] because [1-2 sentences]
   ```
   Mark exactly ONE option as RECOMMENDED based on classification. Always show all three.

6. **Escape hatches** (mid-execution promotion):
   - Mid-Hudson discovers more files → STOP: "Promoting to Sherlock Lite — [evidence]"
   - Mid-Lite discovers 6+ files or 2+ multipliers → STOP: "Promoting to Full Sherlock — [evidence]"

---

## 🏠 HUDSON MODE (Quick Fix — 4 Steps)

When the user types "hudson" OR Step 0 classifies as Hudson:

1. **Explore & Confirm** — Read the 1-2 files. Confirm the change is contained. If it touches more, promote.
2. **Implement with Tests** — If the file is a testable implementation file:
   - Write/update test first (RED), then implement (GREEN). Inline — no subagents needed for simple changes.
   - If no test needed (config, docs, CSS, types), just implement.
3. **Quick Review** — Run **fw-review-code** agent only. Fix any Critical/High.
4. **Commit** — Ask: "Create a branch, or commit to current?" Follow standard git conventions. Run `/release-notes` if creating a PR.

**Hudson does NOT include:** plan mode, multi-agent review pipeline, architecture design, plan artifacts, research phase.

---

## 🔍 SHERLOCK LITE MODE (Medium — 6 Steps)

When Step 0 classifies as Sherlock Lite (3-5 files, 0-1 risk multipliers):

1. **Plan (Structured Spec Output)** — Use **Plan** agent. Explore affected files. Create implementation plan with file:line references, approach summary, test strategy. No multi-option architecture (use the obvious approach). If a risk multiplier is present, invoke the relevant domain agent (e.g., **fw-advisor-architecture** for architecture, **fw-author-migration** for DB). If the task involves architectural decisions, present them to the user for approval before proceeding.
   - **Write Acceptance Criteria**: Given/When/Then scenarios for expected behaviors (minimum: 1 happy path, 1 edge case, 1 error case). These drive the RED phase directly.
   - **Write Interface Contracts**: Type signatures and API shapes for any new interfaces being introduced. Omit for doc/config-only changes.
   - **Write `.sherlock-plan.md`** as the output of this step (before proceeding to Clarify): Use the Spec-Anchored format (see below). For Lite, the Architecture Decision section is brief (single approach, short rationale).
2. **Clarify** — Ask about genuine ambiguities. WAIT. If none: "No ambiguities — proceeding."
3. **TDD Implementation** — Use TDD subagents for each logical unit:
   - Invoke **fw-tdd-red** for RED phase (cognitively isolated — sees only requirements)
   - Invoke **fw-tdd-green** for GREEN phase (sees only failing tests)
   - Invoke **fw-tdd-refactor** for REFACTOR phase (sees both, keeps tests green)
   - For single-function changes, subagents optional — inline TDD is fine.
   - Run `/simplify` on changed code after REFACTOR.
4. **Per-Phase Review** — Run **fw-review-code** (always) + ONE relevant domain reviewer:
   - Tests → **fw-review-tests**
   - DB → **fw-author-migration** (after `/schema-check`)
   - API → **fw-review-api-contracts**
   - UI → **fw-review-ux**
   - 3+ files → **fw-review-maintainability**
   - Fix Critical/High before proceeding.
5. **Final Gate** — Run in parallel:
   - **fw-review-code** (final pass)
   - **fw-review-comments** (comment quality)
   - Domain reviewer from step 4 if different from fw-review-code
   - Run **fw-review-docs** + **fw-review-security** only if change affects public APIs or auth.
   - **AC coverage check**: Verify all Acceptance Criteria (AC-#) from `.sherlock-plan.md` are covered by tests.
   - Only commit after no Critical issues.
6. **Post-Commit (Doc Update + PR)** — Before creating PR, update documentation:
   - Update `CLAUDE.md` version description if this is a version-worthy change
   - Update `release_notes.md` with change summary
   - Update `CHANGELOG.md` with Keep a Changelog entry
   - Update `docs/60-FEATURES.md` if new features added
   - Add insight to `docs/70-INSIGHTS.md` if a non-obvious design decision was made
   - Run `/release-notes` skill to generate PR body
   - `protocol-validator.py` will BLOCK PR creation if `release_notes.md` or `CHANGELOG.md` are stale

**Promotion trigger**: If you discover 6+ files or 2+ risk multipliers mid-Lite, STOP: "Promoting to Full Sherlock — [evidence]."

---

## 🔍 FULL SHERLOCK MODE (High Complexity — 8 Steps)

When the user types "sherlock" AND Step 0 classifies as Full (6+ files OR 2+ risk multipliers):

1. **Plan First (Structured Spec Output)** — Use the **Plan** agent to enter plan mode. Use the **Explore** agent to investigate thoroughly. Create a detailed plan. Do NOT make assumptions — verify every claim by reading source files, configs, and schemas.
   - **Structured exploration output required**: entry points with `file:line`, execution flow, key components, dependencies, and 5-10 essential files.
   - **Draft Acceptance Criteria**: Write Given/When/Then scenarios for the feature's expected behaviors. These become the spec that drives the RED phase.
   - **Draft Interface Contracts**: Define type signatures and API shapes for new interfaces being introduced.
   - If the task involves architectural decisions, present them to the user for approval before proceeding. Also invoke the **fw-advisor-architecture** agent.
2. **Clarifying Questions Gate** — Before proceeding, identify and ASK the user about: edge cases, integration points, design preferences, error handling strategy, and any ambiguities. WAIT for answers. Do not assume — ask.
3. **Research & Validate** — Perform web searches of reputable sources (official docs, RFCs, trusted blogs) to validate the approach, confirm best practices, and identify known pitfalls. Cite sources.
4. **Architecture Design** — Generate 2-3 competing approaches:
   - **Minimal**: smallest change, least risk
   - **Clean**: best design, may require more refactoring
   - **Pragmatic**: balanced trade-off (if distinct from the above)
   - Present trade-offs (complexity, risk, maintainability, performance) and form a recommendation.
   - If architectural decisions are involved, also invoke **fw-advisor-architecture** agent. Present architectural decisions to the user for approval before proceeding.
   - WAIT for user to choose an approach. Then update the plan.
   - **PLAN ARTIFACT**: After architecture is approved, write `.sherlock-plan.md` to the project root (see Spec-Anchored format below). Ensure Acceptance Criteria and Interface Contracts sections are populated — these are the structured specs that drive TDD.
   - **CONTEXT RELIEF**: Run `/compact` to free context before implementation begins.
5. **TDD Phases** — Implement using Test-Driven Development with cognitively isolated subagents:
   - **Phase 1 (RED)**: Invoke **fw-tdd-red** agent. It writes failing tests based ONLY on requirements and interfaces. For complex scenarios, also consult **fw-review-tests** for test design.
   - **Phase 2 (GREEN)**: Invoke **fw-tdd-green** agent. It sees ONLY failing tests and type signatures. Writes minimal implementation.
   - **Phase 3 (REFACTOR)**: Invoke **fw-tdd-refactor** agent. It sees code + tests, cleans up while keeping tests green. Run `/simplify` on changed code.
   - Break into logical phases (e.g., Phase 1: core logic, Phase 2: edge cases, Phase 3: integration) as appropriate.
   - **DESIGN-SYNC**: After each TDD sub-phase, compare `git diff --name-only` against `.sherlock-plan.md` planned files. Flag unplanned files or missing planned files. Also verify acceptance criteria coverage — each AC-# should map to at least one test. Log legitimate divergences in the Pivot Log. Run `python3 scripts/fw_conformance.py --plan .sherlock-plan.md --save` to generate and persist a conformance scorecard to `.context/metrics/conformance/`.
   - **CONTEXT RELIEF**: Run `/compact` after all TDD phases complete, before reviews.
6. **Multi-Agent Review Pipeline (Per Phase)** — After each TDD phase, run RELEVANT reviewers in parallel based on what changed:
   - **fw-review-code** — ALWAYS run
   - **fw-review-tests** — when tests are written or modified
   - **fw-review-security** — when auth/RLS/secrets touched
   - **fw-review-performance** — when DB queries/React components/API endpoints changed
   - **fw-review-maintainability** — when refactoring or touching 3+ files
   - **fw-author-migration** — when database migrations created. ALWAYS run `/schema-check` skill BEFORE invoking fw-author-migration.
   - **fw-review-api-contracts** — when API endpoints added/modified
   - **fw-review-ux** — when UI components, layouts, forms, or data visualizations created/modified
   - **fw-review-error-handling** — when try/catch, error handling, or fallback logic touched
   - **fw-review-types** — when new types, classes, or models introduced
   - Fix all Critical/High issues before proceeding to next phase.
7. **Final Review Gate** — Before committing, run ALL of these in parallel:
   - **fw-review-code** (comprehensive final pass)
   - **fw-review-docs** (identify which docs need updating)
   - **fw-review-security** (final security scan)
   - **fw-review-comments** (comment accuracy, staleness, and value)
   - Plus any domain-specific reviewers relevant to the full changeset
   - If **fw-review-docs** identifies docs that need updating, invoke **fw-author-docs** to write/update those docs.
   - **DESIGN-SYNC (Final)**: Full comparison of `git diff --name-only` against `.sherlock-plan.md`. All planned files must be accounted for. All unplanned files must have Pivot Log entries. All Acceptance Criteria (AC-#) must be covered by tests. Report discrepancies to user.
   - Only commit after no Critical issues and no unaddressed High issues.
8. **Post-Commit (Doc Update + Spec Extraction)** — After committing, before creating PR:
   - **Update documentation** (protocol-validator.py will BLOCK PR creation if stale):
     - Update `CLAUDE.md` version description if this is a version-worthy change
     - Update `release_notes.md` with change summary
     - Update `CHANGELOG.md` with Keep a Changelog entry
     - Update `docs/60-FEATURES.md` if new features added
     - Add insight to `docs/70-INSIGHTS.md` if a non-obvious design decision was made
   - Run `/release-notes` skill to generate PR description from the git diff.
   - When creating a PR, include the generated release notes in the PR body.
   - **Extract ADR from `.sherlock-plan.md`** (if an Architecture Decision was made):
     1. Find the highest-numbered ADR in `docs/adr/`, increment by 1
     2. Create `docs/adr/NNN-short-title.md` using the standard template:
        - `Context` ← from plan's `Rationale` (why this decision was needed)
        - `Decision` ← from plan's `Approach chosen` + `Summary`
        - `Consequences → Positive` ← what becomes easier or better because of this approach (from `Architecture Decision → Summary`)
        - `Consequences → Negative` ← trade-offs, limitations, and what the rejected alternatives would have provided (from OUT OF SCOPE + non-chosen approaches)
        - `Consequences → Neutral` ← side effects that are neither clearly positive nor negative
     3. Set Status to `PROPOSED` (becomes `ACCEPTED` when PR merges)
     4. Add entry to `docs/adr/README.md` index table
     5. Create a follow-up commit to include the ADR (do NOT amend the previous commit)
   - **Delete `.sherlock-plan.md`** after extraction (execution artifacts like Pivot Log, file lists are not persisted).
   - **Sherlock Lite**: ADR extraction is optional — only extract if the plan contained a non-trivial Architecture Decision (skip for single-approach, obvious plans).

  **Key principles**: No assumptions (verify everything), no shortcuts (research before coding), no unreviewed code (multi-agent review every phase), no lost decisions (architecture decisions persist as ADRs).

---

## `.sherlock-plan.md` Format (Spec-Anchored)

See [`.claude/spec-format.md`](.claude/spec-format.md) for the complete template and spec section guidelines. This file is the single source of truth for the plan format — referenced by `fw-tdd-red` and `fw-author-spec` agents.

---

## 🎩 HOLMES MODE (Execution)

When the user types "holmes", this is the GO signal to execute a Sherlock plan:

1. **Verify Plan Exists** — If no Sherlock plan exists in this session, warn: "No approved plan found. Run `sherlock` first to create and approve a plan, then `holmes` to execute it."
2. **Create Branch** — Create a feature branch with a descriptive name based on the approved plan (e.g., `feature/add-widget-caching`, `fix/auth-token-refresh`). Ask the user to confirm the branch name before creating.
3. **Begin Implementation** — Execute the approved Sherlock plan using the classified tier's steps:
   - **Sherlock Lite tasks**: Follow the 6-step Lite workflow
   - **Full Sherlock tasks**: Follow the 8-step Full workflow
   - **Hudson tasks do NOT use Holmes** (too lightweight — Hudson is self-contained)
   - If a `.sherlock-plan.md` exists, load it and use it for design-sync throughout.
   - **Promotion still applies**: If complexity grows during execution, announce and promote.
4. **Domain Agent Invocation** — During implementation, proactively invoke domain-specific agents (IN ADDITION to the per-phase review pipeline):
   - DB work → `/schema-check` skill first, then **fw-author-migration** agent
   - API work → **fw-review-api-contracts** (validate contracts)
   - UI work → **fw-review-ux** (review usability, accessibility, interaction states)
   - AI/LLM work → **fw-advisor-architecture** (evaluate model choices, prompt design, cost)
   - Complex tests → **fw-review-tests** (design test strategy, review coverage)
5. **Deployment Readiness** — When the user wants to deploy after Holmes completes:
   - Run `/deploy` skill (tiered deployment checklist)
   - Run `/health` skill to verify production status after deploy
   - Invoke **fw-advisor-release** agent for deployment guidance if needed
