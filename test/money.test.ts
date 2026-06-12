import { describe, it, expect } from "vitest";
import {
  formatCents,
  parseDollarsToCents,
  computeMargin,
} from "~/lib/money";

describe("money helpers", () => {
  it("formats cents as dollars", () => {
    expect(formatCents(350)).toBe("$3.50");
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(-150)).toBe("-$1.50");
  });

  it("parses dollar strings to integer cents", () => {
    expect(parseDollarsToCents("3.50")).toBe(350);
    expect(parseDollarsToCents("$2")).toBe(200);
    expect(parseDollarsToCents("10.5")).toBe(1050);
  });

  it("rejects malformed money", () => {
    expect(() => parseDollarsToCents("abc")).toThrow();
    expect(() => parseDollarsToCents("1.999")).toThrow();
  });

  it("computes margin and rate", () => {
    const m = computeMargin(350, 200, 3);
    expect(m.revenueCents).toBe(1050);
    expect(m.costCents).toBe(600);
    expect(m.marginCents).toBe(450);
    expect(Math.round(m.marginRate * 100)).toBe(43);
  });
});
