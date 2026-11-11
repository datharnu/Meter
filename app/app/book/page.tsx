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
    if (!receipt) return;
    const rows = [{ receipt, steps }];
    if (signed.receipt) rows.push({ receipt: signed.receipt, steps: signed.receipt.steps ?? [] });
    if (timed.receipt) rows.push({ receipt: timed.receipt, steps: timed.receipt.steps ?? [] });
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
          <p className="lede">Three recorded runs. Every figure is counted from those receipts. Desk slips are not in this book.</p>
        </div>
        <button className="btn" type="button" onClick={download} disabled={!receipt}>Download CSV</button>
      </div>
      <h2 className="section-title">Payment record</h2>
      <ReceiptGate state={state} onRetry={reload} empty="No testnet receipt yet. The book stays empty until a run is recorded.">
        {receipt && (
          <>
            <RunStats steps={steps} />
            <RunTable receipt={receipt} steps={steps} />
            <p className="note">
              <span className="mono break">{receipt.contract}</span>. The token is <span className="mono break">{receipt.token}</span>, a public-mint test token, not Circle USDC. Every row shares {receipt.at.slice(0, 16).replace("T", " ")} UTC because the receipt records the run, not a clock on each line.
            </p>
          </>
        )}
      </ReceiptGate>
      <h2 className="section-title">Signed release</h2>
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
      <h2 className="section-title">Time gate</h2>
      <ReceiptGate state={timed.state} onRetry={timed.reload} empty="No time gate on this build.">
        {timed.receipt && (
          <>
            <RunStats steps={timed.receipt.steps ?? []} />
            <RunTable receipt={timed.receipt} steps={timed.receipt.steps ?? []} caption="Lines from the time gate" />
            <p className="note">
              <span className="mono break">{timed.receipt.contract}</span>. Release pays after the stored time and before the deadline. An unregistered recipient stayed unpaid. After registration the same line paid 48.00 once. The time is not evidence the work was done. Once the time has passed, the spending key can pay immediately. Recorded {timed.receipt.at.slice(0, 16).replace("T", " ")} UTC.
            </p>
          </>
        )}
      </ReceiptGate>
    </>
  );
}
