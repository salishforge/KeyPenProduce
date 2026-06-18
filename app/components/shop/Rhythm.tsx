/**
 * Rhythm — the three-beat "how it works" explainer. This is a genuine sequence
 * (reserve -> we shop -> pick up), so numbered markers carry real meaning.
 *
 * Intended location: app/components/shop/Rhythm.tsx
 */

const STEPS = [
  {
    n: "1",
    title: "Reserve by Thursday",
    detail: "Pick from this week's table. Items sell out, so reserve early.",
  },
  {
    n: "2",
    title: "We shop your order",
    detail: "Friday we buy to your reservations from the growers and pack it up.",
  },
  {
    n: "3",
    title: "Pick up Saturday",
    detail: "Come to the Key Center barn, 9 to noon. Pay online ahead or cash there.",
  },
];

export function Rhythm() {
  return (
    <div className="kp-rhythm" id="how-it-works">
      {STEPS.map((s) => (
        <div className="kp-rhythm__step" key={s.n}>
          <div className="kp-rhythm__n">{s.n}</div>
          <div className="kp-rhythm__t">{s.title}</div>
          <div className="kp-rhythm__d">{s.detail}</div>
        </div>
      ))}
    </div>
  );
}
