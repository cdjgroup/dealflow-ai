import { streamText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { setAIContext } from "@auth0/ai-vercel";
import { auth0, getUser } from "@/lib/auth0";
import { checkCalendar } from "@/lib/tools/calendar";
import { draftEmail, searchEmails } from "@/lib/tools/gmail";
import { createCrmTools } from "@/lib/tools/crm";
import { getRateLimiter } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await auth0.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUser();
  const userId = user?.sub ?? "anonymous";

  const limiter = getRateLimiter();
  if (limiter) {
    const { success } = await limiter.limit(userId);
    if (!success) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429 }
      );
    }
  }

  const { messages, id } = await req.json();

  setAIContext({ threadID: id });

  const crmTools = createCrmTools(userId);

  const result = streamText({
    model: anthropic("claude-sonnet-4-5-20250514"),
    system: `You are DealFlow AI, an intelligent sales assistant. You help sales professionals manage their pipeline, schedule meetings, and communicate with prospects.

You have access to:
- A CRM with deals, contacts, and activity history
- Google Calendar to check the user's availability
- Gmail to draft follow-up emails and search correspondence

When the user asks about their pipeline or deals, use the CRM tools.
When they want to schedule something, check their calendar first.
When they want to reach out to a contact, draft an email (never send directly — always draft).

Be concise, professional, and proactive. Suggest next actions when appropriate.
Format currency values and dates clearly.`,
    messages,
    tools: {
      checkCalendar,
      draftEmail,
      searchEmails,
      ...crmTools,
    },
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
