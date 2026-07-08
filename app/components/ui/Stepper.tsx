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
  /** Called with the new value whenever it changes (e.g. to auto-save). */
  onChange?: (value: number) => void;
}

export function Stepper({
  name,
  defaultValue = 0,
  min = 0,
  max = 99,
  label,
  onChange,
}: StepperProps) {
  const [value, setValue] = useState(clamp(defaultValue, min, max));

  const set = (next: number) => {
    const v = clamp(next, min, max);
    setValue(v);
    onChange?.(v);
  };

  return (
    <span className="kp-stepper">
      <button
        type="button"
        aria-label={label ? `Decrease ${label}` : "Decrease"}
        disabled={value <= min}
        onClick={() => set(value - 1)}
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
        onClick={() => set(value + 1)}
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
