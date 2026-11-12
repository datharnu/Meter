"use client";

import { ReceiptGate } from "@/components/ReceiptGate";
import { RunStats, RunTable } from "@/components/RunTable";
import { formatUnits, meterFor, useReceipt, type Receipt, type Step } from "@/lib/useReceipt";

function csv(rows: { receipt: Receipt; steps: Step[] }[]) {
  const header = "run,date,contract,meter,line,code,moved,hash";
  const body = rows.flatMap(({ receipt, steps }) => steps.map((step) => {
    const cells = [
      receipt.notBefore ? "time gate" : receipt.model ? "signed release" : "payment record",
      receipt.at,
      receipt.contract,
      String(meterFor(receipt, step)),
      step.label,
      step.code,
      formatUnits(step.moved ?? "0"),
      step.hash ?? "",
    ];
    return cells.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",");
  }));
  return [header, ...body].join("\n");
}

export default function BookPage() {
  const { state, receipt, reload } = useReceipt();
  const signed = useReceipt("/tee.json");
  const timed = useReceipt("/v2.json");
  const steps = receipt?.steps ?? [];

  function download() {
    if (!receipt && !signed.receipt && !timed.receipt) return;
    const rows: { receipt: Receipt; steps: Step[] }[] = [];
    if (timed.receipt) rows.push({ receipt: timed.receipt, steps: timed.receipt.steps ?? [] });
    if (receipt) rows.push({ receipt, steps });
    if (signed.receipt) rows.push({ receipt: signed.receipt, steps: signed.receipt.steps ?? [] });
    const blob = new Blob([csv(rows)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "meter-book.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">The book</h1>
          <p className="lede">The time gate is the current contract. The older runs are below it. Every figure is counted from a receipt. Desk slips are not in this book.</p>
        </div>
        <button className="btn" type="button" onClick={download} disabled={!receipt && !signed.receipt && !timed.receipt}>Download CSV</button>
      </div>
      <section className="desk-band desk-now" aria-labelledby="book-time">
        <p className="desk-kicker">Current contract</p>
        <h2 id="book-time" className="section-title">Time gate</h2>
      <ReceiptGate state={timed.state} onRetry={timed.reload} empty="No time gate on this build.">
        {timed.receipt && (
          <>
            <RunStats steps={timed.receipt.steps ?? []} />
            <RunTable receipt={timed.receipt} steps={timed.receipt.steps ?? []} caption="Lines from the time gate" />
            <p className="note">
              <span className="mono break">{timed.receipt.contract}</span>. Release pays only while stored time ≤ block time &lt; deadline. An unregistered recipient stayed unpaid. After registration the same line paid 48.00 once. A deposit at or after the deadline is rejected. The refund on this contract is unit-tested, because meter 1 was paid before its deadline. The time is a clock, not proof the work was done. Recorded {timed.receipt.at.slice(0, 16).replace("T", " ")} UTC.
            </p>
          </>
        )}
      </ReceiptGate>
      </section>
      <section className="desk-band" aria-labelledby="book-record">
      <h2 id="book-record" className="section-title">Payment record</h2>
      <ReceiptGate state={state} onRetry={reload} empty="No testnet receipt yet. The book stays empty until a run is recorded.">
        {receipt && (
          <>
            <RunStats steps={steps} />
            <RunTable receipt={receipt} steps={steps} />
            <p className="note">
              <span className="mono break">{receipt.contract}</span>. The token is <span className="mono break">{receipt.token}</span>, a toy testnet token (public mint). The medbf5c run uses Circle testnet USDC. The refund on this contract is on chain. Every row shares {receipt.at.slice(0, 16).replace("T", " ")} UTC because the receipt records the run, not a clock on each line.
            </p>
          </>
        )}
      </ReceiptGate>
      </section>
      <section className="desk-band desk-cool" aria-labelledby="book-signed">
        <p className="desk-kicker">Older run</p>
        <h2 id="book-signed" className="section-title">Signed release</h2>
      <ReceiptGate state={signed.state} onRetry={signed.reload} empty="No signed release on this build.">
        {signed.receipt && (
          <>
            <RunStats steps={signed.receipt.steps ?? []} />
            <RunTable receipt={signed.receipt} steps={signed.receipt.steps ?? []} caption="Lines from the signed release" />
            <p className="note">
              <span className="mono break">{signed.receipt.contract}</span>. Model <span className="mono">{signed.receipt.model}</span>. Signer <span className="mono break">{signed.receipt.signer}</span>. The Intel quote was not checked. A matching signature pays as soon as the meter is funded. Deleting the key loses if that payment lands first. Recorded {signed.receipt.at.slice(0, 16).replace("T", " ")} UTC.
            </p>
          </>
        )}
      </ReceiptGate>
      </section>
    </>
  );
}
