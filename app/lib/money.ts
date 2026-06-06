/** Money helpers. All amounts are integer cents; never use floats. */

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

/** Parse a user-entered dollar string (e.g. "3.50") into integer cents. */
export function parseDollarsToCents(input: string): number {
  const trimmed = input.trim().replace(/^\$/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error(`Invalid money value: ${input}`);
  }
  const [dollars, fraction = ""] = trimmed.split(".");
  const cents = fraction.padEnd(2, "0");
  return Number(dollars) * 100 + Number(cents);
}

export interface MarginResult {
  revenueCents: number;
  costCents: number;
  marginCents: number;
  /** Margin as a fraction of revenue (0..1); 0 when revenue is 0. */
  marginRate: number;
}

/** Compute revenue/cost/margin for a quantity at given unit price + cost. */
export function computeMargin(
  unitPriceCents: number,
  unitCostCents: number,
  quantity: number,
): MarginResult {
  const revenueCents = unitPriceCents * quantity;
  const costCents = unitCostCents * quantity;
  const marginCents = revenueCents - costCents;
  return {
    revenueCents,
    costCents,
    marginCents,
    marginRate: revenueCents === 0 ? 0 : marginCents / revenueCents,
  };
}
