import { NextResponse } from "next/server";
import { auth0, getUser } from "@/lib/auth0";
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
  const session = await auth0.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getUser();
  if (!user?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getUserSettings(user.sub);
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
});

export async function PUT(req: Request) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const session = await auth0.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getUser();
  if (!user?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
  const oldSettings = await getUserSettings(user.sub);

  const updated = await updateUserSettings(user.sub, parsed.data);

  // Maintain schedule index and refresh token
  if (parsed.data.schedule) {
    const oldHours = oldSettings.schedule?.hours ?? [];
    const newHours = parsed.data.schedule.enabled
      ? parsed.data.schedule.hours
      : [];
    await updateScheduleIndex(user.sub, oldHours, newHours);

    if (parsed.data.schedule.enabled && parsed.data.schedule.hours.length > 0) {
      const refreshToken = session.tokenSet?.refreshToken;
      if (refreshToken) {
        await storeScheduleRefreshToken(user.sub, refreshToken);
      } else {
        console.warn(
          "Schedule enabled for user %s but no refresh token in session",
          user.sub
        );
      }
    } else {
      await deleteScheduleRefreshToken(user.sub);
    }
  }

  return NextResponse.json(updated);
}
