# `.sherlock-plan.md` Format (Spec-Anchored)

> Single source of truth for the Sherlock plan artifact format. Referenced by `sherlock-methodology.md`, `fw-tdd-red.md`, and `fw-author-spec.md`.

When creating the plan artifact at end of Full Sherlock Phase 4 (architecture approved) or Sherlock Lite Phase 1 (plan approved):

```markdown
# Sherlock Plan: [Feature/Fix Title]
Created: [ISO date]
Tier: Full Sherlock | Sherlock Lite
Status: APPROVED — Executing

## Scope Boundaries
- IN SCOPE: [bullet list]
- OUT OF SCOPE: [bullet list]

## Architecture Decision
Approach chosen: [Minimal/Clean/Pragmatic]
Summary: [1-2 sentences]
Rationale: [Why this approach over alternatives — extracted to ADR post-commit]

## Acceptance Criteria
<!-- Given/When/Then format. Each criterion maps to 1+ test cases in RED phase. -->
<!-- This is the STRUCTURED SPEC — it replaces prose requirements for TDD agents. -->

### AC-1: [Short descriptive name]
- **Given** [precondition]
- **When** [action]
- **Then** [expected outcome]

### AC-2: [Short descriptive name]
- **Given** [precondition]
- **When** [action]
- **Then** [expected outcome]

### AC-3: [Error/edge case name]
- **Given** [precondition]
- **When** [invalid action or boundary condition]
- **Then** [error behavior or graceful handling]

## Interface Contracts
<!-- Type signatures, API shapes, data contracts. Feeds both RED and GREEN phases. -->
<!-- Use the project's language. Omit for doc-only or config-only changes. -->

\`\`\`typescript
// Function signatures
export function processWidget(input: WidgetInput): WidgetResult;

// API endpoint contracts
// POST /api/widgets
// Request: { name: string; config: WidgetConfig }
// Response: { id: string; status: 'created' | 'failed' }
// Error: { error: string; code: number }
\`\`\`

## Planned Files
| File | Action | Reason |
|------|--------|--------|
| path/to/file.ts | CREATE | [why] |
| path/to/other.ts | MODIFY | [why] |
| path/to/test.test.ts | CREATE | [why] |

## Planned Tests
| Test File | Covers | Acceptance Criteria |
|-----------|--------|---------------------|
| path/to/test.test.ts | [module] | AC-1, AC-2, AC-3 |

## TDD Phase Plan
- Phase 1: [core logic — RED/GREEN/REFACTOR — covers AC-1, AC-2]
- Phase 2: [error handling — RED/GREEN/REFACTOR — covers AC-3]

## Pivot Log
<!-- Append entries when implementation diverges from plan -->
<!-- Format: | Date | Phase | Planned | Actual | Reason | -->
```

## Spec Section Guidelines

- **Acceptance Criteria**: Write at minimum 1 happy path, 1 edge case, 1 error case. The fw-tdd-red agent uses these directly as test definitions and may add additional edge cases beyond the ACs to meet its coverage requirements.
- **Interface Contracts**: Include for any change that introduces new functions, types, or API endpoints. Omit for doc/config/CSS-only changes.
- **Sherlock Lite**: Acceptance Criteria required. Interface Contracts required if introducing new interfaces. Architecture Decision section is simpler (single approach, brief rationale).
- **Full Sherlock**: All sections required. Architecture Decision includes full rationale (becomes ADR).
