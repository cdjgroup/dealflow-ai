// Auth0 AI Token Vault configuration
// We use direct token exchange (Auth0's federated connection grant, inspired by RFC 8693) instead of the @auth0/ai-vercel
// SDK wrapper for better error observability. The SDK swallows federated
// connection errors (see github.com/auth0/auth0-ai-js/issues/175), returning
// a misleading "Authorization required" interrupt instead of the actual Auth0
// API error. Direct calls let us surface real error messages to users.
// See src/lib/token-exchange.ts for the shared implementation.

export const TOKEN_VAULT_CONFIG = {
  connection: "google-oauth2",
  grantType:
    "urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token",
  subjectTokenType: "urn:ietf:params:oauth:token-type:refresh_token",
  requestedTokenType:
    "http://auth0.com/oauth/token-type/federated-connection-access-token",
} as const;
