import { z } from "zod";
import type { ActionDraft } from "@/lib/types/actions";

const emailDraftSchema = z.object({
  to: z.string().email().max(254),
  subject: z.string().min(1).max(500),
  body: z.string().max(10_000),
});

const calendarDraftSchema = z.object({
  title: z.string().min(1).max(500),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  duration: z.number().int().min(5).max(480),
  attendees: z.array(z.string().email()).max(50),
  notes: z.string().max(2000).optional(),
});

const slackDraftSchema = z.object({
  channel: z.string().regex(/^#?[\w-]{1,80}$/),
  message: z.string().min(1).max(4000),
});

export const draftSchema = z.union([
  emailDraftSchema,
  calendarDraftSchema,
  slackDraftSchema,
]).transform((v) => v as ActionDraft);
