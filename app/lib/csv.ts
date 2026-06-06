/** Minimal RFC-4180-ish CSV serializer for finance exports. */

function escapeField(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(
  rows: Array<Record<string, unknown>>,
  columns?: string[],
): string {
  const cols =
    columns ?? (rows.length > 0 ? Object.keys(rows[0]) : []);
  const header = cols.map(escapeField).join(",");
  const body = rows
    .map((row) => cols.map((c) => escapeField(row[c])).join(","))
    .join("\r\n");
  return body ? `${header}\r\n${body}` : header;
}
