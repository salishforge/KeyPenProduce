/**
 * Config primitives — the building blocks of the Settings screen.
 *
 * - ConfigSection / ConfigRow: layout for a labelled setting group.
 * - Switch: a native checkbox styled as a toggle (submits with the form).
 * - SwatchPicker: the seasonal-accent chooser. It writes --kp-berry live so the
 *   "In season" marker updates as you pick, and submits the chosen hex.
 *
 * Intended location: app/components/admin/config/ConfigPrimitives.tsx
 */
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

export function ConfigSection({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <div className="kp-cfg__section">
      <h3>{title}</h3>
      {desc ? <p className="desc">{desc}</p> : null}
      {children}
    </div>
  );
}

export function ConfigRow({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <div className="kp-cfg__rowline">
      <div>
        <div className="t">{title}</div>
        {sub ? <div className="s">{sub}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function Switch({
  name,
  defaultChecked,
  label,
}: {
  name: string;
  defaultChecked?: boolean;
  label?: string;
}) {
  return (
    <label className="kp-switch">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      <span className="kp-switch__track" />
      {label ? <span>{label}</span> : null}
    </label>
  );
}

export interface SwatchOption {
  value: string;
  title: string;
}

export function SwatchPicker({
  name,
  options,
  defaultValue,
}: {
  name: string;
  options: SwatchOption[];
  defaultValue: string;
}) {
  const [value, setValue] = useState(defaultValue);

  // Config drives the brand token: reflect the choice live on the document.
  useEffect(() => {
    document.documentElement.style.setProperty("--kp-berry", value);
  }, [value]);

  return (
    <div className="kp-swatches" role="radiogroup" aria-label="Seasonal accent">
      {options.map((opt) => (
        <label className="kp-swatch" key={opt.value}>
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => setValue(opt.value)}
          />
          <span
            className="kp-swatch__chip"
            style={{ background: opt.value }}
            title={opt.title}
          />
        </label>
      ))}
    </div>
  );
}
