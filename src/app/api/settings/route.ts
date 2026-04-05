import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { requireAuth } from "@/lib/auth-guard";
import {
  getUserSettings,
  updateUserSettings,
  updateScheduleIndex,
} from "@/lib/data/settings";
import {
  storeScheduleRefreshToken,
  deleteScheduleRefreshToken,
} from "@/lib/data/schedule-tokens";
import { checkCsrf } from "@/lib/api-guard";
import { z } from "zod";

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const settings = await getUserSettings(auth.userId);
  return NextResponse.json(settings);
}

const settingsSchema = z.object({
  capabilities: z
    .object({
      crmRead: z.boolean(),
      crmWrite: z.boolean(),
      calendar: z.boolean(),
      gmail: z.boolean(),
      slack: z.boolean(),
    })
    .optional(),
  approvalRequired: z
    .object({
      crmWrite: z.boolean(),
    })
    .optional(),
  toolTrust: z
    .record(z.string().max(64), z.enum(["always", "ask", "never"]))
    .refine((obj) => Object.keys(obj).length <= 20, {
      message: "toolTrust cannot contain more than 20 entries",
    })
    .optional(),
  autonomyLevel: z
    .union([z.literal(1), z.literal(2), z.literal(3)])
    .optional(),
  schedule: z
    .object({
      enabled: z.boolean(),
      hours: z
        .array(
          z.number().int().refine((h) => [8, 12, 17].includes(h), {
            message: "Hour must be 8, 12, or 17",
          })
        )
        .max(3),
      timezone: z.string().max(64).refine(
        (tz) => {
          try {
            Intl.DateTimeFormat(undefined, { timeZone: tz });
            return true;
          } catch {
            return false;
          }
        },
        { message: "Invalid IANA timezone identifier" }
      ),
    })
    .optional(),
  confidenceThresholds: z
    .object({
      autoApprove: z.number().min(0).max(1),
      requireReview: z.number().min(0).max(1),
    })
    .refine((t) => t.autoApprove > t.requireReview, {
      message: "autoApprove must be greater than requireReview",
    })
    .optional(),
  mcpClients: z
    .record(
      z.string().max(128),
      z.object({
        allowedCategories: z.array(
          z.enum(["crmRead", "crmWrite", "calendar", "gmail", "slack"])
        ).min(1).max(5),
        label: z.string().max(64).optional(),
      })
    )
    .refine((obj) => Object.keys(obj).length <= 10, {
      message: "mcpClients cannot contain more than 10 entries",
    })
    .optional(),
});

export async function PUT(req: Request) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireAuth();
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid settings", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Get old settings before update (for schedule index diff)
  const oldSettings = await getUserSettings(auth.userId);

  const updated = await updateUserSettings(auth.userId, parsed.data);

  // Maintain schedule index and refresh token
  if (parsed.data.schedule) {
    const oldHours = oldSettings.schedule?.hours ?? [];
    const newHours = parsed.data.schedule.enabled
      ? parsed.data.schedule.hours
      : [];
    await updateScheduleIndex(auth.userId, oldHours, newHours);

    if (parsed.data.schedule.enabled && parsed.data.schedule.hours.length > 0) {
      const session = await auth0.getSession();
      const refreshToken = session?.tokenSet?.refreshToken;
      if (refreshToken) {
        await storeScheduleRefreshToken(auth.userId, refreshToken);
      } else {
        console.warn(
          "Schedule enabled for user %s but no refresh token in session",
          auth.userId
        );
      }
    } else {
      await deleteScheduleRefreshToken(auth.userId);
    }
  }

  return NextResponse.json(updated);
}
