/**
 * CartBar — a sticky, thumb-reachable basket bar pinned to the bottom of the
 * viewport on phones. Shows the live item count + subtotal and links to the
 * next step. Hidden on desktop (≥60rem), where the storefront's sticky sidebar
 * basket does the same job. Renders nothing when the basket is empty.
 *
 * Intended location: app/components/shop/CartBar.tsx
 */
import { Link } from "react-router";

export function CartBar({
  count,
  totalLabel,
  to,
  label = "View basket",
}: {
  count: number;
  totalLabel: string;
  to: string;
  label?: string;
}) {
  if (count <= 0) return null;
  const items = `${count} ${count === 1 ? "item" : "items"}`;
  return (
    <div className="kp-cartbar" role="region" aria-label="Basket summary">
      <Link to={to} className="kp-cartbar__btn">
        <span className="kp-cartbar__count" aria-hidden="true">
          {count}
        </span>
        <span className="kp-cartbar__label">
          {label}
          <span className="kp-cartbar__sub">{items}</span>
        </span>
        <span className="kp-cartbar__total">{totalLabel}&nbsp;→</span>
      </Link>
    </div>
  );
}
