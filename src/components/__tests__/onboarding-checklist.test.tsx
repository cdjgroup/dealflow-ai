import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OnboardingChecklist } from "@/components/helpkit/OnboardingChecklist";
import { OnboardingProvider } from "@/components/helpkit/OnboardingProvider";

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Use real localStorage (jsdom provides it)

function renderChecklist() {
  return render(
    <OnboardingProvider userId="test-user">
      <OnboardingChecklist />
    </OnboardingProvider>
  );
}

describe("OnboardingChecklist", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders 8 onboarding steps (AC-4)", () => {
    renderChecklist();
    expect(screen.getByText("Getting Started")).toBeInTheDocument();
    expect(screen.getByText("Connect Google")).toBeInTheDocument();
    expect(screen.getByText("Connect Slack")).toBeInTheDocument();
    expect(screen.getByText("Try a chat command")).toBeInTheDocument();
    expect(screen.getByText("Check your pipeline")).toBeInTheDocument();
    expect(screen.getByText("Review permissions")).toBeInTheDocument();
    expect(screen.getByText("Explore MCP")).toBeInTheDocument();
    expect(screen.getByText("Set up scheduled actions")).toBeInTheDocument();
    expect(screen.getByText("Set up Guardian")).toBeInTheDocument();
  });

  it("shows 0 of 8 progress initially (AC-4)", () => {
    renderChecklist();
    expect(screen.getByText("0 of 8")).toBeInTheDocument();
  });

  it("can complete a step by clicking (AC-6)", async () => {
    const user = userEvent.setup();
    renderChecklist();
    const markBtn = screen.getByLabelText("Mark Connect Google as complete");
    await user.click(markBtn);
    expect(screen.getByText("1 of 8")).toBeInTheDocument();
  });

  it("can dismiss the checklist", async () => {
    const user = userEvent.setup();
    renderChecklist();
    const dismissBtn = screen.getByLabelText("Dismiss onboarding checklist");
    await user.click(dismissBtn);
    expect(screen.queryByText("Getting Started")).toBeNull();
  });

  it("can collapse and expand", async () => {
    const user = userEvent.setup();
    renderChecklist();
    // Steps visible initially
    expect(screen.getByText("Connect Google")).toBeInTheDocument();
    // Collapse
    const toggleBtn = screen.getByText("Getting Started");
    await user.click(toggleBtn);
    // Steps hidden
    expect(screen.queryByText("Connect Google")).toBeNull();
    // Expand
    await user.click(toggleBtn);
    expect(screen.getByText("Connect Google")).toBeInTheDocument();
  });
});
