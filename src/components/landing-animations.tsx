"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { FadeIn } from "./fade-in";
import {
  Smartphone,
  Bot,
  Clock,
  Lock,
} from "lucide-react";

const trustTiers = [
  {
    icon: "\u{1F50D}",
    name: "Read",
    mechanism: "Autonomous\nToken Vault exchange",
    barWidth: "25%",
    barColor: "#4ade80",
  },
  {
    icon: "\u{1F4AC}",
    name: "Chat",
    mechanism: "Inline confirmation\nbefore execution",
    barWidth: "50%",
    barColor: "#facc15",
  },
  {
    icon: "\u2611",
    name: "Action Center",
    mechanism: "Review queue\nbatch approve",
    barWidth: "75%",
    barColor: "#fb923c",
  },
  {
    icon: "\u{1F4F1}",
    name: "CIBA + Guardian",
    mechanism: "Phone push approval\ndeals >$50K",
    barWidth: "100%",
    barColor: "#f87171",
  },
];

const metrics = [
  { number: "15", label: "AI Tools" },
  { number: "4", label: "Consent Tiers" },
  { number: "2", label: "OAuth Providers" },
  { number: "0", label: "Stored Credentials" },
];

const techStack = [
  { abbr: "A0", name: "Auth0" },
  { abbr: "Cl", name: "Claude" },
  { abbr: "N", name: "Next.js" },
  { abbr: "V", name: "Vercel" },
  { abbr: "U", name: "Upstash" },
];

const differentiators = [
  {
    title: "CIBA Device Consent",
    desc: "High-value actions trigger Auth0 Guardian push to your phone. The agent blocks until you tap approve — real device-level consent, not a dialog.",
    icon: Smartphone,
  },
  {
    title: "MCP Tool Server",
    desc: "External AI agents call DealFlow tools via Model Context Protocol. Reads are autonomous; writes require CIBA phone approval first.",
    icon: Bot,
  },
  {
    title: "Scheduled Actions",
    desc: "Opt into 8am/12pm/5pm batch execution. One Guardian push approves all pending actions — agent executes within a time-boxed token window.",
    icon: Clock,
  },
  {
    title: "Direct Token Exchange",
    desc: "Bypassed the @auth0/ai-vercel SDK wrapper to call /oauth/token directly — full error observability and richer token metadata.",
    icon: Lock,
  },
];

export function LandingAnimations() {
  return (
    <>
      {/* Hero Badge */}
      <FadeIn delay={0}>
        <div className="inline-flex items-center gap-2 bg-accent/10 border border-accent/20 rounded-full px-4 py-1.5 text-sm text-accent mb-6">
          <span className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
          Auth0 &ldquo;Authorized to Act&rdquo; Hackathon
        </div>
      </FadeIn>

      {/* Title */}
      <FadeIn delay={0.1}>
        <h1 className="text-6xl sm:text-7xl font-bold mb-4 tracking-tighter leading-[1.05]">
          Your AI agent.
          <br />
          <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Your rules.
          </span>
        </h1>
      </FadeIn>

      {/* Subtitle */}
      <FadeIn delay={0.2}>
        <p className="text-xl text-muted-foreground mb-7 max-w-[580px] mx-auto leading-relaxed">
          DealFlow manages your pipeline, drafts emails, and books meetings —
          with{" "}
          <span className="text-foreground font-semibold">
            four tiers of authorization
          </span>{" "}
          from autonomous reads to device-level CIBA approval via Auth0 Token
          Vault.
        </p>
      </FadeIn>

      {/* CTA */}
      <FadeIn delay={0.3}>
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
        <p className="mt-3 text-xs text-muted-foreground">
          Demo account:{" "}
          <code className="bg-primary/10 text-primary px-2 py-0.5 rounded text-[11px] font-mono">
            judge@dealflow-demo.com
          </code>{" "}
          /{" "}
          <code className="bg-primary/10 text-primary px-2 py-0.5 rounded text-[11px] font-mono">
            DealFlow2026!
          </code>
        </p>
      </FadeIn>

      {/* Trust Spectrum */}
      <FadeIn delay={0.4}>
        <div className="mt-10 mb-6 rounded-xl border border-border bg-card/80 backdrop-blur-sm p-6 max-w-[720px] mx-auto">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[1.2px] mb-5">
            Consent Model — Every Action at the Right Trust Level
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {trustTiers.map((tier) => (
              <motion.div
                key={tier.name}
                whileHover={{ scale: 1.03, y: -2 }}
                transition={{ duration: 0.2 }}
                className="text-center p-3 sm:p-4 rounded-xl border border-border hover:border-primary/30 transition-colors"
              >
                <span className="text-2xl block mb-1">{tier.icon}</span>
                <div className="text-xs font-bold text-foreground mb-1">
                  {tier.name}
                </div>
                <div className="text-[10px] text-muted-foreground leading-tight whitespace-pre-line">
                  {tier.mechanism}
                </div>
                <div
                  className="h-[3px] rounded-full mt-3 mx-auto"
                  style={{
                    width: tier.barWidth,
                    background: tier.barColor,
                  }}
                />
              </motion.div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-4 px-1">
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">
              Low risk
            </span>
            <div
              className="flex-1 h-px mx-3 opacity-50"
              style={{
                background:
                  "linear-gradient(90deg, #4ade80, #facc15, #fb923c, #f87171)",
              }}
            />
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">
              High value
            </span>
          </div>
        </div>
      </FadeIn>

      {/* Metrics */}
      <FadeIn delay={0.5}>
        <div className="flex justify-center gap-10 flex-wrap mb-6">
          {metrics.map((m) => (
            <div key={m.label} className="text-center">
              <div className="text-[28px] font-extrabold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                {m.number}
              </div>
              <div className="text-[11px] text-muted-foreground font-medium">
                {m.label}
              </div>
            </div>
          ))}
        </div>
      </FadeIn>

      {/* Tech Strip */}
      <FadeIn delay={0.55}>
        <div className="flex items-center justify-center gap-6 pt-6 border-t border-border">
          {techStack.map((t) => (
            <div
              key={t.name}
              className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium"
            >
              <span className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center text-[9px] font-extrabold text-primary">
                {t.abbr}
              </span>
              {t.name}
            </div>
          ))}
        </div>
      </FadeIn>

      {/* What Makes This Different */}
      <FadeIn delay={0.7}>
        <div className="mt-12 text-left" id="differentiators">
          <h2 className="text-lg font-semibold text-foreground mb-2">
            What Makes This Different
          </h2>
          <p className="text-sm text-muted-foreground mb-4 max-w-[520px]">
            Beyond basic Token Vault integration — DealFlow pushes into CIBA,
            MCP, and autonomous scheduling.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {differentiators.map((item) => (
              <motion.div
                key={item.title}
                whileHover={{ scale: 1.02 }}
                transition={{ duration: 0.2 }}
                className="bg-card/80 backdrop-blur-sm border border-accent/20 rounded-xl p-4 hover:border-accent/40 transition-colors"
              >
                <item.icon
                  className="w-5 h-5 text-accent mb-2"
                  aria-hidden="true"
                />
                <h3 className="text-foreground font-semibold mb-1">
                  {item.title}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {item.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </FadeIn>
    </>
  );
}
