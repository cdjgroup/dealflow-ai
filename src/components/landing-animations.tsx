"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { FadeIn } from "./fade-in";

const features = [
  {
    title: "Calendar",
    desc: "Check your availability via Google Calendar",
    icon: "📅",
  },
  {
    title: "Email",
    desc: "Draft follow-ups in Gmail — never auto-sends",
    icon: "✉️",
  },
  {
    title: "Slack",
    desc: "Send team updates and list channels",
    icon: "💬",
  },
  {
    title: "Pipeline",
    desc: "Manage deals, contacts, and activities",
    icon: "📊",
  },
  {
    title: "Security",
    desc: "Capability toggles, step-up auth, audit trail",
    icon: "🛡️",
  },
  {
    title: "Control",
    desc: "You decide what the agent can do — and revoke anytime",
    icon: "🎛️",
  },
];

export function LandingAnimations() {
  return (
    <>
      <FadeIn delay={0}>
        <div className="inline-flex items-center gap-2 bg-accent/10 border border-accent/20 rounded-full px-4 py-1.5 text-sm text-accent mb-6">
          <span className="w-2 h-2 bg-accent rounded-full animate-pulse" />
          Powered by Auth0 Token Vault
        </div>
      </FadeIn>

      <FadeIn delay={0.1}>
        <h1 className="text-6xl sm:text-7xl font-bold mb-4 tracking-tighter">
          <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            DealFlow AI
          </span>
        </h1>
      </FadeIn>

      <FadeIn delay={0.2}>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
          Your AI sales agent that checks calendars, drafts emails, sends Slack
          updates, and manages your pipeline — with layered security and full
          user control via Auth0 Token Vault.
        </p>
      </FadeIn>

      <FadeIn delay={0.3}>
        <Link
          href="/auth/login?returnTo=/dashboard"
          className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 py-3 rounded-lg text-lg transition-all shadow-[0_0_24px_rgba(99,102,241,0.25)] hover:shadow-[0_0_32px_rgba(99,102,241,0.4)]"
        >
          Sign In to Get Started
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
      </FadeIn>

      {/* Token Vault Architecture Diagram */}
      <FadeIn delay={0.4}>
        <div className="mt-12 mb-10 rounded-xl border border-border bg-card/80 backdrop-blur-sm p-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            How Token Vault Works
          </h2>
          <div className="flex items-center justify-center gap-2 sm:gap-4 text-xs sm:text-sm flex-wrap">
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
              className="bg-card/80 backdrop-blur-sm border border-border rounded-lg p-4 hover:border-primary/30 transition-colors"
            >
              <div className="text-lg mb-1.5" aria-hidden="true">{feature.icon}</div>
              <h3 className="text-foreground font-semibold mb-1">
                {feature.title}
              </h3>
              <p className="text-sm text-muted-foreground">{feature.desc}</p>
            </motion.div>
          </FadeIn>
        ))}
      </div>

      {/* How It Works */}
      <FadeIn delay={0.9}>
        <div className="mt-12 rounded-xl border border-border bg-card/80 backdrop-blur-sm p-6 text-left">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            How It Works
          </h2>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">1</span>
              <p>
                When the agent needs to access Google or Slack, it requests a
                token from Auth0 Token Vault using your refresh token.
              </p>
            </div>
            <div className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">2</span>
              <p>
                If you haven&apos;t connected the service yet, a consent popup
                appears asking you to authorize specific scopes.
              </p>
            </div>
            <div className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">3</span>
              <p>
                Auth0 stores the OAuth tokens securely. The agent only receives
                short-lived access tokens, never your credentials.
              </p>
            </div>
            <div className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">4</span>
              <p>
                External actions (emails, Slack messages) always require your
                approval. High-value CRM operations trigger step-up
                authorization. Every action is logged in the audit trail.
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
            {[
              {
                title: "Zero Stored Credentials",
                desc: "The AI agent never sees or stores your passwords. Auth0 Token Vault issues short-lived tokens that expire automatically.",
                icon: "🔒",
              },
              {
                title: "Granular Permissions",
                desc: "Toggle each tool on or off. Disable calendar access, email drafts, or Slack messaging independently — changes take effect instantly.",
                icon: "🎛️",
              },
              {
                title: "Step-Up Authorization",
                desc: "High-value actions (deals over $50K, closing deals) require explicit approval before the agent can proceed.",
                icon: "🛡️",
              },
              {
                title: "Full Audit Trail",
                desc: "Every tool call is logged with timestamps, parameters, and results. Review the agent's activity at any time.",
                icon: "📋",
              },
            ].map((item) => (
              <motion.div
                key={item.title}
                whileHover={{ scale: 1.02 }}
                transition={{ duration: 0.2 }}
                className="bg-card/80 backdrop-blur-sm border border-border rounded-lg p-4 hover:border-accent/30 transition-colors"
              >
                <div className="text-lg mb-1.5" aria-hidden="true">{item.icon}</div>
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
      <path d="M0 8h20m0 0l-5-5m5 5l-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
