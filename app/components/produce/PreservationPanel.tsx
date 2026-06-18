/**
 * PreservationPanel — the "ways to keep it" panel for a produce listing.
 *
 * Presentational only: hand it the resolved data from `getPreservationForCrop`
 * in your route loader. It teaches the method + the hazard and links out to a
 * tested process; it deliberately never renders steps, times, or temperatures.
 *
 * Intended location: app/components/produce/PreservationPanel.tsx
 * Styles: import "~/styles/preservation.css" once in your app.
 * Adjust the import alias below (`~/`) to match your tsconfig paths if needed.
 */
import type {
  CropPreservation,
  ResolvedMethod,
  SafetyNote,
  SafetySeverity,
} from "~/lib/preservation/preservation-data";
import {
  MECHANISM_LABEL,
  PRESERVATION_SOURCES,
} from "~/lib/preservation/preservation-data";

export interface PreservationPanelProps {
  data: CropPreservation;
}

export function PreservationPanel({ data }: PreservationPanelProps) {
  const { crop, methods, headline } = data;

  return (
    <section className="kp-panel" aria-labelledby="kp-panel-title">
      <header>
        <p className="kp-panel__eyebrow">Ways to keep it</p>
        <h2 className="kp-panel__title" id="kp-panel-title">
          {crop.name}
        </h2>
        <p className="kp-panel__binomial">{crop.botanicalName}</p>
        <span className="kp-panel__season">{crop.season}</span>
      </header>

      {headline ? <AcidityBanner note={headline} /> : null}

      <ul className="kp-methods">
        {methods.map((method) => (
          <MethodEntry key={method.id} method={method} />
        ))}
      </ul>

      <footer className="kp-foot">
        <p className="kp-foot__note">
          We point you to tested, research-based methods rather than printing
          steps here — preservation timing is a food-safety matter, so follow a
          recipe from one of these.
        </p>
        <ul className="kp-foot__sources">
          {PRESERVATION_SOURCES.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noopener noreferrer">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </footer>
    </section>
  );
}

function AcidityBanner({ note }: { note: SafetyNote }) {
  const tone =
    note.severity === "critical"
      ? "kp-banner--critical"
      : note.severity === "caution"
        ? "kp-banner--caution"
        : "";
  return (
    <div className={`kp-banner ${tone}`} role="note">
      <SeverityIcon severity={note.severity} />
      <p className="kp-banner__text">
        <b>{severityWord(note.severity)}.</b> {note.text}
      </p>
    </div>
  );
}

function MethodEntry({ method }: { method: ResolvedMethod }) {
  return (
    <li className="kp-method">
      <div className="kp-method__main">
        <p className="kp-method__mech">{MECHANISM_LABEL[method.mechanism]}</p>
        <h3 className="kp-method__name">{method.name}</h3>
        {method.recommended ? (
          <span className="kp-method__rec">Best for this</span>
        ) : null}

        <p className="kp-method__desc">{method.shortDescription}</p>
        <p className="kp-method__world">{method.aroundTheWorld}</p>
        {method.cropNote ? (
          <p className="kp-method__cropnote">{method.cropNote}</p>
        ) : null}

        <SafetyLine note={method.safety} />

        <a
          className="kp-link"
          href={method.testedProcessUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          See the tested method — {method.sourceLabel}
          <ArrowUpRight />
        </a>
      </div>

      <aside className="kp-method__aside">
        <div>
          <p className="kp-keeps__label">Keeps</p>
          <KeepsGauge tier={method.keepsTier} />
          <p className="kp-keeps__value">{method.keepsLabel}</p>
        </div>
        <div>
          <p className="kp-diff__label">Effort</p>
          <p className="kp-diff__value">{method.difficulty}</p>
        </div>
      </aside>
    </li>
  );
}

function KeepsGauge({ tier }: { tier: number }) {
  const ticks = [1, 2, 3, 4, 5];
  return (
    <div
      className="kp-gauge"
      role="img"
      aria-label={`Keeping length ${tier} of 5`}
    >
      {ticks.map((t) => (
        <span
          key={t}
          className={`kp-gauge__tick ${t <= tier ? "kp-gauge__tick--on" : ""}`}
        />
      ))}
    </div>
  );
}

function SafetyLine({ note }: { note: SafetyNote }) {
  return (
    <p className={`kp-safety kp-safety--${note.severity}`}>
      <span className="kp-safety__icon" aria-hidden="true">
        <SeverityIcon severity={note.severity} />
      </span>
      <span>
        <span className="kp-safety__label">{severityWord(note.severity)}: </span>
        {note.text}
      </span>
    </p>
  );
}

function severityWord(severity: SafetySeverity): string {
  switch (severity) {
    case "critical":
      return "Critical";
    case "caution":
      return "Caution";
    default:
      return "Good to know";
  }
}

// --- Inline icons (color inherits from currentColor) ------------------------

function SeverityIcon({ severity }: { severity: SafetySeverity }) {
  if (severity === "note") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.3" />
        <path d="M5.4 8.2 7.1 9.9 10.6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  // caution + critical share the triangle; critical is filled for weight
  const filled = severity === "critical";
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 2.2 14.4 13H1.6L8 2.2Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
        fill={filled ? "currentColor" : "none"}
      />
      <path
        d="M8 6.4v3"
        stroke={filled ? "var(--kp-paper)" : "currentColor"}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <circle cx="8" cy="11.2" r="0.8" fill={filled ? "var(--kp-paper)" : "currentColor"} />
    </svg>
  );
}

function ArrowUpRight() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M4 9 9 4M9 4H5M9 4v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default PreservationPanel;
