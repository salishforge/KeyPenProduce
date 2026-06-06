import { describe, it, expect } from "vitest";
import { orderingAllowed } from "~/services/ordering";

describe("orderingAllowed predicate", () => {
  it("allows ordering while the window is open", () => {
    expect(
      orderingAllowed({
        windowStatus: "open",
        reopenForEveryone: false,
        listingStaysOpenAfterCutoff: false,
        hasUnexpiredOverride: false,
      }),
    ).toBe(true);
  });

  it("blocks ordering once closed by default", () => {
    expect(
      orderingAllowed({
        windowStatus: "closed",
        reopenForEveryone: false,
        listingStaysOpenAfterCutoff: false,
        hasUnexpiredOverride: false,
      }),
    ).toBe(false);
  });

  it("allows a stay-open listing after cutoff", () => {
    expect(
      orderingAllowed({
        windowStatus: "closed",
        reopenForEveryone: false,
        listingStaysOpenAfterCutoff: true,
        hasUnexpiredOverride: false,
      }),
    ).toBe(true);
  });

  it("allows everyone when reopened globally", () => {
    expect(
      orderingAllowed({
        windowStatus: "closed",
        reopenForEveryone: true,
        listingStaysOpenAfterCutoff: false,
        hasUnexpiredOverride: false,
      }),
    ).toBe(true);
  });

  it("allows a specific user with an unexpired override", () => {
    expect(
      orderingAllowed({
        windowStatus: "closed",
        reopenForEveryone: false,
        listingStaysOpenAfterCutoff: false,
        hasUnexpiredOverride: true,
      }),
    ).toBe(true);
  });

  it("never allows ordering once committed", () => {
    expect(
      orderingAllowed({
        windowStatus: "committed",
        reopenForEveryone: true,
        listingStaysOpenAfterCutoff: true,
        hasUnexpiredOverride: true,
      }),
    ).toBe(false);
  });
});
