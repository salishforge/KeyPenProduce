/**
 * Single source of truth for the store's operational configuration.
 *
 * Config lives in KV (CONFIG_KV) rather than D1 because it's a small,
 * infrequently-written blob that every request reads (storefront header,
 * admin dashboard meta). KV handles that pattern with lower latency than
 * a D1 row query and no schema migration when fields change.
 *
 * Both the customer storefront (~/routes/shop/index.tsx) and the admin
 * settings screen (~/routes/admin/settings.tsx) import from this module —
 * one writer, two readers, no duplication of the default values or key name.
 */
import type { AppEnv } from "~/lib/env";

export const CONFIG_KEY = "store-config";

export interface StoreConfig {
  storeName: string;
  tagline: string;
  pickupLocation: string;
  /** Legal/business name used in policies (may differ from the storefront name). */
  businessName: string;
  /** Public contact email shown on the Contact page + footer. */
  contactEmail: string;
  /** Optional public contact phone. Empty = hidden. */
  contactPhone: string;
  accentHex: string;
  /** e.g. "thu-18:00" */
  orderCloses: string;
  /** e.g. "sat-09:00-12:00" */
  pickupWindow: string;
  payOnline: boolean;
  payAtPickup: boolean;
  sendReminder: boolean;
  reminderText: string;
  shortfallRefund: boolean;
  shortfallSubstitute: boolean;
}

export const DEFAULT_CONFIG: StoreConfig = {
  storeName: "Key Pen Produce",
  tagline: "Key Peninsula produce, picked to your order.",
  pickupLocation: "Key Center barn",
  businessName: "Key Pen Produce",
  contactEmail: "",
  contactPhone: "",
  accentHex: "#7b2d4e",
  orderCloses: "thu-18:00",
  pickupWindow: "sat-09:00-12:00",
  payOnline: true,
  payAtPickup: true,
  sendReminder: true,
  reminderText:
    "Your Key Pen pickup is Saturday, 9–noon at the Key Center barn.",
  shortfallRefund: true,
  shortfallSubstitute: false,
};

export async function readStoreConfig(env: AppEnv): Promise<StoreConfig> {
  const raw = (await env.CONFIG_KV.get(CONFIG_KEY, "json")) as Partial<StoreConfig> | null;
  return { ...DEFAULT_CONFIG, ...(raw ?? {}) };
}

export async function writeStoreConfig(
  env: AppEnv,
  config: StoreConfig,
): Promise<void> {
  await env.CONFIG_KV.put(CONFIG_KEY, JSON.stringify(config));
}

/** Human-readable label for the pickup window code. */
export function pickupWindowLabel(config: StoreConfig): string {
  switch (config.pickupWindow) {
    case "sat-09:00-12:00":
      return "Sat 9:00–noon";
    case "sat-10:00-13:00":
      return "Sat 10:00–1:00";
    case "sun-10:00-13:00":
      return "Sun 10:00–1:00";
    default:
      return config.pickupWindow;
  }
}

/** One-line payment method label for the storefront. */
export function payLabel(config: StoreConfig): string {
  if (config.payOnline && config.payAtPickup)
    return "Online now, or cash at pickup";
  if (config.payOnline) return "Pay online at checkout";
  if (config.payAtPickup) return "Pay at pickup";
  return "";
}
