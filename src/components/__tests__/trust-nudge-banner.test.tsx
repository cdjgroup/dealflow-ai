import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TrustNudgeBanner } from "../trust-nudge-banner";
import type { TrustNudge } from "@/lib/trust-graduation";

const sampleNudge: TrustNudge = {
  tool: "draftEmail",
  actionType: "email",
  currentTrust: "ask",
  suggestedTrust: "always",
  stats: { approved: 5, dismissed: 0 },
};

describe("TrustNudgeBanner", () => {
  it("renders nothing when nudge is null", () => {
    const { container } = render(
      <TrustNudgeBanner nudge={null} onAccept={vi.fn()} onDismiss={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders banner with stats when nudge is provided", () => {
    render(
      <TrustNudgeBanner nudge={sampleNudge} onAccept={vi.fn()} onDismiss={vi.fn()} />
    );
    expect(screen.getByText(/approved 5 of 5/i)).toBeDefined();
    expect(screen.getByText("Auto-approve")).toBeDefined();
    expect(screen.getByText("Not now")).toBeDefined();
  });

  it("AC-5: calls onAccept with nudge when Auto-approve clicked", async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    render(
      <TrustNudgeBanner nudge={sampleNudge} onAccept={onAccept} onDismiss={vi.fn()} />
    );
    await user.click(screen.getByText("Auto-approve"));
    expect(onAccept).toHaveBeenCalledWith(sampleNudge);
  });

  it("AC-6: calls onDismiss when Not now clicked", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <TrustNudgeBanner nudge={sampleNudge} onAccept={vi.fn()} onDismiss={onDismiss} />
    );
    await user.click(screen.getByText("Not now"));
    expect(onDismiss).toHaveBeenCalled();
  });

  it("renders with role=status for accessibility", () => {
    render(
      <TrustNudgeBanner nudge={sampleNudge} onAccept={vi.fn()} onDismiss={vi.fn()} />
    );
    expect(screen.getByRole("status")).toBeDefined();
  });

  it("falls back to tool name when no label mapping exists", () => {
    const unknownNudge: TrustNudge = {
      ...sampleNudge,
      tool: "someNewTool",
    };
    render(
      <TrustNudgeBanner nudge={unknownNudge} onAccept={vi.fn()} onDismiss={vi.fn()} />
    );
    expect(screen.getByText(/somenewtool/i)).toBeDefined();
  });

  it("shows correct label for different tool types", () => {
    const slackNudge: TrustNudge = {
      ...sampleNudge,
      tool: "sendSlackMessage",
      actionType: "slack",
      stats: { approved: 8, dismissed: 1 },
    };
    render(
      <TrustNudgeBanner nudge={slackNudge} onAccept={vi.fn()} onDismiss={vi.fn()} />
    );
    expect(screen.getByText(/approved 8 of 9/i)).toBeDefined();
    expect(screen.getByText(/slack messages/i)).toBeDefined();
  });
});
