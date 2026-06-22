import * as XLSX from "xlsx";
import type { Route } from "./+types/catalog-import";
import { requireRole } from "~/auth/session.server";
import { parseCsv } from "~/lib/csv";

const MAX_ROWS = 500;
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Parse an uploaded CSV/XLSX into { headers, rows } in the Worker. The assistant
 * page then feeds a preview to the agent, which maps the columns (asking
 * clarifying questions) and applies via the bulk_import tool.
 */
export async function action({ request, context }: Route.ActionArgs) {
  await requireRole(context.cloudflare.env, request, ["admin", "product_admin"]);
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "File too large (max 5MB)." }, { status: 400 });
  }

  const name = file.name.toLowerCase();
  let headers: string[] = [];
  let rows: Array<Record<string, string>> = [];

  try {
    if (name.endsWith(".csv") || file.type === "text/csv") {
      ({ headers, rows } = parseCsv(await file.text()));
    } else {
      const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const grid = XLSX.utils.sheet_to_json<string[]>(sheet, {
        header: 1,
        raw: false,
        defval: "",
      });
      headers = (grid[0] ?? []).map((h) => String(h).trim());
      rows = grid.slice(1).map((r) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => {
          obj[h] = String(r[i] ?? "").trim();
        });
        return obj;
      });
    }
  } catch {
    return Response.json({ error: "Could not read that file." }, { status: 400 });
  }

  rows = rows.filter((r) => Object.values(r).some((v) => v !== "")).slice(0, MAX_ROWS);
  return Response.json({ headers, rows, rowCount: rows.length });
}
