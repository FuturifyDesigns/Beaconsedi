import type { SVGProps } from "react";

export function StarOfLife(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="Star of Life" {...props}>
      <path
        fill="currentColor"
        d="M27 3h10l2.6 16.2 14.1-8.1 5 8.7-12.8 10.4 12.8 10.4-5 8.7-14.1-8.1L37 59H27l-2.6-15.8-14.1 8.1-5-8.7 12.8-10.4L5.3 21.8l5-8.7 14.1 8.1L27 3Z"
      />
      <path d="M32 13v38" fill="none" stroke="var(--background)" strokeWidth="3" strokeLinecap="round" />
      <path
        d="M38 19c-7-3-10 1-7 4 2 2 7 2 7 6 0 5-12 4-12 9 0 4 8 4 10 8"
        fill="none"
        stroke="var(--background)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="32" cy="11" r="2.7" fill="var(--background)" />
    </svg>
  );
}
