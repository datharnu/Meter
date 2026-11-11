"use client";

import { NearMark } from "@/components/NearMark";
import { formatUnits, txUrl, type Receipt } from "@/lib/useReceipt";

type State = "loading" | "empty" | "error" | "ready";

export function FramePreview({ state, receipt, onRetry }: { state: State; receipt: Receipt | null; onRetry: () => void }) {
  const steps = receipt?.steps ?? [];
  const refused = steps.find((step) => step.code === "ERR_RECIPIENT" && step.hash);
  const paid = steps.find((step) => step.code === "OK" && /paid/i.test(step.label) && step.hash);
  const amount = receipt ? formatUnits(receipt.amount) : "48.00";

  return (
    <figure className="craft-frame">
      <div className="craft-chrome">
        <span className="craft-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="mono craft-url">{receipt?.contract ?? "Reading the contract"}</span>
        <span className="craft-live"><NearMark variant="tile" />testnet</span>
      </div>
      {state === "loading" && <p className="craft-state">Reading the payment record.</p>}
      {state === "empty" && <p className="craft-state">No payment record in this build. The desk can still open.</p>}
      {state === "error" && (
        <p className="craft-state craft-state-bad" role="alert">
          The payment record did not load.
          <button className="text-btn" type="button" onClick={onRetry}>Try again</button>
        </p>
      )}
      {state === "ready" && refused?.hash && paid?.hash && (
        <div className="craft-split">
          <div className="craft-sheet">
            <p className="craft-kicker"><span>Sealed line</span><span>Meter {receipt?.meterId}</span></p>
            <p className="craft-amount">{amount}<small>tUSDC</small></p>
            <dl>
              <div><dt>Recipient</dt><dd className="mono">{receipt?.vendor}</dd></div>
              <div><dt>Sentence</dt><dd>{receipt?.evidence}</dd></div>
            </dl>
            <p className="craft-aside">Ceiling 60.00 and floor 48.00 stay in the browser. They are not on this line.</p>
          </div>
          <div className="craft-calls">
            <a href={txUrl(refused.hash)}>
              <span>Wrong account</span>
              <b>0.00</b>
              <small className="mono">ERR_RECIPIENT</small>
            </a>
            <a href={txUrl(paid.hash)}>
              <span>Sealed vendor</span>
              <b>{formatUnits(paid.moved ?? receipt?.amount ?? "0")}</b>
              <small className="mono">OK</small>
            </a>
          </div>
        </div>
      )}
      <figcaption>A judge opens the refusal. The other hash is the sealed line, paid once.</figcaption>
    </figure>
  );
}
