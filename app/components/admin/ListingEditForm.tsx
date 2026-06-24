/**
 * ListingEditForm — the inline add/edit panel. Shown when ?edit=<id> or ?new is
 * present on the week route. Posts {intent:"save-listing", ...} to the action.
 *
 * Preservation & recipe links attach automatically downstream from the crop's
 * slug (see app/lib/preservation), so they are not edited here.
 *
 * Intended location: app/components/admin/ListingEditForm.tsx
 */
import { Form, Link } from "react-router";
import type {
  EditableListing,
  ListingFormOptions,
} from "~/lib/admin/view-models";

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
            <select className="kp-select" name="produceId" defaultValue={listing?.produceId}>
              {options.produce.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
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

        <div className="kp-row">
          <label className="kp-field">
            <span className="kp-field__label">Price</span>
            <input className="kp-input" name="price" defaultValue={listing?.price} inputMode="decimal" />
          </label>
          <label className="kp-field">
            <span className="kp-field__label">Unit</span>
            <select className="kp-select" name="unit" defaultValue={listing?.unit}>
              {options.units.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
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
