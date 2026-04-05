"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type {
  SuggestedAction,
  EmailDraft,
  CalendarDraft,
  SlackDraft,
  ActionDraft,
} from "@/lib/types/actions";

interface Props {
  action: SuggestedAction;
  onApprove: (id: string) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
  onExecute: (id: string) => Promise<void>;
  onUpdateDraft: (id: string, draft: ActionDraft) => Promise<void>;
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function SlackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A"/>
      <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0"/>
      <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.163 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" fill="#2EB67D"/>
      <path d="M15.163 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.163 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 0 1-2.52-2.523 2.527 2.527 0 0 1 2.52-2.52h6.315A2.528 2.528 0 0 1 24 15.163a2.528 2.528 0 0 1-2.522 2.523h-6.315z" fill="#ECB22E"/>
    </svg>
  );
}

function TypeIcon({ type }: { type: string }) {
  const size = "w-5 h-5";
  switch (type) {
    case "email":
      return <GoogleIcon className={size} />;
    case "calendar":
      return <GoogleIcon className={size} />;
    case "slack":
      return <SlackIcon className={size} />;
    default:
      return null;
  }
}

const typeLabels: Record<string, string> = {
  email: "Gmail",
  calendar: "Google Calendar",
  slack: "Slack",
};

const priorityStyles: Record<string, string> = {
  high: "bg-red-500/10 text-red-400 border-red-500/30",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  low: "bg-muted-foreground/10 text-muted-foreground border-border",
};

const statusStyles: Record<string, { border: string; badge: string; label: string }> = {
  pending: { border: "border-amber-500/30", badge: "bg-amber-500/10 text-amber-400", label: "Pending" },
  approved: { border: "border-blue-500/30", badge: "bg-blue-500/10 text-blue-400", label: "Approved" },
  dismissed: { border: "border-border", badge: "bg-muted text-muted-foreground", label: "Dismissed" },
  "ciba-pending": { border: "border-chart-4/30", badge: "bg-chart-4/10 text-chart-4", label: "Device Approval..." },
  executing: { border: "border-primary/30", badge: "bg-primary/10 text-primary", label: "Executing..." },
  sent: { border: "border-emerald-500/30", badge: "bg-emerald-500/10 text-emerald-400", label: "Completed" },
  failed: { border: "border-destructive/30", badge: "bg-destructive/10 text-destructive", label: "Failed" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function EmailPreview({ draft }: { draft: EmailDraft }) {
  return (
    <div className="space-y-1 text-sm">
      <div className="flex gap-2">
        <span className="text-muted-foreground">To:</span>
        <span>{draft.to}</span>
      </div>
      <div className="flex gap-2">
        <span className="text-muted-foreground">Subject:</span>
        <span>{draft.subject}</span>
      </div>
      <p className="text-muted-foreground line-clamp-2 mt-1">{draft.body}</p>
    </div>
  );
}

function CalendarPreview({ draft }: { draft: CalendarDraft }) {
  return (
    <div className="space-y-1 text-sm">
      <div className="font-medium">{draft.title}</div>
      <div className="text-muted-foreground">
        {draft.date} at {draft.time} ({draft.duration}min)
      </div>
      {draft.attendees.length > 0 && (
        <div className="text-muted-foreground">
          Attendees: {draft.attendees.join(", ")}
        </div>
      )}
    </div>
  );
}

function SlackPreview({ draft }: { draft: SlackDraft }) {
  return (
    <div className="space-y-1 text-sm">
      <div className="flex gap-2">
        <span className="text-muted-foreground">Channel:</span>
        <span>{draft.channel}</span>
      </div>
      <p className="text-muted-foreground line-clamp-2">{draft.message}</p>
    </div>
  );
}

function DraftPreview({ action }: { action: SuggestedAction }) {
  switch (action.type) {
    case "email":
      return <EmailPreview draft={action.draft as EmailDraft} />;
    case "calendar":
      return <CalendarPreview draft={action.draft as CalendarDraft} />;
    case "slack":
      return <SlackPreview draft={action.draft as SlackDraft} />;
  }
}

function EmailEditor({
  draft,
  onChange,
}: {
  draft: EmailDraft;
  onChange: (d: EmailDraft) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="email-to" className="text-xs text-muted-foreground">To</label>
        <input
          id="email-to"
          type="email"
          value={draft.to}
          onChange={(e) => onChange({ ...draft, to: e.target.value })}
          className="w-full mt-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          required
        />
      </div>
      <div>
        <label htmlFor="email-subject" className="text-xs text-muted-foreground">Subject</label>
        <input
          id="email-subject"
          type="text"
          value={draft.subject}
          onChange={(e) => onChange({ ...draft, subject: e.target.value })}
          className="w-full mt-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div>
        <label htmlFor="email-body" className="text-xs text-muted-foreground">Body</label>
        <textarea
          id="email-body"
          value={draft.body}
          onChange={(e) => onChange({ ...draft, body: e.target.value })}
          rows={5}
          className="w-full mt-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
        />
      </div>
    </div>
  );
}

function CalendarEditor({
  draft,
  onChange,
}: {
  draft: CalendarDraft;
  onChange: (d: CalendarDraft) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="cal-title" className="text-xs text-muted-foreground">Title</label>
        <input
          id="cal-title"
          type="text"
          value={draft.title}
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
          className="w-full mt-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label htmlFor="cal-date" className="text-xs text-muted-foreground">Date</label>
          <input
            id="cal-date"
            type="date"
            value={draft.date}
            onChange={(e) => onChange({ ...draft, date: e.target.value })}
            className="w-full mt-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label htmlFor="cal-time" className="text-xs text-muted-foreground">Time</label>
          <input
            id="cal-time"
            type="time"
            value={draft.time}
            onChange={(e) => onChange({ ...draft, time: e.target.value })}
            className="w-full mt-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label htmlFor="cal-duration" className="text-xs text-muted-foreground">Duration (min)</label>
          <input
            id="cal-duration"
            type="number"
            value={draft.duration}
            onChange={(e) => onChange({ ...draft, duration: parseInt(e.target.value) || 30 })}
            className="w-full mt-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>
      <div>
        <label htmlFor="cal-notes" className="text-xs text-muted-foreground">Notes</label>
        <textarea
          id="cal-notes"
          value={draft.notes || ""}
          onChange={(e) => onChange({ ...draft, notes: e.target.value })}
          rows={2}
          className="w-full mt-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
        />
      </div>
    </div>
  );
}

function SlackEditor({
  draft,
  onChange,
}: {
  draft: SlackDraft;
  onChange: (d: SlackDraft) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="slack-channel" className="text-xs text-muted-foreground">Channel</label>
        <input
          id="slack-channel"
          type="text"
          value={draft.channel}
          onChange={(e) => onChange({ ...draft, channel: e.target.value })}
          className="w-full mt-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div>
        <label htmlFor="slack-message" className="text-xs text-muted-foreground">Message</label>
        <textarea
          id="slack-message"
          value={draft.message}
          onChange={(e) => onChange({ ...draft, message: e.target.value })}
          rows={4}
          className="w-full mt-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
        />
      </div>
    </div>
  );
}

function DraftEditor({
  action,
  draft,
  onChange,
}: {
  action: SuggestedAction;
  draft: ActionDraft;
  onChange: (d: ActionDraft) => void;
}) {
  switch (action.type) {
    case "email":
      return <EmailEditor draft={draft as EmailDraft} onChange={onChange} />;
    case "calendar":
      return <CalendarEditor draft={draft as CalendarDraft} onChange={onChange} />;
    case "slack":
      return <SlackEditor draft={draft as SlackDraft} onChange={onChange} />;
  }
}

export function ActionCard({
  action,
  onApprove,
  onDismiss,
  onExecute,
  onUpdateDraft,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<ActionDraft>(action.draft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const style = statusStyles[action.status];
  const isTerminal = ["dismissed", "sent"].includes(action.status);

  async function handleSave() {
    // Client-side validation for email
    if (action.type === "email") {
      const d = editDraft as EmailDraft;
      if (!d.to || !d.subject) {
        setError("To and Subject are required");
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      await onUpdateDraft(action.id, editDraft);
      setEditing(false);
    } catch {
      setError("Failed to save changes");
      setEditDraft(action.draft);
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`rounded-lg border ${style.border} bg-card/80 backdrop-blur-sm p-4 ${isTerminal ? "opacity-60" : ""}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <TypeIcon type={action.type} />
          <div>
            <span className="text-sm font-medium text-foreground">
              {typeLabels[action.type]}: {action.contactName}
            </span>
            <span className="text-xs text-muted-foreground ml-2">
              {action.dealName}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full border ${priorityStyles[action.priority]}`}>
            {action.priority}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${style.badge}`}>
            {action.status === "executing" ? (
              <span className="animate-pulse">{style.label}</span>
            ) : (
              style.label
            )}
          </span>
          <span className="text-xs text-muted-foreground">{timeAgo(action.createdAt)}</span>
        </div>
      </div>

      {/* Justification */}
      <p className="text-sm text-muted-foreground mb-3 italic">
        {action.justification}
      </p>

      {/* Draft Preview or Editor */}
      <div className="rounded-md bg-secondary/30 p-3 mb-3">
        <AnimatePresence mode="wait">
          {editing ? (
            <motion.div
              key="editor"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              <DraftEditor action={action} draft={editDraft} onChange={setEditDraft} />
              {error && (
                <p className="text-xs text-destructive mt-2">{error}</p>
              )}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setEditDraft(action.draft);
                    setError(null);
                  }}
                  className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <DraftPreview action={action} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Error message */}
      {action.errorMessage && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-2 mb-3">
          <p className="text-xs text-destructive">{action.errorMessage}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        {action.status === "pending" && (
          <>
            <button
              onClick={() => onApprove(action.id)}
              className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Approve
            </button>
            <button
              onClick={() => {
                setEditing(true);
                setEditDraft(action.draft);
              }}
              className="rounded-md border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Edit
            </button>
            <button
              onClick={() => onDismiss(action.id)}
              className="rounded-md border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Dismiss
            </button>
          </>
        )}
        {action.status === "approved" && (
          <button
            onClick={() => onExecute(action.id)}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Execute
          </button>
        )}
        {action.status === "failed" && (
          <button
            onClick={() => onExecute(action.id)}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Retry
          </button>
        )}
      </div>
    </motion.div>
  );
}
