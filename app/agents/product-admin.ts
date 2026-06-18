import { generateText, stepCountIs, type ModelMessage } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { getDb } from "~/db/client";
import { makeCatalogTools } from "./tools";
import { makeUndoRecorder, undoLast } from "~/services/undo";
import { tool } from "ai";
import { z } from "zod";
import { SYSTEM_PROMPT } from "./system-prompt";
import type { AppEnv } from "~/lib/env";

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const HISTORY_KEY = "history";
const MAX_HISTORY = 40;

interface StoredMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Per-product-admin Durable Object agent. Persists the chat thread in the DO's
 * storage and runs a Workers-AI tool-calling loop (Llama 3.3) over the shared
 * catalog tools. Identity is provided by the worker via headers — never trusted
 * from the request body.
 */
export class ProductAdminAgent {
  constructor(
    private state: DurableObjectState,
    private env: AppEnv,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const userId = request.headers.get("x-kpp-user-id") ?? "unknown";

    if (request.method === "GET" && url.pathname.endsWith("/history")) {
      return Response.json({ history: await this.history() });
    }
    if (request.method === "POST" && url.pathname.endsWith("/clear")) {
      await this.state.storage.delete(HISTORY_KEY);
      return Response.json({ ok: true });
    }
    if (request.method === "POST" && url.pathname.endsWith("/undo")) {
      const summary = await undoLast(getDb(this.env.DB), userId);
      return Response.json({ reply: summary });
    }
    if (request.method === "POST" && url.pathname.endsWith("/chat")) {
      const body = (await request.json().catch(() => ({}))) as { message?: string };
      return this.handleChat(userId, String(body.message ?? ""));
    }
    return new Response("Not found", { status: 404 });
  }

  private async history(): Promise<StoredMessage[]> {
    return (await this.state.storage.get<StoredMessage[]>(HISTORY_KEY)) ?? [];
  }

  private async handleChat(userId: string, message: string): Promise<Response> {
    if (!message.trim()) return Response.json({ reply: "What would you like to do?" });

    if (!this.env.AI) {
      return Response.json({
        reply:
          "The AI model isn't available in this environment. Run `wrangler login` for local Workers AI, or use the manual catalog forms.",
      });
    }

    const history = await this.history();
    const messages: ModelMessage[] = [
      ...history.map((m) => ({ role: m.role, content: m.content }) as ModelMessage),
      { role: "user", content: message },
    ];

    const db = getDb(this.env.DB);
    const workersai = createWorkersAI({ binding: this.env.AI });
    const tools = {
      ...makeCatalogTools(db, {
        actingUserId: userId,
        recordUndo: makeUndoRecorder(db, userId),
      }),
      undo_last: tool({
        description: "Undo the most recent catalog change you made.",
        inputSchema: z.object({}),
        execute: async () => ({ result: await undoLast(db, userId) }),
      }),
    };

    let reply = "";
    const actions: string[] = [];
    try {
      const result = await generateText({
        model: workersai(MODEL),
        system: SYSTEM_PROMPT,
        messages,
        tools,
        stopWhen: stepCountIs(8),
      });
      reply = result.text.trim();
      for (const step of result.steps) {
        for (const call of step.toolCalls ?? []) actions.push(call.toolName);
      }
      if (!reply) {
        reply = actions.length
          ? `Done (${actions.join(", ")}). Say "undo" to revert the last change.`
          : "I'm not sure how to help with that yet.";
      }
    } catch (e) {
      reply = `Sorry — I hit an error: ${e instanceof Error ? e.message : "unknown"}`;
    }

    const next = [
      ...history,
      { role: "user" as const, content: message },
      { role: "assistant" as const, content: reply },
    ].slice(-MAX_HISTORY);
    await this.state.storage.put(HISTORY_KEY, next);
    return Response.json({ reply, actions });
  }
}
