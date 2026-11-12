"use client";

import { formatMoved, txUrl, useReceipt, type Step } from "@/lib/useReceipt";

export function ChainPayment() {
  const { state, receipt, reload } = useReceipt();

  if (state === "loading") {
    return (
      <div className="skeleton" aria-busy="true" aria-live="polite">
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
        <button className="ghost" type="button" onClick={reload}>Try again</button>
      </div>
    );
  }
  if (state === "empty" || !receipt) {
    return (
      <div className="empty">
        <p>No testnet payment yet. The rows below are the desk. The desk does not move tokens.</p>
      </div>
    );
  }
  const usdc = (Number(receipt.amount) / 1_000_000).toFixed(2);
  const older: Array<Step | null> = [
    receipt.refused?.hash ? { label: "Wrong recipient refused", code: receipt.refused.code, hash: receipt.refused.hash, moved: "0" } : null,
    receipt.paid?.hash ? { label: `Paid ${receipt.vendor}`, code: receipt.paid.code, hash: receipt.paid.hash, moved: receipt.amount } : null,
  ];
  const steps = receipt.steps?.length ? receipt.steps : older.filter((step): step is Step => step != null);
  return (
    <article className="sheet sheet-pad chain">
      <div className="kicker">
        <span>Testnet proof</span>
        <span>Meter {receipt.meterId}</span>
      </div>
      <p className="amount">{usdc}<span>tUSDC</span></p>
      {steps.map((step) => (
        <div className="attempt" key={`${step.code}-${step.hash ?? step.label}`}>
          <div>
            <b>{step.label}</b>
            <small className="mono">{step.code}{step.moved != null ? ` · ${formatMoved(step.moved)}` : ""}</small>
            {step.detail ? <small className="detail">{step.detail}</small> : null}
          </div>
          {step.hash ? (
            <a className="ellipsis hash" href={txUrl(step.hash)} title={step.hash}>{step.hash}</a>
          ) : null}
        </div>
      ))}
      <p className="note">
        {receipt.evidence}. The paying key can call release and nothing else. The buyer deleted it. The token is {receipt.token}, a toy testnet token (public mint). The medbf5c run uses Circle testnet USDC. Mainnet waits on an audit.
      </p>
    </article>
  );
}
