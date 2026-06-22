/**
 * /admin/assistant — AI catalog assistant chat page.
 *
 * Renders content only — chrome (sidebar, main region) is provided by the
 * parent StationShell layout (app/routes/admin/layout.tsx). All behavior and
 * data-fetching is unchanged; only the presentation layer has been ported to
 * the kp- design system.
 */
import { useEffect, useRef, useState } from "react";
import type { Route } from "./+types/assistant";
import { requireRole } from "~/auth/session.server";
import { getDb } from "~/db/client";
import * as catalog from "~/services/catalog";

export function meta() {
  return [{ title: "Catalog assistant · Key Pen Produce" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireRole(env, request, ["admin", "product_admin"]);
  const db = getDb(env.DB);
  const suppliers = (await catalog.listSuppliers(db, { activeOnly: true })).map(
    (s) => ({ id: s.id, name: s.name }),
  );
  const windows = (await catalog.listWindows(db)).map((w) => ({
    id: w.id,
    label: w.label,
    status: w.status,
  }));
  return { user, suppliers, windows };
}

const MAX_EMBED_ROWS = 40;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Add a new product: Honeycrisp Apples from Salish Roots Farm",
  "What's available this week?",
  "Set the quantity for Heirloom Tomatoes to 30",
];

export default function Assistant({ loaderData }: Route.ComponentProps) {
  const { suppliers, windows } = loaderData;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [windowId, setWindowId] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // Load persisted history from the agent on mount.
  useEffect(() => {
    fetch("/agents/history")
      .then((r) => (r.ok ? r.json() : { history: [] }))
      .then((d) => setMessages((d as { history?: ChatMessage[] }).history ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, busy]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setMessages((m) => [...m, { role: "user", content: trimmed }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/agents/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = (await res.json()) as { reply?: string };
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.reply ?? "(no response)" },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Sorry — I couldn't reach the assistant." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File) {
    if (!supplierId) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Pick a supplier before importing a spreadsheet." },
      ]);
      return;
    }
    setBusy(true);
    setMessages((m) => [
      ...m,
      { role: "user", content: `📄 Uploaded spreadsheet: ${file.name}` },
    ]);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/catalog-import", { method: "POST", body: fd });
      const data = (await res.json()) as {
        headers?: string[];
        rows?: Array<Record<string, string>>;
        rowCount?: number;
        error?: string;
      };
      if (data.error || !data.rows) {
        setMessages((m) => [...m, { role: "assistant", content: data.error ?? "Couldn't read that file." }]);
        return;
      }
      const supplier = suppliers.find((s) => s.id === supplierId);
      const win = windows.find((w) => w.id === windowId);
      const sample = data.rows.slice(0, MAX_EMBED_ROWS);
      const note =
        data.rowCount! > MAX_EMBED_ROWS
          ? ` (showing the first ${MAX_EMBED_ROWS} of ${data.rowCount} rows)`
          : "";
      const msg =
        `Import this spreadsheet into supplier "${supplier?.name}" (id: ${supplierId})` +
        (win ? ` and list the items in window "${win.label}" (id: ${win.id})` : "") +
        `.\nColumns: ${data.headers!.join(", ")}.\nRows${note} as JSON:\n` +
        JSON.stringify(sample) +
        `\nMap the columns to product fields and import with bulk_import. Ask me if any column is ambiguous (for example, whether a price column is retail or wholesale, or if a unit is missing).`;
      // Send programmatically (the message embeds the data; the visible bubble
      // above already shows the friendly upload note).
      await sendRaw(msg);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function sendRaw(message: string) {
    const res = await fetch("/agents/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const data = (await res.json()) as { reply?: string };
    setMessages((m) => [...m, { role: "assistant", content: data.reply ?? "(no response)" }]);
  }

  async function undo() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/agents/undo", { method: "POST" });
      const data = (await res.json()) as { reply?: string };
      setMessages((m) => [...m, { role: "assistant", content: data.reply ?? "Undone." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="kp-st-head">
        <div>
          <p className="kp-eyebrow">Catalog</p>
          <h1>Assistant</h1>
          <p className="kp-st-head__meta">
            Add products, set availability, or import a spreadsheet — just by chatting.
          </p>
        </div>
        <div className="kp-st-head__acts">
          <button
            className="kp-btn kp-btn--ghost kp-btn--sm"
            onClick={undo}
            disabled={busy}
          >
            Undo last
          </button>
        </div>
      </div>

      {/* Import context — supplier + window selectors and file trigger */}
      <div className="kp-card kp-assistant__ctx">
        <div className="kp-assistant__ctx-row">
          <label className="kp-field">
            <span className="kp-field__label">Supplier (for imports)</span>
            <select
              className="kp-select"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              {suppliers.length === 0 && <option value="">No suppliers yet</option>}
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="kp-field">
            <span className="kp-field__label">List in window (optional)</span>
            <select
              className="kp-select"
              value={windowId}
              onChange={(e) => setWindowId(e.target.value)}
            >
              <option value="">— catalog only —</option>
              {windows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label} ({w.status})
                </option>
              ))}
            </select>
          </label>

          <div className="kp-assistant__ctx-upload">
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="kp-sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
            <button
              className="kp-btn kp-btn--outline kp-btn--sm"
              onClick={() => fileInput.current?.click()}
              disabled={busy || !supplierId}
            >
              Import spreadsheet (CSV / Excel)
            </button>
          </div>
        </div>
      </div>

      {/* Chat log */}
      <div className="kp-card kp-assistant">
        <div ref={scroller} className="kp-assistant__log">
          {messages.length === 0 && (
            <div className="kp-assistant__empty">
              <p className="kp-muted" style={{ marginBottom: "0.5rem" }}>Try something like:</p>
              <div className="kp-assistant__suggestions">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="kp-assistant__suggestion"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`kp-assistant__msg kp-assistant__msg--${m.role}`}
            >
              <div className="kp-assistant__bubble">{m.content}</div>
            </div>
          ))}
          {busy && (
            <div className="kp-assistant__msg kp-assistant__msg--assistant">
              <div className="kp-assistant__bubble kp-muted">Working…</div>
            </div>
          )}
        </div>

        <form
          className="kp-assistant__row"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            className="kp-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Add a product, set a price, import a spreadsheet…"
            disabled={busy}
          />
          <button
            type="submit"
            className="kp-btn kp-btn--primary"
            disabled={busy || !input.trim()}
          >
            Send
          </button>
        </form>
      </div>

      <p className="kp-muted" style={{ fontSize: "0.78rem", marginTop: "0.6rem" }}>
        Changes are applied immediately. Say "undo" or use Undo last to revert
        the most recent change.
      </p>
    </>
  );
}
