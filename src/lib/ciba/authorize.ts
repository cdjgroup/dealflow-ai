import type { CibaInitiateResponse } from "./types";

/**
 * Initiate a CIBA (Client-Initiated Backchannel Authentication) request.
 * Calls Auth0 POST /bc-authorize to send a push notification to the user's
 * Guardian app for approval.
 *
 * Follows the same direct-HTTP pattern as token-exchange.ts (ADR 001).
 */
export async function initiateCiba(
  userId: string,
  bindingMessage: string,
): Promise<CibaInitiateResponse> {
  const loginHint = JSON.stringify({
    format: "iss_sub",
    iss: `https://${process.env.AUTH0_DOMAIN}/`,
    sub: userId,
  });

  // Sanitize + truncate: Auth0 CIBA allows only alphanumerics, whitespace, +-_.,:#
  const truncatedMessage = bindingMessage.replace(/[^\w\s+\-_.,:#]/g, "").trim().slice(0, 64);

  const body = new URLSearchParams({
    client_id: process.env.AUTH0_CLIENT_ID!,
    client_secret: process.env.AUTH0_CLIENT_SECRET!,
    login_hint: loginHint,
    scope: "openid",
    binding_message: truncatedMessage,
  });

  const response = await fetch(
    `https://${process.env.AUTH0_DOMAIN}/bc-authorize`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(
      err.error_description || err.error || "CIBA initiation failed"
    );
  }

  const data = await response.json();
  return {
    authReqId: data.auth_req_id,
    expiresIn: data.expires_in,
    interval: data.interval,
    bindingMessage: truncatedMessage,
  };
}
