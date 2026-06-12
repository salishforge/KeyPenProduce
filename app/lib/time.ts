/**
 * Time helpers. Timestamps are stored as UTC epoch millis (Date objects via
 * Drizzle `timestamp_ms`). Display and cutoff reasoning happen in the app's
 * configured timezone (America/Los_Angeles) so DST is handled correctly.
 */

export const APP_TIMEZONE = "America/Los_Angeles";

export function now(): Date {
  return new Date();
}

export function formatInZone(
  date: Date,
  timeZone: string = APP_TIMEZONE,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  },
): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, ...options }).format(date);
}

export function isBefore(a: Date, b: Date): boolean {
  return a.getTime() < b.getTime();
}

export function isAfter(a: Date, b: Date): boolean {
  return a.getTime() > b.getTime();
}

/** True if `at` falls within [start, end). */
export function isWithin(at: Date, start: Date, end: Date): boolean {
  const t = at.getTime();
  return t >= start.getTime() && t < end.getTime();
}
