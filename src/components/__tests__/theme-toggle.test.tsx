import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "@/components/theme-toggle";

const mockSetTheme = vi.fn();
let mockTheme = "system";

vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: mockTheme,
    setTheme: mockSetTheme,
    resolvedTheme: mockTheme === "system" ? "dark" : mockTheme,
  }),
}));

function getToggleGroup() {
  const groups = screen.getAllByRole("radiogroup", { name: "Theme selection" });
  return groups[groups.length - 1];
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    mockTheme = "system";
    mockSetTheme.mockClear();
  });

  it("renders three theme options", () => {
    render(<ThemeToggle />);
    const group = getToggleGroup();
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(within(group).getByRole("radio", { name: "Light" })).toBeInTheDocument();
    expect(within(group).getByRole("radio", { name: "Dark" })).toBeInTheDocument();
    expect(within(group).getByRole("radio", { name: "System" })).toBeInTheDocument();
  });

  it("calls setTheme when clicking a theme option", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const group = getToggleGroup();

    await user.click(within(group).getByRole("radio", { name: "Dark" }));
    expect(mockSetTheme).toHaveBeenCalledWith("dark");

    await user.click(within(group).getByRole("radio", { name: "Light" }));
    expect(mockSetTheme).toHaveBeenCalledWith("light");

    await user.click(within(group).getByRole("radio", { name: "System" }));
    expect(mockSetTheme).toHaveBeenCalledWith("system");
  });

  it("marks the active theme as checked", () => {
    mockTheme = "dark";
    render(<ThemeToggle />);
    const group = getToggleGroup();

    expect(within(group).getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
    expect(within(group).getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "false");
  });

  it("has radiogroup role for accessibility", () => {
    render(<ThemeToggle />);
    expect(screen.getAllByRole("radiogroup", { name: "Theme selection" }).length).toBeGreaterThanOrEqual(1);
  });
});
