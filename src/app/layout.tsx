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
  title: "DealFlow — AI Sales Agent with Auth0 Token Vault",
  description:
    "AI sales agent that securely manages your pipeline, calendar, and emails using Auth0 Token Vault for delegated third-party access.",
  openGraph: {
    title: "DealFlow — AI Sales Agent with Auth0 Token Vault",
    description:
      "Your AI sales agent that acts on your behalf — with layered consent via Auth0 Token Vault. CIBA device approval, MCP tool server, and full audit trail.",
    siteName: "DealFlow",
    type: "website",
    url: "https://dealflow-ai-seven.vercel.app",
    images: [
      {
        url: "https://dealflow-ai-seven.vercel.app/og-image.png",
        width: 1200,
        height: 630,
        alt: "DealFlow — AI Sales Agent with Auth0 Token Vault",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "DealFlow — AI Sales Agent with Auth0 Token Vault",
    description:
      "AI sales agent with Auth0 Token Vault: CIBA device consent, MCP integration, scheduled actions, and full user control.",
    images: ["https://dealflow-ai-seven.vercel.app/og-image.png"],
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
