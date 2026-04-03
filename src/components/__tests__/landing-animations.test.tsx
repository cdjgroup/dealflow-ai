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
  it("renders existing hero content (AC-5)", () => {
    render(<LandingAnimations />);
    expect(screen.getByText("DealFlow AI")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in/i })).toBeInTheDocument();
  });

  it("renders all 6 feature cards (AC-5)", () => {
    render(<LandingAnimations />);
    expect(screen.getByText("Calendar")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Slack")).toBeInTheDocument();
    expect(screen.getByText("Pipeline")).toBeInTheDocument();
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("Control")).toBeInTheDocument();
  });

  it("renders How It Works section (AC-3)", () => {
    render(<LandingAnimations />);
    expect(screen.getByText("How It Works")).toBeInTheDocument();
    // 4 steps should be present
    expect(screen.getByText(/requests a token/i)).toBeInTheDocument();
    expect(screen.getByText(/consent popup/i)).toBeInTheDocument();
    expect(screen.getByText(/stores the OAuth tokens/i)).toBeInTheDocument();
    expect(screen.getByText(/require your\s+approval/i)).toBeInTheDocument();
  });

  it("renders security highlights section (AC-4)", () => {
    render(<LandingAnimations />);
    expect(screen.getByText(/built for security/i)).toBeInTheDocument();
  });

  it("preserves architecture diagram (AC-5)", () => {
    render(<LandingAnimations />);
    expect(screen.getByText(/how token vault works/i)).toBeInTheDocument();
  });
});
