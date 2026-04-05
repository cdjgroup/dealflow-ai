import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DealFlow AI — AI Sales Agent with Auth0 Token Vault",
  description:
    "AI sales agent that securely manages your pipeline, calendar, and emails using Auth0 Token Vault for delegated third-party access.",
  openGraph: {
    title: "DealFlow AI — AI Sales Agent with Auth0 Token Vault",
    description:
      "Your AI sales agent that acts on your behalf — with layered consent via Auth0 Token Vault. CIBA device approval, MCP tool server, and full audit trail.",
    siteName: "DealFlow AI",
    type: "website",
    url: "https://dealflow-ai-seven.vercel.app",
  },
  twitter: {
    card: "summary_large_image",
    title: "DealFlow AI — AI Sales Agent with Auth0 Token Vault",
    description:
      "AI sales agent with Auth0 Token Vault: CIBA device consent, MCP integration, scheduled actions, and full user control.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
