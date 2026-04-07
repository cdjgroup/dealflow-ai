import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LandingAnimations } from "@/components/landing-animations";

// Mock framer-motion to render plain divs
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => {
      const { whileHover, transition, ...safeProps } = props as Record<string, unknown>;
      return <div {...safeProps}>{children}</div>;
    },
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock FadeIn to render children directly
vi.mock("../fade-in", () => ({
  FadeIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe("LandingAnimations", () => {
  it("renders hero headline and CTA", () => {
    render(<LandingAnimations />);
    expect(screen.getByText("Your rules.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /try the demo/i })).toBeInTheDocument();
  });

  it("renders trust spectrum with all four tiers", () => {
    render(<LandingAnimations />);
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.getByText("Chat")).toBeInTheDocument();
    expect(screen.getByText("Action Center")).toBeInTheDocument();
    expect(screen.getByText("CIBA + Guardian")).toBeInTheDocument();
  });

  it("renders metrics row", () => {
    render(<LandingAnimations />);
    expect(screen.getByText("16")).toBeInTheDocument();
    expect(screen.getByText("AI Tools")).toBeInTheDocument();
    expect(screen.getByText("Consent Tiers")).toBeInTheDocument();
    expect(screen.getByText("Stored Credentials")).toBeInTheDocument();
  });

  it("renders What Makes This Different section", () => {
    render(<LandingAnimations />);
    expect(screen.getByText("What Makes This Different")).toBeInTheDocument();
    expect(screen.getByText("CIBA Device Consent")).toBeInTheDocument();
    expect(screen.getByText("MCP Tool Server")).toBeInTheDocument();
    expect(screen.getByText("Scheduled Actions")).toBeInTheDocument();
    expect(screen.getByText("Direct Token Exchange")).toBeInTheDocument();
  });

  it("renders tech stack strip", () => {
    render(<LandingAnimations />);
    expect(screen.getByText("Auth0")).toBeInTheDocument();
    expect(screen.getByText("Claude")).toBeInTheDocument();
    expect(screen.getByText("Vercel")).toBeInTheDocument();
  });

  it("renders demo credentials for judges", () => {
    render(<LandingAnimations />);
    expect(screen.getByText("judge@dealflow-demo.com")).toBeInTheDocument();
  });
});
