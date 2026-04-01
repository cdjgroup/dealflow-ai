---
name: deploy
description: Run deployment checklist (Tier 1/2/3). Use when preparing to deploy code to production. Invoke with tier level argument.
allowed-tools: Bash, Read, Grep, Glob, Write, Edit
argument-hint: "[tier1|tier2|tier3]"
---

Run the deployment checklist for this project. The deployment tier is: $ARGUMENTS

## Deployment Tiers

### Tier 1 (Full) -- New features, refactors, significant changes
1. Read `docs/20-DEPLOYMENT.md` for the full protocol
2. Verify all tests pass (use the test command from `config/framework.yaml`)
3. Update version description in CLAUDE.md and README.md
4. Update `release_notes.md` with changes
5. Update relevant docs (features, database, architecture as needed)
6. Add insight entry to `docs/70-INSIGHTS.md`
7. If prompts changed: export prompt snapshots (if configured)
8. Create PR with `gh pr create`
9. WAIT for user approval before merging
10. After merge: version auto-bumps, deploy completes (check framework.yaml for deploy method)
11. Verify health (use `/health` skill or manual check)

### Tier 2 (Simplified) -- Bug fixes, minor changes
1. Update version description in CLAUDE.md
2. Update `release_notes.md`
3. Create PR
4. WAIT for user approval
5. After merge: verify health

### Tier 3 (Emergency) -- Hotfixes, critical fixes
1. Create PR immediately
2. WAIT for user approval
3. Consider fast deploy: `gh workflow run "CI/CD Pipeline" -f fast_deploy=true`
4. Verify health after deploy

## Key Rules
- Version numbers auto-increment on merge to main (DO NOT manually bump)
- NEVER merge without explicit user approval
- NEVER use `--delete-branch` without asking
