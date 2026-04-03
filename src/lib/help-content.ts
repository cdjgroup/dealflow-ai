export interface OnboardingStep {
  id: string;
  label: string;
  description: string;
  ctaLink?: string;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "connect-google",
    label: "Connect Google",
    description: "Link your Google account for calendar and email access",
    ctaLink: "/dashboard/permissions",
  },
  {
    id: "connect-slack",
    label: "Connect Slack",
    description: "Enable team communication through Slack integration",
    ctaLink: "/dashboard/permissions",
  },
  {
    id: "try-chat",
    label: "Try a chat command",
    description: "Ask DealFlow AI about your deals or calendar",
    ctaLink: "/dashboard",
  },
  {
    id: "check-pipeline",
    label: "Check your pipeline",
    description: "Review your deal pipeline and metrics",
    ctaLink: "/dashboard",
  },
  {
    id: "review-permissions",
    label: "Review permissions",
    description: "Configure which tools DealFlow AI can use",
    ctaLink: "/dashboard/permissions",
  },
];

export interface ResourceLink {
  label: string;
  href: string;
}

export const RESOURCE_LINKS: { section: string; items: ResourceLink[] }[] = [
  {
    section: "Understanding DealFlow AI",
    items: [
      {
        label: "Auth0 Token Vault Docs",
        href: "https://auth0.com/docs/secure/tokens/token-vault",
      },
      {
        label: "OAuth 2.0 Token Exchange (RFC 8693)",
        href: "https://datatracker.ietf.org/doc/html/rfc8693",
      },
      {
        label: "AI SDK Documentation",
        href: "https://ai-sdk.dev/docs/introduction",
      },
    ],
  },
  {
    section: "Quick Actions",
    items: [
      { label: "Manage Permissions", href: "/dashboard/permissions" },
      { label: "View Audit Log", href: "/dashboard/audit" },
    ],
  },
];
