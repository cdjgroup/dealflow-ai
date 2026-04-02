import { Auth0Client } from "@auth0/nextjs-auth0/server";

export const auth0 = new Auth0Client({
  appBaseUrl: process.env.APP_BASE_URL,
  domain: process.env.AUTH0_DOMAIN,
  clientId: process.env.AUTH0_CLIENT_ID,
  clientSecret: process.env.AUTH0_CLIENT_SECRET,
  secret: process.env.AUTH0_SECRET,
  authorizationParameters: {
    scope: "openid profile email offline_access",
    audience: `https://${process.env.AUTH0_DOMAIN}/me/`,
  },
  enableConnectAccountEndpoint: true,
});

export async function getRefreshToken(): Promise<string> {
  const session = await auth0.getSession();
  if (!session?.tokenSet?.refreshToken) {
    throw new Error("No refresh token available");
  }
  return session.tokenSet.refreshToken;
}

export async function getUser() {
  const session = await auth0.getSession();
  return session?.user ?? null;
}
