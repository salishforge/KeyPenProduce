/**
 * CartLine — one basket row on /cart. The quantity stepper auto-saves via a
 * fetcher (debounced), so there's no "Update" button and no page reload; the
 * line subtotal updates instantly and the held subtotal follows on revalidation.
 * The trash button removes the line (quantity 0).
 *
 * Intended location: app/components/shop/CartLine.tsx
 */
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { Stepper } from "~/components/ui/Stepper";
import { TrashIcon } from "~/components/ui/Icons";
import { formatCents } from "~/lib/money";

export interface CartLineItem {
  listingId: string;
  name: string;
  unit: string;
  priceCents: number;
  quantity: number;
  remaining: number;
}

export function CartLine({ item }: { item: CartLineItem }) {
  const fetcher = useFetcher();
  const [qty, setQty] = useState(item.quantity);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Follow the server value if it changes (e.g. clamped to remaining stock).
  useEffect(() => {
    setQty(item.quantity);
  }, [item.quantity]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const save = (next: number) => {
    fetcher.submit(
      { intent: "update", listingId: item.listingId, quantity: String(next) },
      { method: "post" },
    );
  };

  const onStep = (next: number) => {
    setQty(next);
    if (timer.current) clearTimeout(timer.current);
    if (next <= 0) {
      save(0); // removing — no need to wait
      return;
    }
    timer.current = setTimeout(() => save(next), 400);
  };

  const remove = () => {
    if (timer.current) clearTimeout(timer.current);
    setQty(0);
    save(0);
  };

  return (
    <div className="kp-cart__line">
      <div className="kp-cart__info">
        <div className="kp-cart__name">{item.name}</div>
        <div className="kp-muted">
          {formatCents(item.priceCents)} / {item.unit}
        </div>
      </div>
      <div className="kp-cart__amt">{formatCents(item.priceCents * qty)}</div>
      <div className="kp-cart__controls">
        <Stepper
          key={item.quantity}
          name={`qty-${item.listingId}`}
          defaultValue={item.quantity}
          min={0}
          max={item.remaining}
          label={item.name}
          onChange={onStep}
        />
        <button
          type="button"
          className="kp-cart__trash"
          onClick={remove}
          aria-label={`Remove ${item.name}`}
        >
          <TrashIcon size={18} />
        </button>
      </div>
    </div>
  );
}
