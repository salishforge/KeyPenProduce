import { describe, it, expect } from "vitest";
import {
  resolvePostAuthPath,
  sanitizeRedirectPath,
} from "~/auth/session.server";

/**
 * Where each role lands after signing in, and the open-redirect guard on the
 * caller-supplied `redirectTo`.
 */
describe("post-auth landing", () => {
  it("sends each role to its own portal by default", () => {
    expect(resolvePostAuthPath("admin", null)).toBe("/admin");
    expect(resolvePostAuthPath("product_admin", null)).toBe("/admin");
    expect(resolvePostAuthPath("fulfillment", null)).toBe("/desk");
    expect(resolvePostAuthPath("client", null)).toBe("/shop");
  });

  it("treats a bare '/' as no destination, not a place to land", () => {
    // This was the bug: everyone landed on "/" and bounced from there.
    expect(resolvePostAuthPath("admin", "/")).toBe("/admin");
    expect(resolvePostAuthPath("client", "/")).toBe("/shop");
  });

  it("doesn't strand staff on the storefront they signed in from", () => {
    // The shop header links to /login?redirectTo=/shop.
    expect(resolvePostAuthPath("admin", "/shop")).toBe("/admin");
    expect(resolvePostAuthPath("fulfillment", "/shop")).toBe("/desk");
  });

  it("keeps staff deep links into their own area", () => {
    expect(resolvePostAuthPath("admin", "/admin/products")).toBe(
      "/admin/products",
    );
    expect(resolvePostAuthPath("fulfillment", "/desk/order/abc")).toBe(
      "/desk/order/abc",
    );
  });

  it("never drops a customer into a staff area", () => {
    expect(resolvePostAuthPath("client", "/admin")).toBe("/shop");
    expect(resolvePostAuthPath("client", "/desk")).toBe("/shop");
  });

  it("doesn't send a role to a staff area it can't open", () => {
    // product_admin has no desk access; fulfillment has no admin access.
    expect(resolvePostAuthPath("product_admin", "/desk")).toBe("/admin");
    expect(resolvePostAuthPath("fulfillment", "/admin/finance")).toBe("/desk");
  });

  it("preserves a customer's place in the flow", () => {
    // A guest who hit "Sign in to reserve" comes back to their basket.
    expect(resolvePostAuthPath("client", "/cart")).toBe("/cart");
    expect(resolvePostAuthPath("client", "/orders/ord_1")).toBe("/orders/ord_1");
    // Staff mid-basket meant it too.
    expect(resolvePostAuthPath("admin", "/cart")).toBe("/cart");
  });

  it("refuses to redirect off-site", () => {
    for (const evil of [
      "https://evil.example",
      "//evil.example",
      "javascript:alert(1)",
      "http://evil.example/path",
    ]) {
      expect(resolvePostAuthPath("client", evil)).toBe("/shop");
      expect(resolvePostAuthPath("admin", evil)).toBe("/admin");
      expect(sanitizeRedirectPath(evil)).toBe("/");
    }
  });

  it("passes through safe same-origin paths for the OAuth callback", () => {
    expect(sanitizeRedirectPath("/cart")).toBe("/cart");
    expect(sanitizeRedirectPath(null)).toBe("/");
  });
});
