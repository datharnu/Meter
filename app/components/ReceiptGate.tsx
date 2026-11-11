"use client";

export function ReceiptGate({
  state,
  onRetry,
  empty,
  children,
}: {
  state: "loading" | "empty" | "error" | "ready";
  onRetry: () => void;
  empty: string;
  children: React.ReactNode;
}) {
  if (state === "loading") {
    return (
      <div className="skeleton" aria-busy="true" aria-live="polite">
        <p>Reading the testnet receipt</p>
        <span style={{ width: "28%" }} />
        <span style={{ width: "70%" }} />
        <span />
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="error" role="alert">
        <p>The testnet receipt did not load.</p>
        <button className="ghost" type="button" onClick={onRetry}>Try again</button>
      </div>
    );
  }
  if (state === "empty") {
    return (
      <div className="empty">
        <p>{empty}</p>
      </div>
    );
  }
  return children;
}
