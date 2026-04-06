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

  it("renders schedule time checkboxes", () => {
    render(<SchedulePanel initialSchedule={defaultSchedule} />);

    expect(screen.getByText("8:00 AM")).toBeInTheDocument();
    expect(screen.getByText("12:00 PM")).toBeInTheDocument();
    expect(screen.getByText("5:00 PM")).toBeInTheDocument();
  });

  it("shows Active badge when schedule is enabled", () => {
    render(<SchedulePanel initialSchedule={{ enabled: true, hours: [8], timezone: "UTC" }} />);

    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("toggling a checkbox saves schedule to API", async () => {
    render(<SchedulePanel initialSchedule={defaultSchedule} />);

    fireEvent.click(screen.getByText("8:00 AM"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/settings", expect.objectContaining({
        method: "PUT",
      }));
    });
  });

  it("does not render autonomy or confidence controls (moved to Permissions)", () => {
    render(<SchedulePanel initialSchedule={defaultSchedule} />);

    expect(screen.queryByText("AI Autonomy Level")).not.toBeInTheDocument();
    expect(screen.queryByText("Confidence Routing")).not.toBeInTheDocument();
    expect(screen.queryByText("Suggest Only")).not.toBeInTheDocument();
  });
});
