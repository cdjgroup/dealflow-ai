"use client";

import { TOOL_SCOPES, scopeProvider } from "@/lib/tools/scope-map";

interface Props {
  activeTools: string[];
}

export function ScopeIndicator({ activeTools }: Props) {
  // Collect unique scopes from currently running tools
  const activeScopes = new Set<string>();
  for (const tool of activeTools) {
    const scopes = TOOL_SCOPES[tool];
    if (scopes) {
      for (const scope of scopes) activeScopes.add(scope);
    }
  }

  if (activeScopes.size === 0) return null;

  const scopeArray = Array.from(activeScopes);
  const provider = scopeProvider(scopeArray);

  return (
    <div className="flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <span className="text-xs text-muted-foreground">
        Using: {provider && <span className="font-medium">{provider} </span>}
        {scopeArray.map((scope) => (
          <span
            key={scope}
            className="ml-1 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px]"
          >
            {scope}
          </span>
        ))}
      </span>
    </div>
  );
}
