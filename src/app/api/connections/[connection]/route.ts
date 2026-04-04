import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { checkCsrf } from "@/lib/api-guard";
import { getSensitiveLimiter } from "@/lib/rate-limit";
import { disableConnection, enableConnection } from "@/lib/data/connections";

const ALLOWED_CONNECTIONS = ["google-oauth2", "sign-in-with-slack"];

/**
 * DELETE /api/connections/:connection
 * Disables a connection by setting a Redis flag. Tools and token-status
 * check this flag and refuse to exchange tokens until re-enabled.
 * Also attempts to delete Token Vault tokensets via Management API.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ connection: string }> }
) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { success: rlOk } = await getSensitiveLimiter().limit(auth.userId);
  if (!rlOk) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const { connection } = await params;
  if (!ALLOWED_CONNECTIONS.includes(connection)) {
    return NextResponse.json(
      { error: "Unknown connection" },
      { status: 404 }
    );
  }

  try {
    // Set the disabled flag — this is the source of truth for disconnect
    await disableConnection(auth.userId, connection);

    // Best-effort: also delete Token Vault tokensets via Management API
    try {
      await deleteTokensets(auth.userId, connection);
    } catch (err) {
      // Non-fatal — the Redis flag is what matters
      console.error("Tokenset cleanup failed (non-fatal):", err);
    }

    return NextResponse.json({ success: true, connection });
  } catch (err) {
    console.error("Connection revocation failed:", err);
    return NextResponse.json(
      { error: "Failed to disconnect" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/connections/:connection
 * Re-enables a connection (clears the disabled flag).
 * Called when user clicks "Connect" after a disconnect.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ connection: string }> }
) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { success: rlOk } = await getSensitiveLimiter().limit(auth.userId);
  if (!rlOk) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const { connection } = await params;
  if (!ALLOWED_CONNECTIONS.includes(connection)) {
    return NextResponse.json(
      { error: "Unknown connection" },
      { status: 404 }
    );
  }

  try {
    await enableConnection(auth.userId, connection);
    return NextResponse.json({ success: true, connection });
  } catch (err) {
    console.error("Connection re-enable failed:", err);
    return NextResponse.json(
      { error: "Failed to reconnect" },
      { status: 500 }
    );
  }
}

/**
 * Best-effort cleanup of Token Vault tokensets via Auth0 Management API.
 */
async function deleteTokensets(userSub: string, connection: string) {
  const mgmtRes = await fetch(
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
  if (!mgmtRes.ok) return;

  const { access_token: mgmtToken } = await mgmtRes.json();
  const userId = encodeURIComponent(userSub);

  const listRes = await fetch(
    `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${userId}/federated-connections-tokensets`,
    { headers: { Authorization: `Bearer ${mgmtToken}` } }
  );
  if (!listRes.ok) return;

  const tokensets: { tokenset_id: string; connection: string }[] =
    await listRes.json();

  for (const ts of tokensets.filter((t) => t.connection === connection)) {
    await fetch(
      `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${userId}/federated-connections-tokensets/${ts.tokenset_id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${mgmtToken}` },
      }
    );
  }
}
