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

/** Hamburger / menu toggle. */
export function MenuIcon({ size = 22, ...props }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden="true" {...props}>
      <path
        d="M4 6.5h14M4 11h14M4 15.5h14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Basket / bag for the cart pill + bar. */
export function BasketIcon({ size = 18, ...props }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        d="M6.5 6.5 10 2.5l3.5 4M3 6.5h14l-1.1 9.2a1.5 1.5 0 0 1-1.5 1.3H5.6a1.5 1.5 0 0 1-1.5-1.3L3 6.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Right chevron for tappable rows. */
export function ChevronRight({ size = 18, ...props }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        d="M8 5l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Trash / remove. */
export function TrashIcon({ size = 18, ...props }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        d="M4 6h12M8 6V4.5A1 1 0 0 1 9 3.5h2a1 1 0 0 1 1 1V6m3 0-.7 9.2a1.4 1.4 0 0 1-1.4 1.3H6.1a1.4 1.4 0 0 1-1.4-1.3L4 6m4 3v5m4-5v5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
