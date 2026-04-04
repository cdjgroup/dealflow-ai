import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getUserSettings, updateUserSettings } from "@/lib/data/settings";
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

  const updated = await updateUserSettings(auth.userId, parsed.data);
  return NextResponse.json(updated);
}
