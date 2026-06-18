/**
 * SummaryTiles — the at-a-glance numbers for the week.
 *
 * Intended location: app/components/admin/SummaryTiles.tsx
 */
import type { SummaryTile } from "~/lib/admin/view-models";

export function SummaryTiles({ tiles }: { tiles: SummaryTile[] }) {
  return (
    <div className="kp-tiles">
      {tiles.map((tile) => (
        <div className="kp-tile" key={tile.label}>
          <div className="k">{tile.label}</div>
          <div className="v">
            {tile.value}
            {tile.sub ? <small> {tile.sub}</small> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
