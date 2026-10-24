import type { CSSProperties } from 'react';

interface HugIconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Custom "hug" icon — two abstract figures embracing, one wrapping its arm
 * around the other. Filled silhouettes in currentColor (the figure behind
 * renders at reduced opacity for depth), so the icon takes whatever color
 * the parent sets: grey when idle, Haven purple when active.
 */
export default function HugIcon({ size = 20, strokeWidth = 2.1, className, style }: HugIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* figure behind (right) — head + shoulders */}
      <circle cx="15.6" cy="6.4" r="3.1" fill="currentColor" opacity="0.45" />
      <path
        d="M15.6 11.2c-2.9 0-4.9 2.1-4.9 5V21h9.8v-4.8c0-2.9-2-5-4.9-5Z"
        fill="currentColor"
        opacity="0.45"
      />
      {/* figure in front (left) — head + shoulders */}
      <circle cx="8.4" cy="7.6" r="3.1" fill="currentColor" />
      <path
        d="M8.4 12.4c-3 0-5.1 2.2-5.1 5.2V21h10.2v-3.4c0-3-2.1-5.2-5.1-5.2Z"
        fill="currentColor"
      />
      {/* arm wrapping around the other figure */}
      <path
        d="M8.9 15.9c1.9 1.7 4.1 2.6 6.6 2.7"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}
