import { useEffect } from "react";
import { useRevalidator } from "react-router";

/**
 * Re-runs the current route's loader on an interval (and when the tab regains
 * focus) so views like the availability dashboard reflect customers' reservations
 * in near-real-time. No new infrastructure — just loader revalidation.
 */
export function LivePoll({ intervalMs = 8000 }: { intervalMs?: number }) {
  const revalidator = useRevalidator();
  useEffect(() => {
    const tick = () => {
      if (revalidator.state === "idle" && document.visibilityState === "visible") {
        revalidator.revalidate();
      }
    };
    const id = setInterval(tick, intervalMs);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, [revalidator, intervalMs]);
  return null;
}
