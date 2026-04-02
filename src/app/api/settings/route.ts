import { NextResponse } from "next/server";
import { auth0, getUser } from "@/lib/auth0";
import { getUserSettings, updateUserSettings } from "@/lib/data/settings";
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

  const updated = await updateUserSettings(user.sub, parsed.data);
  return NextResponse.json(updated);
}
