/**
 * WindowLifecycle — the weekly window's progress: draft -> open -> committed
 * -> active (pickup) -> completed. Steps before the current one render "done",
 * the current one "now".
 *
 * Intended location: app/components/admin/WindowLifecycle.tsx
 */
import { Fragment } from "react";
import type { WindowStage } from "~/lib/admin/view-models";

const STAGES: { id: WindowStage; label: string }[] = [
  { id: "draft", label: "Draft" },
  { id: "open", label: "Open for orders" },
  { id: "committed", label: "Committed" },
  { id: "active", label: "Active · pickup" },
  { id: "completed", label: "Completed" },
];

export function WindowLifecycle({ current }: { current: WindowStage }) {
  const currentIndex = STAGES.findIndex((s) => s.id === current);

  return (
    <div className="kp-lifecycle" aria-label="Window lifecycle">
      {STAGES.map((stage, i) => {
        const state =
          i < currentIndex ? "is-done" : i === currentIndex ? "is-now" : "";
        return (
          <Fragment key={stage.id}>
            {i > 0 ? <span className="kp-lifecycle__sep" /> : null}
            <span
              className={`kp-lifecycle__step ${state}`}
              aria-current={i === currentIndex ? "step" : undefined}
            >
              <span className="kp-lifecycle__dot" />
              {stage.label}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}
