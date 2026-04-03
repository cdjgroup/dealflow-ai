import { NextResponse } from "next/server";
import { auth0, getUser } from "@/lib/auth0";
import { exchangeTokenWithRefresh } from "@/lib/token-exchange";
import { isConnectionDisabled } from "@/lib/data/connections";

interface TokenStatus {
  connection: string;
  provider: string;
  connected: boolean;
  scopes: string[];
  error?: string;
}

/**
 * GET /api/token-status
 * Checks the Token Vault status for each configured connection
 * by attempting a token exchange. Returns connection status without
 * exposing the actual tokens. Respects user-set disabled flags.
 */
export async function GET() {
  const session = await auth0.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getUser();
  if (!user?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const refreshToken = session.tokenSet?.refreshToken;
  if (!refreshToken) {
    return NextResponse.json([
      {
        connection: "google-oauth2",
        provider: "Google",
        connected: false,
        scopes: ["calendar.readonly", "gmail.compose", "gmail.readonly"],
        error: "Please log out and log back in to enable connections.",
      },
      {
        connection: "sign-in-with-slack",
        provider: "Slack",
        connected: false,
        scopes: ["channels:read", "chat:write"],
        error: "Please log out and log back in to enable connections.",
      },
    ]);
  }

  const connections: { connection: string; provider: string; scopes: string[] }[] = [
    {
      connection: "google-oauth2",
      provider: "Google",
      scopes: ["calendar.readonly", "gmail.compose", "gmail.readonly"],
    },
    {
      connection: "sign-in-with-slack",
      provider: "Slack",
      scopes: ["channels:read", "chat:write"],
    },
  ];

  const results: TokenStatus[] = await Promise.all(
    connections.map(async ({ connection, provider, scopes }) => {
      // Check disabled flag first — skip token exchange if user disconnected
      const disabled = await isConnectionDisabled(user.sub!, connection);
      if (disabled) {
        return {
          connection,
          provider,
          connected: false,
          scopes,
          error: "Disconnected by user.",
        };
      }

      const result = await exchangeTokenWithRefresh(connection, refreshToken);

      if ("token" in result) {
        return { connection, provider, connected: true, scopes };
      }

      // Sanitize Auth0 errors — never expose internal details to client
      const safeErrors: Record<string, string> = {
        invalid_grant: "Session expired. Please log out and log back in.",
        access_denied: "Not connected.",
        unauthorized_client: "Not configured.",
      };
      return {
        connection,
        provider,
        connected: false,
        scopes,
        error: safeErrors[result.error] ?? "Not connected",
      };
    })
  );

  return NextResponse.json(results);
}
