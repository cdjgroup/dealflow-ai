import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";

export async function middleware(request: NextRequest) {
  try {
    const authRes = await auth0.middleware(request);
    if (request.nextUrl.pathname.startsWith("/auth")) {
      return authRes;
    }

    const session = await auth0.getSession(request);
    if (!session && request.nextUrl.pathname.startsWith("/dashboard")) {
      return NextResponse.redirect(
        new URL("/auth/login?returnTo=/dashboard", request.url)
      );
    }

    return authRes;
  } catch (err) {
    // Clear corrupted session cookie and redirect to home
    if (
      err instanceof Error &&
      (err.message.includes("JWE") || err.message.includes("encrypted"))
    ) {
      const response = NextResponse.redirect(new URL("/", request.url));
      response.cookies.delete("appSession");
      response.cookies.delete("__session");
      // Auth0 v4 uses a cookie named after the client ID or "appSession"
      request.cookies.getAll().forEach((cookie) => {
        if (
          cookie.name.startsWith("appSession") ||
          cookie.name.startsWith("__session")
        ) {
          response.cookies.delete(cookie.name);
        }
      });
      return response;
    }
    throw err;
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
