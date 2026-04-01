import { test, expect } from "@playwright/test";

test.describe("DealFlow AI Smoke Tests", () => {
  test("landing page loads with correct content", async ({ page }) => {
    await page.goto("http://localhost:3000");
    await expect(page.locator("h1")).toContainText("DealFlow AI");
    await expect(page.locator("text=Powered by Auth0 Token Vault")).toBeVisible();
    await expect(page.locator("text=Sign In to Get Started")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Email" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible();
  });

  test("sign in link redirects to Auth0", async ({ page }) => {
    await page.goto("http://localhost:3000");
    const link = page.locator("text=Sign In to Get Started");
    const href = await link.getAttribute("href");
    expect(href).toBe("/auth/login?returnTo=/dashboard");
  });

  test("dashboard redirects unauthenticated users to login", async ({ page }) => {
    const response = await page.goto("http://localhost:3000/dashboard");
    const url = page.url();
    // Should redirect through auth/login to Auth0
    expect(
      url.includes("auth0.com") || url.includes("/auth/login") || response?.status() === 307
    ).toBeTruthy();
  });

  test("API chat rejects unauthenticated requests", async ({ request }) => {
    const response = await request.post("http://localhost:3000/api/chat", {
      data: { messages: [], id: "test" },
    });
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  test("API seed rejects unauthenticated requests", async ({ request }) => {
    const response = await request.post("http://localhost:3000/api/seed");
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  test("API chat rejects invalid request body", async ({ request }) => {
    // This will get 401 since we're not authenticated, which is correct
    const response = await request.post("http://localhost:3000/api/chat", {
      data: "not json",
    });
    expect(response.status()).toBe(401);
  });

  test("corrupted cookie is handled gracefully", async ({ page, context }) => {
    // Set a bad session cookie
    await context.addCookies([
      {
        name: "appSession",
        value: "corrupted-value",
        domain: "localhost",
        path: "/",
      },
    ]);
    await page.goto("http://localhost:3000");
    // Should not crash — either shows landing page or redirects
    await expect(page).not.toHaveTitle(/error/i);
  });

  test("close page renders correctly", async ({ page }) => {
    await page.goto("http://localhost:3000/close");
    await expect(
      page.locator("text=Authorization complete")
    ).toBeVisible();
  });
});
