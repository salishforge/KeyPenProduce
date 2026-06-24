/**
 * Stepper — a quantity control. Uncontrolled-friendly: it keeps its own state
 * and writes the value into a hidden <input name={name}> so it works inside a
 * plain <Form>. Pass `max` (remaining stock) to cap it.
 *
 * Intended location: app/components/ui/Stepper.tsx
 */
import { useState } from "react";

export interface StepperProps {
  name: string;
  defaultValue?: number;
  min?: number;
  max?: number;
  /** Accessible label prefix, e.g. the product name. */
  label?: string;
}

export function Stepper({ name, defaultValue = 0, min = 0, max = 99, label }: StepperProps) {
  const [value, setValue] = useState(clamp(defaultValue, min, max));

  return (
    <span className="kp-stepper">
      <button
        type="button"
        aria-label={label ? `Decrease ${label}` : "Decrease"}
        disabled={value <= min}
        onClick={() => setValue((v) => clamp(v - 1, min, max))}
      >
        –
      </button>
      <span className="kp-stepper__value" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        aria-label={label ? `Increase ${label}` : "Increase"}
        disabled={value >= max}
        onClick={() => setValue((v) => clamp(v + 1, min, max))}
      >
        +
      </button>
      <input type="hidden" name={name} value={value} />
    </span>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
