import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SchedulePanel } from "@/components/schedule-panel";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

const defaultSchedule = { enabled: false, hours: [], timezone: "UTC" };

describe("SchedulePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
  });

  it("AC-8: renders all three autonomy level buttons", () => {
    render(<SchedulePanel initialSchedule={defaultSchedule} initialAutonomyLevel={1} />);

    expect(screen.getByText("Suggest Only")).toBeInTheDocument();
    expect(screen.getByText("Auto-Approve")).toBeInTheDocument();
    expect(screen.getByText("Full Autonomous")).toBeInTheDocument();
  });

  it("AC-8: highlights the active autonomy level", () => {
    render(<SchedulePanel initialSchedule={defaultSchedule} initialAutonomyLevel={2} />);

    const autoApproveBtn = screen.getByText("Auto-Approve").closest("button")!;
    expect(autoApproveBtn.className).toContain("bg-amber-500");
  });

  it("AC-7: clicking a level saves to settings API", async () => {
    render(<SchedulePanel initialSchedule={defaultSchedule} initialAutonomyLevel={1} />);

    fireEvent.click(screen.getByText("Auto-Approve"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/settings", expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ autonomyLevel: 2 }),
      }));
    });
  });

  it("AC-9: clicking level 3 shows confirmation dialog", () => {
    render(<SchedulePanel initialSchedule={defaultSchedule} initialAutonomyLevel={1} />);

    fireEvent.click(screen.getByText("Full Autonomous"));

    expect(screen.getByText("Enable Full Autonomous Mode?")).toBeInTheDocument();
    expect(screen.getByText("Yes, enable")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("AC-9: confirming dialog saves level 3", async () => {
    render(<SchedulePanel initialSchedule={defaultSchedule} initialAutonomyLevel={1} />);

    fireEvent.click(screen.getByText("Full Autonomous"));
    fireEvent.click(screen.getByText("Yes, enable"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/settings", expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ autonomyLevel: 3 }),
      }));
    });
  });

  it("AC-9: canceling dialog does not change level", async () => {
    render(<SchedulePanel initialSchedule={defaultSchedule} initialAutonomyLevel={1} />);

    fireEvent.click(screen.getByText("Full Autonomous"));
    fireEvent.click(screen.getByText("Cancel"));

    // Dialog should close
    expect(screen.queryByText("Enable Full Autonomous Mode?")).not.toBeInTheDocument();
    // No API call for autonomy level
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("renders schedule time checkboxes", () => {
    render(<SchedulePanel initialSchedule={defaultSchedule} initialAutonomyLevel={1} />);

    expect(screen.getByText("8:00 AM")).toBeInTheDocument();
    expect(screen.getByText("12:00 PM")).toBeInTheDocument();
    expect(screen.getByText("5:00 PM")).toBeInTheDocument();
  });

  it("shows contextual description for level 3", () => {
    render(<SchedulePanel initialSchedule={{ enabled: true, hours: [8], timezone: "UTC" }} initialAutonomyLevel={3} />);

    expect(screen.getByText(/routine actions auto-execute/i)).toBeInTheDocument();
  });
});
