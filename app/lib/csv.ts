/** Minimal RFC-4180-ish CSV serializer for finance exports. */

function escapeField(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Parse a CSV string into { headers, rows } (RFC-4180-ish: quoted fields, "" escapes). */
export function parseCsv(text: string): {
  headers: string[];
  rows: Array<Record<string, string>>;
} {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  const pushField = () => {
    record.push(field);
    field = "";
  };
  const pushRecord = () => {
    pushField();
    if (record.length > 1 || record[0] !== "") records.push(record);
    record = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") pushField();
    else if (c === "\n") pushRecord();
    else if (c === "\r") {
      /* ignore; \n handles the break */
    } else field += c;
  }
  if (field !== "" || record.length) pushRecord();

  if (records.length === 0) return { headers: [], rows: [] };
  const headers = records[0].map((h) => h.trim());
  const rows = records.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (r[idx] ?? "").trim();
    });
    return obj;
  });
  return { headers, rows };
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
