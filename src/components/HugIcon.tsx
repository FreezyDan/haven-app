import type { CSSProperties } from 'react';

interface HugIconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Custom "hug" icon — two figures embracing.
 * Lucide-style strokes (round caps) to match the app's icon set.
 */
export default function HugIcon({ size = 20, strokeWidth = 1.75, className, style }: HugIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* two heads leaning together */}
      <circle cx="8.5" cy="6.2" r="2.1" />
      <circle cx="15.5" cy="6.2" r="2.1" />
      {/* shared body / embrace */}
      <path d="M4.5 20.5v-2.6a4.4 4.4 0 0 1 4.4-4.4h6.2a4.4 4.4 0 0 1 4.4 4.4v2.6" />
      {/* arms wrapping around each other */}
      <path d="M7.2 13.8c1.6 1.9 3.4 2.8 5.4 2.8" />
      <path d="M16.8 13.8c-1.1 1.3-2.4 2.1-3.9 2.5" />
    </svg>
  );
}
