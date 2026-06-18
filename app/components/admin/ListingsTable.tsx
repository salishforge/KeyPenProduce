/**
 * ListingsTable — the week's listings as a ledger: price, available, reserved,
 * remaining (with a fill bar), supplier, and an edit affordance. Edit links to
 * ?edit=<id> on the same route, which reveals the inline ListingEditForm.
 *
 * Intended location: app/components/admin/ListingsTable.tsx
 */
import { Link } from "react-router";
import type { AdminListingRow } from "~/lib/admin/view-models";

function fillPct(row: AdminListingRow): number {
  if (row.available <= 0) return 100;
  return Math.round((row.reserved / row.available) * 100);
}

export function ListingsTable({ rows }: { rows: AdminListingRow[] }) {
  return (
    <div className="kp-ledger-wrap">
      <div className="kp-ledger-head">
        <h3>This week&rsquo;s listings</h3>
        <Link to="?new" className="kp-btn kp-btn--primary kp-btn--sm">
          + Add listing
        </Link>
      </div>
      <table className="kp-ledger">
        <thead>
          <tr>
            <th>Produce</th>
            <th className="num">Price</th>
            <th className="num">Available</th>
            <th className="num">Reserved</th>
            <th className="num">Remaining</th>
            <th>Supplier</th>
            <th>
              <span className="kp-sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={row.soldOut ? "kp-row-out" : undefined}>
              <td className="prod">
                {row.name} <em>{row.botanicalName}</em>
                {row.soldOut ? (
                  <>
                    {" "}
                    <span className="kp-badge kp-badge--out">Sold out</span>
                  </>
                ) : null}
              </td>
              <td className="num">{row.priceLabel}</td>
              <td className="num">{row.available}</td>
              <td className="num">{row.reserved}</td>
              <td className="num">
                {row.remaining}
                <div className="kp-mini-bar">
                  <i style={{ width: `${fillPct(row)}%` }} />
                </div>
              </td>
              <td>{row.supplier}</td>
              <td>
                <Link to={`?edit=${row.id}`} className="kp-linkact">
                  Edit
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
