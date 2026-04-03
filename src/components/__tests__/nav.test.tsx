import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Nav } from "@/components/nav";

// Mock next/link to render a plain anchor
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock theme toggle
vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

describe("Nav", () => {
  it("renders Chat and Permissions links", () => {
    render(<Nav />);
    expect(screen.getByRole("link", { name: /chat/i })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: /permissions/i })).toHaveAttribute("href", "/dashboard/permissions");
  });

  it("does not render Audit Log link (AC-1)", () => {
    render(<Nav />);
    expect(screen.queryByRole("link", { name: /audit/i })).toBeNull();
    expect(screen.queryByText(/audit log/i)).toBeNull();
  });

  it("renders user name when provided", () => {
    render(<Nav userName="Test User" />);
    expect(screen.getByText("Test User")).toBeInTheDocument();
  });
});
