import { cn } from "./cn";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const tones: Record<Tone, string> = {
  neutral: "bg-canvas text-muted",
  success: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-800",
  info: "bg-sky-100 text-sky-800",
};

/** Map a domain status string to a sensible tone. */
export function statusTone(status: string): Tone {
  switch (status) {
    case "available":
    case "open":
    case "paid":
    case "active":
    case "completed":
      return "success";
    case "sold_out":
    case "closed":
    case "committed":
    case "reconciled":
      return "info";
    case "shortfall":
    case "unpaid":
    case "draft":
      return "warning";
    case "withdrawn":
    case "cancelled":
    case "refunded":
      return "danger";
    default:
      return "neutral";
  }
}

export function Badge({
  children,
  tone,
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  const resolved = tone ?? (typeof children === "string" ? statusTone(children) : "neutral");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tones[resolved],
        className,
      )}
    >
      {children}
    </span>
  );
}
