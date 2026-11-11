"use client";

import { ReceiptGate } from "@/components/ReceiptGate";
import { formatMoved, meterFor, txUrl, useReceipt, type Receipt, type Step } from "@/lib/useReceipt";

function sums(steps: Step[]) {
  const paid = steps.filter((step) => step.code === "OK" && /paid/i.test(step.label));
  const back = steps.filter((step) => /return/i.test(step.label));
  const stopped = steps.filter((step) => step.code.startsWith("ERR_"));
  const total = (rows: Step[]) => rows.reduce((sum, step) => sum + Number(step.moved ?? "0"), 0);
  return { paid: total(paid), back: total(back), stopped: stopped.length };
}

function csv(receipt: Receipt, steps: Step[]) {
  const header = "date,meter,line,code,moved,hash";
  const body = steps.map((step) => {
    const cells = [
      receipt.at,
      String(meterFor(receipt, step)),
      step.label,
      step.code,
      (Number(step.moved ?? "0") / 1_000_000).toFixed(2),
      step.hash ?? "",
    ];
    return cells.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",");
  });
  return [header, ...body].join("\n");
}

export default function BookPage() {
  const { state, receipt, reload } = useReceipt();
  const steps = receipt?.steps ?? [];
  const tally = sums(steps);

  function download() {
    if (!receipt) return;
    const blob = new Blob([csv(receipt, steps)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "meter-book.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <h1 className="page-title">The book</h1>
      <p className="lede">
        One recorded run on NEAR testnet. The figures below are counted from that receipt. Desk slips in this browser are not in the book.
      </p>
      <ReceiptGate state={state} onRetry={reload} empty="No testnet receipt yet. The book stays empty until a run is recorded.">
        {receipt && (
          <>
            <div className="stats">
              <div className="stat">
                <b>{(tally.paid / 1_000_000).toFixed(2)}</b>
                <span>Cleared, tUSDC</span>
              </div>
              <div className="stat">
                <b>{(tally.back / 1_000_000).toFixed(2)}</b>
                <span>Sent back, tUSDC</span>
              </div>
              <div className="stat">
                <b>{tally.stopped}</b>
                <span>Lines stopped, nothing moved</span>
              </div>
            </div>
            <div className="sheet sheet-pad chain">
              <div className="kicker plain">
                <span>{receipt.contract}</span>
                <span>{new Date(receipt.at).toISOString().slice(0, 16).replace("T", " ")} UTC</span>
              </div>
              <ul className="ledger">
                {steps.map((step) => (
                  <li key={`${step.code}-${step.hash ?? step.label}`}>
                    <div>
                      <b>{step.label}</b>
                      <small className="mono">Meter {meterFor(receipt, step)} · {step.code} · {formatMoved(step.moved ?? "0")}</small>
                      {step.detail ? <small className="detail">{step.detail}</small> : null}
                    </div>
                    {step.hash ? (
                      <a className="hash" href={txUrl(step.hash)}>{step.hash}</a>
                    ) : step.detail ? null : (
                      <span className="hash muted">No transaction. The network rejected the key.</span>
                    )}
                  </li>
                ))}
              </ul>
              <div className="actions">
                <button className="btn" type="button" onClick={download}>Download the book</button>
              </div>
              <p className="note">
                The token is {receipt.token}, a public-mint test token, not Circle USDC. Every row shares one timestamp because the receipt records the run, not a clock on each line.
              </p>
            </div>
          </>
        )}
      </ReceiptGate>
    </>
  );
}
