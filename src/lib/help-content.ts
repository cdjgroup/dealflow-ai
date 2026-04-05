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
  {
    id: "explore-mcp",
    label: "Explore MCP",
    description:
      "See how external AI agents connect to your tools via Model Context Protocol",
    ctaLink: "/dashboard/mcp",
  },
  {
    id: "configure-schedule",
    label: "Set up scheduled actions",
    description:
      "Choose review times for batch AI action execution with CIBA consent",
    ctaLink: "/dashboard/actions",
  },
  {
    id: "setup-guardian",
    label: "Set up Guardian",
    description:
      "Install Auth0 Guardian on your phone for device-level CIBA approval",
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
  {
    section: "Standards & Compliance",
    items: [
      {
        label: "Model Context Protocol Spec",
        href: "https://modelcontextprotocol.io/specification",
      },
      {
        label: "CIBA (OpenID Connect)",
        href: "https://openid.net/specs/openid-client-initiated-backchannel-authentication-core-1_0.html",
      },
      {
        label: "IETF AI Agent Auth Draft",
        href: "https://datatracker.ietf.org/doc/draft-klrc-aiagent-auth-01/",
      },
      {
        label: "EU AI Act Article 14 — Human Oversight",
        href: "https://artificialintelligenceact.eu/article/14/",
      },
    ],
  },
];
