import { desc } from "drizzle-orm";
import type { Route } from "./+types/finance-export";
import { requireRole } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { ledgerEntries } from "~/db/schema";
import { toCsv } from "~/lib/csv";

/** Download the full financial ledger as CSV (for accounting/tax). */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireRole(env, request, ["admin"]);
  const db = getDb(env.DB);
  const rows = await db
    .select()
    .from(ledgerEntries)
    .orderBy(desc(ledgerEntries.occurredAt));

  const csv = toCsv(
    rows.map((r) => ({
      id: r.id,
      occurredAt: r.occurredAt.toISOString(),
      type: r.type,
      direction: r.direction,
      amountCents: r.amountCents,
      amountDollars: (r.amountCents / 100).toFixed(2),
      orderId: r.orderId ?? "",
      supplierId: r.supplierId ?? "",
      windowId: r.windowId ?? "",
      stripeObjectId: r.stripeObjectId ?? "",
      memo: r.memo ?? "",
    })),
    [
      "id",
      "occurredAt",
      "type",
      "direction",
      "amountCents",
      "amountDollars",
      "orderId",
      "supplierId",
      "windowId",
      "stripeObjectId",
      "memo",
    ],
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kpp-ledger-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
