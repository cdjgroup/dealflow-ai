import { NextResponse } from "next/server";
import { auth0, getUser } from "@/lib/auth0";
import { checkCsrf } from "@/lib/api-guard";
import { getRedis } from "@/lib/redis";

/**
 * DELETE /api/connections/:connection
 * Revokes a connection by clearing cached Token Vault tokens from UpstashStore.
 * On next tool invocation, Token Vault will re-request authorization.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ connection: string }> }
) {
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

  const { connection } = await params;
  const allowedConnections = ["google-oauth2", "sign-in-with-slack"];
  if (!allowedConnections.includes(connection)) {
    return NextResponse.json(
      { error: "Unknown connection" },
      { status: 404 }
    );
  }

  try {
    const redis = getRedis();
    // Clear any cached tokens for this connection
    // Token Vault stores tokens with namespace pattern including the connection name
    const userId = user.sub;
    const pattern = `${userId}:*${connection}*`;

    // Use scan to find matching keys (safer than KEYS in production)
    // Find and delete cached Token Vault tokens for this connection
    // Use scan with explicit typing for Upstash Redis
    const keysToDelete: string[] = [];
    let done = false;
    let scanCursor = 0;
    while (!done) {
      const result = await redis.scan(scanCursor, {
        match: pattern,
        count: 100,
      });
      const nextCursor = Number(result[0]);
      const keys = result[1] as string[];
      keysToDelete.push(...keys);
      if (nextCursor === 0) done = true;
      else scanCursor = nextCursor;
    }

    if (keysToDelete.length > 0) {
      const p = redis.pipeline();
      for (const key of keysToDelete) {
        p.del(key);
      }
      await p.exec();
    }

    return NextResponse.json({
      success: true,
      connection,
      keysCleared: keysToDelete.length,
    });
  } catch (err) {
    console.error("Connection revocation failed:", err);
    return NextResponse.json(
      { error: "Failed to disconnect" },
      { status: 500 }
    );
  }
}
