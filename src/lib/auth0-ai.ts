// Auth0 AI Token Vault configuration
// We use direct token exchange (RFC 8693) instead of the @auth0/ai-vercel
// SDK wrapper due to compatibility issues between @auth0/ai-vercel v5 and AI SDK v6.
// The direct approach calls Auth0's /oauth/token endpoint with the federated
// connection access token grant type. See src/lib/tools/calendar.ts for the pattern.

export const TOKEN_VAULT_CONFIG = {
  connection: "google-oauth2",
  grantType:
    "urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token",
  subjectTokenType: "urn:ietf:params:oauth:token-type:refresh_token",
  requestedTokenType:
    "http://auth0.com/oauth/token-type/federated-connection-access-token",
} as const;
