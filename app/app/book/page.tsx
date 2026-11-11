"use client";

import { ReceiptGate } from "@/components/ReceiptGate";
import { RunStats, RunTable } from "@/components/RunTable";
import { formatUnits, meterFor, useReceipt, type Receipt, type Step } from "@/lib/useReceipt";

function csv(receipt: Receipt, steps: Step[]) {
  const header = "date,meter,line,code,moved,hash";
  const body = steps.map((step) => {
    const cells = [
      receipt.at,
      String(meterFor(receipt, step)),
      step.label,
      step.code,
      formatUnits(step.moved ?? "0"),
      step.hash ?? "",
    ];
    return cells.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",");
  });
  return [header, ...body].join("\n");
}

export default function BookPage() {
  const { state, receipt, reload } = useReceipt();
  const steps = receipt?.steps ?? [];

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
      <div className="page-head">
        <div>
          <h1 className="page-title">The book</h1>
          <p className="lede">One recorded run. Every figure is counted from that receipt. Desk slips are not in this book.</p>
        </div>
        <button className="btn" type="button" onClick={download} disabled={!receipt}>Download CSV</button>
      </div>
      <ReceiptGate state={state} onRetry={reload} empty="No testnet receipt yet. The book stays empty until a run is recorded.">
        {receipt && (
          <>
            <RunStats steps={steps} />
            <RunTable receipt={receipt} steps={steps} />
            <p className="note">
              {receipt.contract}. The token is {receipt.token}, a public-mint test token, not Circle USDC. Every row shares {receipt.at.slice(0, 16).replace("T", " ")} UTC because the receipt records the run, not a clock on each line.
            </p>
          </>
        )}
      </ReceiptGate>
    </>
  );
}
