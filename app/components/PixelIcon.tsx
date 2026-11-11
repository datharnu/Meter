import { useId } from "react";

export function PixelIcon({ cells }: { cells: number[] }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className="pixel-icon" viewBox="0 0 16 16" width="32" height="32" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f4f7fa" />
          <stop offset="42%" stopColor="#9aa3ae" />
          <stop offset="100%" stopColor="#e7ebef" />
        </linearGradient>
      </defs>
      {cells.map((n) => (
        <rect key={n} x={(n % 4) * 4} y={Math.floor(n / 4) * 4} width="3" height="3" fill={`url(#${id})`} />
      ))}
    </svg>
  );
}
