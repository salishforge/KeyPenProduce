import { useEffect, useRef, useState } from "react";
import type { Route } from "./+types/assistant";
import { requireRole } from "~/auth/session.server";
import { TopNav } from "~/components/nav";
import { AdminNav } from "~/components/admin-nav";
import { Container, PageHeader, Card, Button, Input, Select } from "~/components/ui";
import { cn } from "~/components/ui/cn";
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
  const { user, suppliers, windows } = loaderData;
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
    <div className="min-h-screen bg-canvas text-ink">
      <TopNav user={user} />
      <AdminNav role={user.role} />
      <Container>
        <PageHeader
          title="Catalog assistant"
          subtitle="Add products, set availability, or import a spreadsheet — just by chatting."
          actions={
            <Button variant="secondary" size="sm" onClick={undo} disabled={busy}>
              Undo last
            </Button>
          }
        />

        <Card className="mb-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-muted">
                Supplier (for imports)
              </label>
              <Select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-48"
              >
                {suppliers.length === 0 && <option value="">No suppliers yet</option>}
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-muted">
                List in window (optional)
              </label>
              <Select
                value={windowId}
                onChange={(e) => setWindowId(e.target.value)}
                className="w-48"
              >
                <option value="">— catalog only —</option>
                {windows.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label} ({w.status})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
              />
              <Button
                variant="secondary"
                onClick={() => fileInput.current?.click()}
                disabled={busy || !supplierId}
              >
                Import spreadsheet (CSV / Excel)
              </Button>
            </div>
          </div>
        </Card>

        <Card className="flex h-[60vh] flex-col p-0">
          <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="text-sm text-muted">
                <p className="mb-2">Try something like:</p>
                <div className="flex flex-col items-start gap-1">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-lg bg-canvas px-3 py-1.5 text-left text-brand-dark hover:bg-emerald-50"
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
                className={cn(
                  "flex",
                  m.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm",
                    m.role === "user"
                      ? "bg-brand text-white"
                      : "bg-canvas text-ink",
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {busy && <div className="text-sm text-muted">Working…</div>}
          </div>

          <form
            className="flex items-center gap-2 border-t border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Add a product, set a price, import a spreadsheet…"
              disabled={busy}
            />
            <Button type="submit" disabled={busy || !input.trim()}>
              Send
            </Button>
          </form>
        </Card>
        <p className="mt-2 text-xs text-muted">
          Changes are applied immediately. Say "undo" or use Undo last to revert
          the most recent change.
        </p>
      </Container>
    </div>
  );
}
