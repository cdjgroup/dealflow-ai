import { NextResponse } from "next/server";
import { auth0, getUser } from "@/lib/auth0";
import { checkCsrf } from "@/lib/api-guard";
import { initiateCiba } from "@/lib/ciba/authorize";

export async function POST(req: Request) {
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

  try {
    const { bindingMessage, toolName } = await req.json();
    if (!bindingMessage || !toolName) {
      return NextResponse.json(
        { error: "bindingMessage and toolName are required" },
        { status: 400 }
      );
    }

    const result = await initiateCiba(user.sub, bindingMessage);
    return NextResponse.json(result);
  } catch (err) {
    console.error("CIBA initiation failed:", err);
    // Sanitize error — Auth0 error_description may leak internal details
    const raw = err instanceof Error ? err.message : "";
    const userMessage = raw.includes("not enrolled")
      ? "Device verification requires Auth0 Guardian enrollment on your phone"
      : "Step-up authentication unavailable — please try again";
    return NextResponse.json({ error: userMessage }, { status: 502 });
  }
}
