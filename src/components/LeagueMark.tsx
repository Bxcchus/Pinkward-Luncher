export function LeagueMark({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      className={`league-mark ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M54.16,13.81a34.84,34.84,0,0,1,26.5,47.9,34.42,34.42,0,0,1-5.52,9H86.88A44.42,44.42,0,0,0,54.16,4.1Z" />
      <path d="M20.27,82.37v-14a34.61,34.61,0,0,1-6.48-20.23,34.61,34.61,0,0,1,6.48-20.24V14a44.4,44.4,0,0,0,0,68.41Z" />
      <polygon points="47.5 0.06 22.06 0.06 26.92 10.01 26.92 86.29 22.11 96.13 79.78 96.13 85.05 77.32 47.5 77.32 47.5 0.06" />
    </svg>
  );
}
