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
    const message = err instanceof Error ? err.message : "CIBA initiation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
