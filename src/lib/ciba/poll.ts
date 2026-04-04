import type { CibaPollResult } from "./types";

/**
 * Poll Auth0 /oauth/token for the status of a CIBA authorization request.
 * Returns the current status: pending, approved (with token), denied, expired, or error.
 *
 * Follows the same direct-HTTP pattern as token-exchange.ts (ADR 001).
 */
export async function pollCiba(authReqId: string): Promise<CibaPollResult> {
  const body = new URLSearchParams({
    grant_type: "urn:openid:params:grant-type:ciba",
    auth_req_id: authReqId,
    client_id: process.env.AUTH0_CLIENT_ID!,
    client_secret: process.env.AUTH0_CLIENT_SECRET!,
  });

  const response = await fetch(
    `https://${process.env.AUTH0_DOMAIN}/oauth/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    }
  );

  if (response.ok) {
    const data = await response.json();
    return {
      status: "approved",
      accessToken: data.access_token,
    };
  }

  const err = await response.json();

  if (err.error === "authorization_pending" || err.error === "slow_down") {
    return { status: "pending" };
  }

  if (err.error === "access_denied") {
    return {
      status: "denied",
      error: err.error_description || "Authorization denied by user",
    };
  }

  if (err.error === "expired_token") {
    return {
      status: "expired",
      error: err.error_description || "Authorization request expired",
    };
  }

  return {
    status: "error",
    error: err.error_description || err.error || "Unknown CIBA error",
  };
}
