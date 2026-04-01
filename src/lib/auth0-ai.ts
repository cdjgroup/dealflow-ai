import { Auth0AI } from "@auth0/ai-vercel";
import { UpstashStore } from "@/lib/stores/upstash-store";
import { getRefreshToken } from "@/lib/auth0";

const store = new UpstashStore();

export const auth0AI = new Auth0AI({ store });

export const withGoogleCalendar = auth0AI.withTokenVault({
  refreshToken: getRefreshToken,
  connection: "google-oauth2",
  scopes: [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.freebusy",
  ],
});

export const withGmail = auth0AI.withTokenVault({
  refreshToken: getRefreshToken,
  connection: "google-oauth2",
  scopes: [
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.readonly",
  ],
});
