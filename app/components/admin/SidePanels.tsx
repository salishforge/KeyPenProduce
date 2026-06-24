/**
 * SidePanels — the right rail on the week dashboard: what's selling out and the
 * top reservations (demand signal).
 *
 * Intended location: app/components/admin/SidePanels.tsx
 */
import type { DemandItem } from "~/lib/admin/view-models";

function DemandList({ items }: { items: DemandItem[] }) {
  return (
    <ul className="kp-demand">
      {items.map((item) => (
        <li key={item.name}>
          <span>{item.name}</span>
          <b>{item.valueLabel}</b>
        </li>
      ))}
    </ul>
  );
}

export function SidePanels({
  sellingOut,
  demand,
}: {
  sellingOut: DemandItem[];
  demand: DemandItem[];
}) {
  return (
    <div>
      <div className="kp-panel" style={{ marginBottom: "1.2rem" }}>
        <h3>Selling out</h3>
        <p className="kp-panel__sub">Most-reserved against what&rsquo;s left.</p>
        <DemandList items={sellingOut} />
      </div>
      <div className="kp-panel">
        <h3>Demand signal</h3>
        <p className="kp-panel__sub">Top reservations this week.</p>
        <DemandList items={demand} />
      </div>
    </div>
  );
}
