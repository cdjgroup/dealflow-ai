import { NextResponse } from "next/server";
import { auth0, getUser } from "@/lib/auth0";
import { checkCsrf } from "@/lib/api-guard";
import { getRedis } from "@/lib/redis";

const ALLOWED_CONNECTIONS = ["google-oauth2", "sign-in-with-slack"];

/**
 * Fetches a short-lived Auth0 Management API token via client_credentials grant.
 */
async function getManagementToken(): Promise<string> {
  const res = await fetch(
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
  if (!res.ok) {
    throw new Error(`Management API token request failed: ${res.status}`);
  }
  const data = await res.json();
  return data.access_token;
}

interface Tokenset {
  tokenset_id: string;
  connection: string;
}

/**
 * DELETE /api/connections/:connection
 * Revokes a federated connection by:
 * 1. Listing the user's Token Vault tokensets via Management API
 * 2. Deleting matching tokensets so the stored provider tokens are removed
 * 3. Clearing any cached tokens from Redis
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
    const mgmtToken = await getManagementToken();
    const userId = encodeURIComponent(user.sub);

    // Step 1: List the user's Token Vault tokensets
    const listRes = await fetch(
      `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${userId}/federated-connections-tokensets`,
      {
        headers: { Authorization: `Bearer ${mgmtToken}` },
      }
    );

    if (!listRes.ok) {
      console.error("Failed to list tokensets:", listRes.status);
      return NextResponse.json(
        { error: "Failed to disconnect — could not list tokensets" },
        { status: 502 }
      );
    }

    const tokensets: Tokenset[] = await listRes.json();

    // Step 2: Delete tokensets matching the target connection
    const matching = tokensets.filter((ts) => ts.connection === connection);
    let deletedCount = 0;

    for (const ts of matching) {
      const delRes = await fetch(
        `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${userId}/federated-connections-tokensets/${ts.tokenset_id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${mgmtToken}` },
        }
      );
      // 204 = success, 404 = already gone
      if (delRes.ok || delRes.status === 404) {
        deletedCount++;
      } else {
        console.error(
          `Failed to delete tokenset ${ts.tokenset_id}:`,
          delRes.status,
          await delRes.text()
        );
      }
    }

    // Step 3: Clear any cached tokens from Redis
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
      tokensetsDeleted: deletedCount,
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
