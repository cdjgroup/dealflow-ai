import { auth0 } from "@/lib/auth0";

type TokenResult = { token: string } | { error: string };

/**
 * Exchange a refresh token for a short-lived access token via Auth0 Token Vault.
 * Uses RFC 8693 federated connection access token exchange.
 *
 * This is the single source of truth for token exchange — used by
 * calendar, gmail, slack tools, and the token-status endpoint.
 */
export async function exchangeToken(connection: string): Promise<TokenResult> {
  const session = await auth0.getSession();
  const refreshToken = session?.tokenSet?.refreshToken;
  if (!refreshToken) {
    return { error: "No session refresh token. Please log out and log back in." };
  }

  return exchangeTokenWithRefresh(connection, refreshToken);
}

/**
 * Exchange when you already have the refresh token (e.g., token-status endpoint).
 */
export async function exchangeTokenWithRefresh(
  connection: string,
  refreshToken: string
): Promise<TokenResult> {
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
        subject_token_type: "urn:ietf:params:oauth:token-type:refresh_token",
        subject_token: refreshToken,
        connection,
        requested_token_type:
          "http://auth0.com/oauth/token-type/federated-connection-access-token",
      }),
    }
  );

  if (!response.ok) {
    const err = await response.json();
    return { error: err.error_description || err.error || "Token exchange failed" };
  }

  const tokenData = await response.json();
  return { token: tokenData.access_token };
}

/**
 * Sanitize external API errors into safe user-facing messages.
 */
export function sanitizeApiError(status: number, label: string): string {
  if (status === 401 || status === 403) return `${label}: authorization failed — token may be expired`;
  if (status === 404) return `${label}: resource not found`;
  if (status === 429) return `${label}: rate limit exceeded`;
  return `${label}: request failed (status ${status})`;
}
