export type ActionType = "email" | "calendar" | "slack";
export type ActionStatus =
  | "pending"
  | "approved"
  | "dismissed"
  | "executing"
  | "sent"
  | "failed";
export type ActionPriority = "high" | "medium" | "low";

export interface EmailDraft {
  to: string;
  subject: string;
  body: string;
}

export interface CalendarDraft {
  title: string;
  date: string;
  time: string;
  duration: number;
  attendees: string[];
  notes?: string;
}

export interface SlackDraft {
  channel: string;
  message: string;
}

export type ActionDraft = EmailDraft | CalendarDraft | SlackDraft;

export interface SuggestedAction {
  id: string;
  userId: string;
  type: ActionType;
  status: ActionStatus;
  priority: ActionPriority;
  dealId: string;
  dealName: string;
  contactName: string;
  justification: string;
  draft: ActionDraft;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}
