"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { FadeIn } from "./fade-in";
import {
  Calendar,
  Mail,
  MessageSquare,
  BarChart3,
  Shield,
  SlidersHorizontal,
  Smartphone,
  Bot,
  Clock,
  Lock,
  ToggleRight,
  ShieldCheck,
  ClipboardList,
  Workflow,
} from "lucide-react";

const features = [
  {
    title: "Calendar",
    desc: "Check availability and create events via Google Calendar — the agent requests access through Token Vault each time.",
    icon: Calendar,
  },
  {
    title: "Email",
    desc: "Draft follow-ups in Gmail with full context from your pipeline. Drafts are never auto-sent — you review first.",
    icon: Mail,
  },
  {
    title: "Slack",
    desc: "Post deal updates to team channels and search conversations. Token Vault scopes limit which channels the agent can access.",
    icon: MessageSquare,
  },
  {
    title: "Pipeline",
    desc: "Manage deals, contacts, and activities in a built-in CRM. The agent logs every interaction automatically.",
    icon: BarChart3,
  },
  {
    title: "Security",
    desc: "Capability toggles, step-up auth for high-value actions, and a complete audit trail of every agent operation.",
    icon: Shield,
  },
  {
    title: "Control",
    desc: "You decide what the agent can do — toggle tools on or off, revoke OAuth connections, and review all activity.",
    icon: SlidersHorizontal,
  },
];

const differentiators = [
  {
    title: "CIBA Device Consent",
    desc: "High-value actions (deals over $50K, closing deals) trigger Auth0 Guardian push notifications to your phone. The agent waits for your tap before proceeding — real device-level consent, not just a dialog box.",
    icon: Smartphone,
  },
  {
    title: "MCP Tool Server",
    desc: "External AI agents can call DealFlow tools through the Model Context Protocol. Read operations are autonomous; write operations require CIBA phone approval first.",
    icon: Bot,
  },
  {
    title: "Scheduled Actions",
    desc: "Opt into autonomous batch execution at 8am, 12pm, or 5pm. One Guardian push approves all pending actions — the agent executes within a time-boxed token window.",
    icon: Clock,
  },
  {
    title: "Trust Spectrum",
    desc: "Four trust tiers from autonomous reads to phone-approved writes: Read (autonomous) → Chat (medium) → Action Center (review) → Write+CIBA (high trust).",
    icon: Workflow,
  },
];

const securityHighlights = [
  {
    title: "Zero Stored Credentials",
    desc: "The AI agent never sees or stores your passwords. Auth0 Token Vault issues short-lived tokens that expire automatically.",
    icon: Lock,
  },
  {
    title: "Granular Permissions",
    desc: "Toggle each tool on or off. Disable calendar access, email drafts, or Slack messaging independently — changes take effect instantly.",
    icon: ToggleRight,
  },
  {
    title: "Step-Up Authorization",
    desc: "High-value actions (deals over $50K, closing deals) require explicit approval before the agent can proceed.",
    icon: ShieldCheck,
  },
  {
    title: "Full Audit Trail",
    desc: "Every tool call is logged with timestamps, parameters, and results. Review the agent's activity at any time.",
    icon: ClipboardList,
  },
];

export function LandingAnimations() {
  return (
    <>
      {/* Hero Badge */}
      <FadeIn delay={0}>
        <div className="inline-flex items-center gap-2 bg-accent/10 border border-accent/20 rounded-full px-4 py-1.5 text-sm text-accent mb-6">
          <span className="w-2 h-2 bg-accent rounded-full animate-pulse" />
          Powered by Auth0 Token Vault
        </div>
      </FadeIn>

      {/* Title */}
      <FadeIn delay={0.1}>
        <h1 className="text-6xl sm:text-7xl font-bold mb-4 tracking-tighter">
          <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            DealFlow AI
          </span>
        </h1>
      </FadeIn>

      {/* Hero Copy — lead with security differentiator */}
      <FadeIn delay={0.2}>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
          The AI sales agent that acts on your behalf — but only with your
          permission. Auth0 Token Vault ensures the agent never sees your
          credentials, while layered consent gives you full control over
          calendars, email, Slack, and your deal pipeline.
        </p>
      </FadeIn>

      {/* CTAs */}
      <FadeIn delay={0.3}>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/auth/login?returnTo=/dashboard"
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 py-3 rounded-lg text-lg transition-all shadow-[0_0_24px_rgba(99,102,241,0.25)] hover:shadow-[0_0_32px_rgba(99,102,241,0.4)]"
          >
            Try the Demo
            <svg
              aria-hidden="true"
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex items-center gap-2 border border-border hover:border-primary/30 text-muted-foreground hover:text-foreground font-medium px-6 py-3 rounded-lg text-lg transition-all"
          >
            See How It Works
          </a>
        </div>
      </FadeIn>

      {/* Token Vault Architecture Diagram */}
      <FadeIn delay={0.4}>
        <div className="mt-12 mb-10 rounded-xl border border-border bg-card/80 backdrop-blur-sm p-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            How Token Vault Works
          </h2>
          <div className="flex items-center justify-center gap-2 sm:gap-4 text-xs sm:text-sm overflow-x-auto pb-2">
            <div className="flex flex-col items-center gap-1">
              <div className="w-12 h-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-lg">
                👤
              </div>
              <span className="text-muted-foreground">User</span>
            </div>
            <Arrow />
            <div className="flex flex-col items-center gap-1">
              <div className="w-12 h-12 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-lg">
                🔐
              </div>
              <span className="text-muted-foreground">Auth0</span>
            </div>
            <Arrow />
            <div className="flex flex-col items-center gap-1">
              <div className="w-12 h-12 rounded-lg bg-chart-4/10 border border-chart-4/20 flex items-center justify-center text-lg">
                🏦
              </div>
              <span className="text-muted-foreground">Token Vault</span>
            </div>
            <Arrow />
            <div className="flex flex-col items-center gap-1">
              <div className="w-12 h-12 rounded-lg bg-chart-5/10 border border-chart-5/20 flex items-center justify-center text-lg">
                🤖
              </div>
              <span className="text-muted-foreground">AI Agent</span>
            </div>
            <Arrow />
            <div className="flex flex-col items-center gap-1">
              <div className="w-12 h-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-lg">
                🌐
              </div>
              <span className="text-muted-foreground">Google / Slack</span>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground/60 mt-3">
            Short-lived tokens only — the AI agent never stores long-term
            credentials
          </p>
        </div>
      </FadeIn>

      {/* Feature Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-left">
        {features.map((feature, i) => (
          <FadeIn key={feature.title} delay={0.5 + i * 0.07}>
            <motion.div
              whileHover={{ scale: 1.03, y: -2 }}
              transition={{ duration: 0.2 }}
              className="bg-card/80 backdrop-blur-sm border border-border rounded-lg p-4 hover:border-primary/30 transition-colors h-full"
            >
              <feature.icon
                className="w-5 h-5 text-primary mb-2"
                aria-hidden="true"
              />
              <h3 className="text-foreground font-semibold mb-1">
                {feature.title}
              </h3>
              <p className="text-sm text-muted-foreground">{feature.desc}</p>
            </motion.div>
          </FadeIn>
        ))}
      </div>

      {/* What Makes This Different — MCP + CIBA + Scheduled Actions */}
      <FadeIn delay={0.8}>
        <div className="mt-12 text-left" id="differentiators">
          <h2 className="text-lg font-semibold text-foreground mb-2">
            What Makes This Different
          </h2>
          <p className="text-sm text-muted-foreground mb-4 max-w-2xl">
            Most AI demos stop at &quot;connect your account.&quot; DealFlow AI
            goes further with device-level consent, external agent support, and
            autonomous scheduled execution — all gated by Auth0.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {differentiators.map((item) => (
              <motion.div
                key={item.title}
                whileHover={{ scale: 1.02 }}
                transition={{ duration: 0.2 }}
                className="bg-card/80 backdrop-blur-sm border border-accent/20 rounded-lg p-4 hover:border-accent/40 transition-colors"
              >
                <item.icon
                  className="w-5 h-5 text-accent mb-2"
                  aria-hidden="true"
                />
                <h3 className="text-foreground font-semibold mb-1">
                  {item.title}
                </h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </FadeIn>

      {/* How It Works */}
      <FadeIn delay={0.9}>
        <div
          id="how-it-works"
          className="mt-12 rounded-xl border border-border bg-card/80 backdrop-blur-sm p-6 text-left scroll-mt-8"
        >
          <h2 className="text-lg font-semibold text-foreground mb-4">
            How It Works
          </h2>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">
                1
              </span>
              <p>
                When the agent needs to access Google or Slack, it requests a
                token from Auth0 Token Vault using your refresh token.
              </p>
            </div>
            <div className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">
                2
              </span>
              <p>
                If you haven&apos;t connected the service yet, a consent popup
                appears asking you to authorize specific scopes.
              </p>
            </div>
            <div className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">
                3
              </span>
              <p>
                Auth0 stores the OAuth tokens securely. The agent only receives
                short-lived access tokens, never your credentials.
              </p>
            </div>
            <div className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">
                4
              </span>
              <p>
                External actions (emails, Slack messages) always require your
                approval. High-value CRM operations trigger step-up
                authorization via Guardian push. Every action is logged.
              </p>
            </div>
          </div>
        </div>
      </FadeIn>

      {/* Security Highlights */}
      <FadeIn delay={1.0}>
        <div className="mt-8 mb-4 text-left">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Built for Security
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {securityHighlights.map((item) => (
              <motion.div
                key={item.title}
                whileHover={{ scale: 1.02 }}
                transition={{ duration: 0.2 }}
                className="bg-card/80 backdrop-blur-sm border border-border rounded-lg p-4 hover:border-accent/30 transition-colors"
              >
                <item.icon
                  className="w-5 h-5 text-accent mb-2"
                  aria-hidden="true"
                />
                <h3 className="text-foreground font-semibold mb-1">
                  {item.title}
                </h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </FadeIn>
    </>
  );
}

function Arrow() {
  return (
    <svg
      aria-hidden="true"
      className="w-6 h-4 text-muted-foreground/40 shrink-0"
      viewBox="0 0 24 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        d="M0 8h20m0 0l-5-5m5 5l-5 5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
