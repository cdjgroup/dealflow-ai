"use client";

import { useState, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import type { SuggestedAction, ActionStatus, ActionDraft } from "@/lib/types/actions";
import { ActionCard } from "@/components/action-card";
import { ActionFilters } from "@/components/action-filters";

const headers = {
  "Content-Type": "application/json",
  "X-Requested-With": "XMLHttpRequest",
};

interface Props {
  initialActions: SuggestedAction[];
}

export function ActionList({ initialActions }: Props) {
  const [actions, setActions] = useState<SuggestedAction[]>(initialActions);
  const [filter, setFilter] = useState<ActionStatus | "all">("all");

  const updateLocal = useCallback(
    (id: string, update: Partial<SuggestedAction>) => {
      setActions((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...update } : a))
      );
    },
    []
  );

  const handleApprove = useCallback(
    async (id: string) => {
      updateLocal(id, { status: "approved" });
      try {
        const res = await fetch(`/api/actions/${id}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({ status: "approved" }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          updateLocal(id, {
            status: "pending",
            errorMessage: data.error || undefined,
          });
        }
      } catch {
        updateLocal(id, { status: "pending" });
      }
    },
    [updateLocal]
  );

  const handleDismiss = useCallback(
    async (id: string) => {
      updateLocal(id, { status: "dismissed" });
      try {
        const res = await fetch(`/api/actions/${id}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({ status: "dismissed" }),
        });
        if (!res.ok) {
          updateLocal(id, { status: "pending" });
        }
      } catch {
        updateLocal(id, { status: "pending" });
      }
    },
    [updateLocal]
  );

  const pollCibaStatus = useCallback(
    async (id: string, authReqId: string, interval: number) => {
      const pollMs = Math.max(interval, 2) * 1000;
      const maxPolls = 60; // Max ~5 minutes of polling
      for (let i = 0; i < maxPolls; i++) {
        await new Promise((r) => setTimeout(r, pollMs));
        try {
          const res = await fetch(`/api/ciba/status/${authReqId}`, { headers });
          const data = await res.json();
          if (data.status === "approved") {
            // CIBA approved — now execute the action
            updateLocal(id, { status: "executing" });
            const execRes = await fetch(`/api/actions/${id}/execute`, {
              method: "POST",
              headers,
            });
            const execData = await execRes.json();
            if (execData.action) {
              updateLocal(id, {
                status: execData.action.status,
                errorMessage: execData.action.errorMessage,
              });
            }
            return;
          } else if (data.status === "denied" || data.status === "expired" || data.status === "error") {
            updateLocal(id, {
              status: "failed",
              errorMessage: data.error || `Device authorization ${data.status}`,
            });
            return;
          }
          // Still pending — continue polling
        } catch {
          // Network error — keep polling
        }
      }
      updateLocal(id, { status: "failed", errorMessage: "CIBA polling timed out" });
    },
    [updateLocal]
  );

  const handleExecute = useCallback(
    async (id: string) => {
      updateLocal(id, { status: "executing", errorMessage: undefined });
      try {
        const res = await fetch(`/api/actions/${id}/execute`, {
          method: "POST",
          headers,
        });
        const data = await res.json();

        // Handle CIBA step-up response
        if (data.cibaRequired && data.authReqId) {
          updateLocal(id, { status: "ciba-pending" as "approved" });
          pollCibaStatus(id, data.authReqId, data.interval || 5);
          return;
        }

        if (data.action) {
          updateLocal(id, {
            status: data.action.status,
            errorMessage: data.action.errorMessage,
          });
        } else {
          updateLocal(id, {
            status: "failed",
            errorMessage: data.error || "Unexpected response",
          });
        }
      } catch {
        updateLocal(id, { status: "failed", errorMessage: "Network error" });
      }
    },
    [updateLocal, pollCibaStatus]
  );

  const handleUpdateDraft = useCallback(
    async (id: string, draft: ActionDraft) => {
      const prev = actions.find((a) => a.id === id);
      updateLocal(id, { draft });
      try {
        const res = await fetch(`/api/actions/${id}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({ draft }),
        });
        if (!res.ok && prev) {
          updateLocal(id, { draft: prev.draft });
          throw new Error("Save failed");
        }
      } catch (err) {
        if (prev) updateLocal(id, { draft: prev.draft });
        throw err;
      }
    },
    [actions, updateLocal]
  );

  const handleBatchApprove = useCallback(async () => {
    const pendingIds = actions
      .filter((a) => a.status === "pending")
      .map((a) => a.id);

    if (pendingIds.length === 0) return;

    // Optimistic update
    for (const id of pendingIds) {
      updateLocal(id, { status: "approved" });
    }

    try {
      const res = await fetch("/api/actions/batch", {
        method: "POST",
        headers,
        body: JSON.stringify({ actionIds: pendingIds, status: "approved" }),
      });
      if (!res.ok) {
        for (const id of pendingIds) {
          updateLocal(id, { status: "pending" });
        }
      }
    } catch {
      for (const id of pendingIds) {
        updateLocal(id, { status: "pending" });
      }
    }
  }, [actions, updateLocal]);

  const filtered =
    filter === "all" ? actions : actions.filter((a) => a.status === filter);

  return (
    <div className="space-y-4">
      <ActionFilters
        actions={actions}
        activeFilter={filter}
        onFilterChange={setFilter}
        onBatchApprove={handleBatchApprove}
      />

      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {filtered.map((action) => (
            <ActionCard
              key={action.id}
              action={action}
              onApprove={handleApprove}
              onDismiss={handleDismiss}
              onExecute={handleExecute}
              onUpdateDraft={handleUpdateDraft}
            />
          ))}
        </AnimatePresence>

        {filtered.length === 0 && actions.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No actions matching this filter.
          </div>
        )}
      </div>
    </div>
  );
}
