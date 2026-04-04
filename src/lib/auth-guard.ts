import { NextResponse } from "next/server";
import { auth0, getUser } from "@/lib/auth0";

export type AuthResult =
  | { userId: string; error?: never }
  | { userId?: never; error: NextResponse };

/**
 * Verify the request has a valid Auth0 session and extract the userId.
 * Returns { userId } on success, or { error: NextResponse } to return immediately.
 */
export async function requireAuth(): Promise<AuthResult> {
  const session = await auth0.getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const user = await getUser();
  if (!user?.sub) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { userId: user.sub };
}
