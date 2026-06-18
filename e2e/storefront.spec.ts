import { test, expect } from "@playwright/test";

/**
 * Customer happy path against the reskinned storefront: sign up (auto signs in
 * — requireEmailVerification is off), reserve a unit from the weekly board,
 * review the basket, and place the order. This drives the full reserve-on-submit
 * flow through the UI and into the oversell-tested placeOrder.
 *
 * A unique email per run keeps it idempotent against a seeded local D1.
 */
test("customer signs up, reserves produce, and places an order", async ({
  page,
}) => {
  const email = `e2e-${Date.now()}@example.com`;

  await page.goto("/signup");
  await page.fill('input[name="name"]', "E2E Shopper");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "e2e-pass-12345");
  await page.getByRole("button", { name: "Create account" }).click();

  // New client accounts land on the storefront board.
  await expect(
    page.getByRole("heading", { name: "The board" }),
  ).toBeVisible({ timeout: 15_000 });

  // Reserve one unit of the first in-stock listing (steppers start at 0).
  const firstCard = page.locator(".kp-listing").first();
  await firstCard.getByRole("button", { name: /^Increase / }).click();
  await firstCard.getByRole("button", { name: "Reserve" }).click();

  // The held item now shows in the sticky basket; check out to the review step.
  await page.getByRole("button", { name: /Reserve .* pay now/ }).click();
  await expect(
    page.getByRole("heading", { name: "Your basket" }),
  ).toBeVisible();

  // Place the order — lands on the order confirmation page.
  await page.getByRole("button", { name: "Reserve my basket" }).click();
  await page.waitForURL("**/orders/**");
  await expect(page.locator(".kp-shop-top")).toBeVisible();
});
