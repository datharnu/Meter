export function Logo({ word = true }: { word?: boolean }) {
  return (
    <span className="logo">
      <svg className="logo-mark" viewBox="0 0 32 32" aria-hidden="true">
        <rect x="4" y="6" width="10" height="3" rx="1.2" />
        <rect x="4" y="23" width="10" height="3" rx="1.2" />
        <rect x="16" y="11" width="12" height="10" rx="2" />
      </svg>
      {word ? <span className="logo-word">Meter</span> : null}
    </span>
  );
}
