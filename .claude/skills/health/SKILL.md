---
name: health
description: Check production health status. Use after deployments or when verifying system status.
allowed-tools: Bash, Read, Grep, Glob
argument-hint: "[frontend|backend|all]"
---

Check the production health status. Scope: $ARGUMENTS (default: all)

## Steps

1. **Read health endpoints from config**:
   Check `config/framework.yaml` for `stack.backend.health_endpoint` and `stack.frontend.health_endpoint`.

2. **Check backend health** (if configured):
   ```bash
   # Read the backend URL from environment or config
   curl -s -o /dev/null -w "%{http_code}" <backend_url><health_endpoint>
   ```

3. **Check frontend health** (if configured):
   ```bash
   curl -s -o /dev/null -w "%{http_code}" <frontend_url><health_endpoint>
   ```

4. **Check recent CI/CD runs**:
   ```bash
   gh run list --limit 5
   ```

5. **Summarize**:
   - Backend status (UP/DOWN + HTTP code + version if available)
   - Frontend status (UP/DOWN + HTTP code)
   - Latest CI/CD run status
   - Any issues detected
