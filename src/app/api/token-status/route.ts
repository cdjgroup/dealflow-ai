import { NextResponse } from "next/server";
import { auth0, getUser } from "@/lib/auth0";

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
 * exposing the actual tokens.
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
        connection: "slack",
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
      connection: "slack",
      provider: "Slack",
      scopes: ["channels:read", "chat:write"],
    },
  ];

  const results: TokenStatus[] = await Promise.all(
    connections.map(async ({ connection, provider, scopes }) => {
      try {
        const response = await fetch(
          `https://${process.env.AUTH0_DOMAIN}/oauth/token`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              grant_type:
                "urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token",
              client_id: process.env.AUTH0_CLIENT_ID,
              client_secret: process.env.AUTH0_CLIENT_SECRET,
              subject_token_type:
                "urn:ietf:params:oauth:token-type:refresh_token",
              subject_token: refreshToken,
              connection,
              requested_token_type:
                "http://auth0.com/oauth/token-type/federated-connection-access-token",
            }),
          }
        );

        if (response.ok) {
          return { connection, provider, connected: true, scopes };
        }

        const err = await response.json();
        // Sanitize Auth0 errors — never expose internal details to client
        const safeErrors: Record<string, string> = {
          invalid_grant: "Session expired. Please log out and log back in.",
          access_denied: "Not connected.",
          unauthorized_client: "Not configured.",
        };
        console.error(`Token status check failed for ${connection}:`, err);
        return {
          connection,
          provider,
          connected: false,
          scopes,
          error: safeErrors[err.error] ?? "Not connected",
        };
      } catch {
        return {
          connection,
          provider,
          connected: false,
          scopes,
          error: "Unable to check status",
        };
      }
    })
  );

  return NextResponse.json(results);
}
