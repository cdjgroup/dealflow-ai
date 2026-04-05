import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { requireAuth } from "@/lib/auth-guard";
import { exchangeTokenWithRefresh } from "@/lib/token-exchange";
import { isConnectionDisabled } from "@/lib/data/connections";
import { getPollingLimiter } from "@/lib/rate-limit";

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
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { success } = await getPollingLimiter().limit(auth.userId);
  if (!success) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  // Need session for refresh token (requireAuth only extracts userId)
  const session = await auth0.getSession();
  const refreshToken = session?.tokenSet?.refreshToken;
  if (!refreshToken) {
    return NextResponse.json([
      {
        connection: "google-oauth2",
        provider: "Google",
        connected: false,
        scopes: ["calendar.readonly", "calendar.events", "gmail.compose", "gmail.readonly"],
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
      scopes: ["calendar.readonly", "calendar.events", "gmail.compose", "gmail.readonly"],
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
      const disabled = await isConnectionDisabled(auth.userId, connection);
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
