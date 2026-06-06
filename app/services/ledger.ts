import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { DB } from "~/db/client";
import { ledgerEntries, type LedgerDirection, type LedgerEntryType } from "~/db/schema-helpers";
import { newId } from "~/lib/ids";

export interface LedgerInput {
  type: LedgerEntryType;
  direction: LedgerDirection;
  amountCents: number;
  orderId?: string;
  reservationId?: string;
  supplierId?: string;
  windowId?: string;
  paymentId?: string;
  stripeObjectId?: string;
  memo?: string;
  createdByUserId?: string;
  occurredAt?: Date;
}

/** Append one immutable ledger entry. */
export async function recordLedgerEntry(
  db: DB,
  input: LedgerInput,
): Promise<string> {
  const id = newId("led");
  const nowDate = new Date();
  await db.insert(ledgerEntries).values({
    id,
    type: input.type,
    direction: input.direction,
    amountCents: input.amountCents,
    orderId: input.orderId ?? null,
    reservationId: input.reservationId ?? null,
    supplierId: input.supplierId ?? null,
    windowId: input.windowId ?? null,
    paymentId: input.paymentId ?? null,
    stripeObjectId: input.stripeObjectId ?? null,
    memo: input.memo ?? null,
    createdByUserId: input.createdByUserId ?? null,
    occurredAt: input.occurredAt ?? nowDate,
    createdAt: nowDate,
  });
  return id;
}

export interface FinanceSummary {
  saleRevenueCents: number;
  wholesaleCostCents: number;
  grossMarginCents: number;
  cardOnlineCents: number;
  cardInPersonCents: number;
  cashCents: number;
  stripeFeesCents: number;
  refundsCents: number;
  netCashCollectedCents: number;
}

/** Roll the ledger up into a P&L summary over an optional date range. */
export async function getFinanceSummary(
  db: DB,
  range?: { from?: Date; to?: Date },
): Promise<FinanceSummary> {
  const conds = [];
  if (range?.from) conds.push(gte(ledgerEntries.occurredAt, range.from));
  if (range?.to) conds.push(lte(ledgerEntries.occurredAt, range.to));
  const rows = await db
    .select({
      type: ledgerEntries.type,
      total: sql<number>`COALESCE(SUM(${ledgerEntries.amountCents}), 0)`,
    })
    .from(ledgerEntries)
    .where(conds.length ? and(...conds) : undefined)
    .groupBy(ledgerEntries.type);

  const by = (t: LedgerEntryType) =>
    rows.find((r) => r.type === t)?.total ?? 0;

  const saleRevenueCents = by("sale_revenue");
  const wholesaleCostCents = by("wholesale_cost");
  const cardOnlineCents = by("card_payment_online");
  const cardInPersonCents = by("card_payment_in_person");
  const cashCents = by("cash_payment");
  const stripeFeesCents = by("stripe_fee");
  const refundsCents = by("refund_issued");

  return {
    saleRevenueCents,
    wholesaleCostCents,
    grossMarginCents: saleRevenueCents - wholesaleCostCents,
    cardOnlineCents,
    cardInPersonCents,
    cashCents,
    stripeFeesCents,
    refundsCents,
    netCashCollectedCents:
      cardOnlineCents +
      cardInPersonCents +
      cashCents -
      stripeFeesCents -
      refundsCents,
  };
}
