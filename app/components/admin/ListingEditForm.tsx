/**
 * ListingEditForm — the inline add/edit panel. Shown when ?edit=<id> or ?new is
 * present on the week route. Posts {intent:"save-listing", ...} to the action.
 *
 * Preservation & recipe links attach automatically downstream from the crop's
 * slug (see app/lib/preservation), so they are not edited here.
 *
 * Intended location: app/components/admin/ListingEditForm.tsx
 */
import { useState } from "react";
import { Form, Link } from "react-router";
import type {
  EditableListing,
  ListingFormOptions,
} from "~/lib/admin/view-models";
import { EditableSelect } from "~/components/admin/EditableSelect";

/** Sentinel produce-select value that reveals the inline "new produce" field. */
const NEW_PRODUCE = "__new__";

export function ListingEditForm({
  listing,
  options,
}: {
  /** Omit for the "add listing" case. */
  listing?: EditableListing;
  options: ListingFormOptions;
}) {
  const isEdit = Boolean(listing);
  const heading = isEdit ? "Edit listing" : "Add listing";
  const [produceId, setProduceId] = useState(
    listing?.produceId ?? options.produce[0]?.id ?? NEW_PRODUCE,
  );
  const creatingProduce = produceId === NEW_PRODUCE;

  return (
    <div className="kp-panel">
      <h3>{heading}</h3>
      <p className="kp-panel__sub">
        Preservation &amp; recipe links attach automatically from the field guide.
      </p>
      <Form method="post">
        <input type="hidden" name="intent" value="save-listing" />
        {listing ? <input type="hidden" name="id" value={listing.id} /> : null}

        <div className="kp-row">
          <label className="kp-field">
            <span className="kp-field__label">Produce</span>
            <select
              className="kp-select"
              name="produceId"
              value={produceId}
              onChange={(e) => setProduceId(e.target.value)}
            >
              {options.produce.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value={NEW_PRODUCE}>+ New produce…</option>
            </select>
          </label>
          <label className="kp-field">
            <span className="kp-field__label">Supplier</span>
            <select className="kp-select" name="supplierId" defaultValue={listing?.supplierId}>
              {options.suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {creatingProduce && (
          <div className="kp-row">
            <label className="kp-field">
              <span className="kp-field__label">New produce name</span>
              <input className="kp-input" name="newProduceName" required />
            </label>
          </div>
        )}

        <div className="kp-row">
          <label className="kp-field">
            <span className="kp-field__label">Price</span>
            <input className="kp-input" name="price" defaultValue={listing?.price} inputMode="decimal" />
          </label>
          <label className="kp-field">
            <span className="kp-field__label">Unit</span>
            <EditableSelect
              name="unit"
              options={options.units}
              defaultValue={listing?.unit ?? "each"}
              addLabel="+ New unit…"
              newPlaceholder="e.g. pint, dozen"
              required
            />
          </label>
          <label className="kp-field">
            <span className="kp-field__label">Qty available</span>
            <input className="kp-input" name="available" defaultValue={listing?.available} inputMode="numeric" />
          </label>
        </div>

        <div className="kp-row" style={{ justifyContent: "flex-end", marginTop: "0.4rem" }}>
          <Link to="." className="kp-btn kp-btn--ghost kp-btn--sm">
            Cancel
          </Link>
          <button type="submit" className="kp-btn kp-btn--primary kp-btn--sm">
            Save listing
          </button>
        </div>
      </Form>
    </div>
  );
}
