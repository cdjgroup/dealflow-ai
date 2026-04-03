import { NextResponse } from "next/server";
import { auth0, getUser } from "@/lib/auth0";
import { checkCsrf } from "@/lib/api-guard";
import { getRedis } from "@/lib/redis";

const ALLOWED_CONNECTIONS = ["google-oauth2", "sign-in-with-slack"];

/**
 * DELETE /api/connections/:connection
 * Revokes a federated connection by:
 * 1. Calling Auth0 Management API to delete the user's federated connection
 * 2. Clearing any cached Token Vault tokens from Redis
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
  if (!ALLOWED_CONNECTIONS.includes(connection)) {
    return NextResponse.json(
      { error: "Unknown connection" },
      { status: 404 }
    );
  }

  try {
    // Step 1: Get a Management API token
    const mgmtTokenRes = await fetch(
      `https://${process.env.AUTH0_DOMAIN}/oauth/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: process.env.AUTH0_CLIENT_ID,
          client_secret: process.env.AUTH0_CLIENT_SECRET,
          audience: `https://${process.env.AUTH0_DOMAIN}/api/v2/`,
        }),
      }
    );

    if (!mgmtTokenRes.ok) {
      console.error("Failed to get Management API token:", mgmtTokenRes.status);
      return NextResponse.json(
        { error: "Failed to disconnect — could not reach Auth0" },
        { status: 502 }
      );
    }

    const { access_token: mgmtToken } = await mgmtTokenRes.json();

    // Step 2: Delete the user's federated connection via Management API
    const userId = encodeURIComponent(user.sub);
    const deleteRes = await fetch(
      `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${userId}/federated-connections/${connection}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${mgmtToken}` },
      }
    );

    // 204 = success, 404 = already disconnected (treat as success)
    if (!deleteRes.ok && deleteRes.status !== 404) {
      const errBody = await deleteRes.text();
      console.error("Auth0 federated connection delete failed:", deleteRes.status, errBody);
      return NextResponse.json(
        { error: "Failed to disconnect — Auth0 rejected the request" },
        { status: 502 }
      );
    }

    // Step 3: Also clear any cached tokens from Redis (belt and suspenders)
    const redis = getRedis();
    const pattern = `${user.sub}:*${connection}*`;
    const keysToDelete: string[] = [];
    let scanCursor = 0;
    let done = false;
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
