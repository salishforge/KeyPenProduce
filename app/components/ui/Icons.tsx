/**
 * Shared inline icons. Stroke/fill inherit from `currentColor`, so colour is
 * controlled by the surrounding text colour / token.
 *
 * Intended location: app/components/ui/Icons.tsx
 */
import type { SVGProps } from "react";

/** The Key Pen sprout — the wordmark / brand glyph. */
export function LeafMark({ size = 22, ...props }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden="true" {...props}>
      <path
        d="M11 2C7 6 6 9 6 12a5 5 0 0 0 10 0c0-3-1-6-5-10Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M11 8v9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Reassurance check used in the basket note. */
export function CheckCircle({ size = 15, ...props }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M5.4 8.2 7.1 9.9 10.6 6"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ArrowUpRight({ size = 13, ...props }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 13 13" fill="none" aria-hidden="true" {...props}>
      <path
        d="M4 9 9 4M9 4H5M9 4v4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
