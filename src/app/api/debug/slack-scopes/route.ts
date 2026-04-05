import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { exchangeToken } from "@/lib/token-exchange";

/**
 * GET /api/debug/slack-scopes
 * Diagnostic endpoint — shows what scopes the Slack token actually has.
 * Calls Slack's auth.test to verify the token, then reports the scopes
 * returned by both Auth0 token exchange and Slack itself.
 *
 * TODO: Remove before production release.
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const result = await exchangeToken("sign-in-with-slack");
  if ("error" in result) {
    return NextResponse.json({ error: result.error, phase: "token-exchange" });
  }

  // Call Slack auth.test to verify the token and see what it has
  const authTest = await fetch("https://slack.com/api/auth.test", {
    headers: { Authorization: `Bearer ${result.token}` },
  });
  const authData = await authTest.json();

  // Try conversations.list to see if channels:read works
  const listTest = await fetch(
    "https://slack.com/api/conversations.list?limit=1",
    { headers: { Authorization: `Bearer ${result.token}` } }
  );
  const listData = await listTest.json();

  // Try a scope check by looking at response headers
  return NextResponse.json({
    tokenExchange: {
      scope: result.scope,
      expiresIn: result.expiresIn,
      connection: result.connection,
    },
    authTest: {
      ok: authData.ok,
      error: authData.error,
      user: authData.user,
      team: authData.team,
    },
    conversationsList: {
      ok: listData.ok,
      error: listData.error,
      needed: listData.needed,
      provided: listData.provided,
    },
  });
}
