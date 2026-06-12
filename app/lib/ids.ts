/** Prefixed unique ids using the Workers-available Web Crypto UUID. */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

/** URL/slug-safe lowercase string from a product name. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
