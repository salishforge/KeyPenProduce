/**
 * EditableSelect — a dropdown of known options plus a visible "+ New…" entry
 * that reveals a text box, so admins can pick an existing value OR add a new
 * one that gets saved to the DB. Submits exactly one value under `name`
 * (a hidden input mirrors the select; the text box takes over when adding).
 *
 * Used for free-form catalog fields (e.g. product unit) where the option list
 * grows over time. Unlike a native <datalist>, the full list is always visible
 * and the "add" affordance is explicit.
 */
import { useState } from "react";

const ADD_NEW = "__add_new__";

export function EditableSelect({
  name,
  options,
  defaultValue,
  addLabel = "+ New…",
  newPlaceholder = "Type a new value",
  required,
}: {
  name: string;
  options: string[];
  defaultValue?: string;
  addLabel?: string;
  newPlaceholder?: string;
  required?: boolean;
}) {
  const inList = defaultValue != null && options.includes(defaultValue);
  const [choice, setChoice] = useState(
    inList ? (defaultValue as string) : options[0] ?? ADD_NEW,
  );
  const [custom, setCustom] = useState("");
  const adding = choice === ADD_NEW;

  return (
    <>
      <select
        className="kp-select"
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={ADD_NEW}>{addLabel}</option>
      </select>
      {adding ? (
        <input
          className="kp-input"
          name={name}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder={newPlaceholder}
          autoComplete="off"
          autoFocus
          required={required}
          style={{ marginTop: "0.4rem" }}
        />
      ) : (
        <input type="hidden" name={name} value={choice} />
      )}
    </>
  );
}
