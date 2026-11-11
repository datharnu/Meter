"use client";

import { formatUnits, meterFor, tally, txUrl, units, type Receipt, type Step } from "@/lib/useReceipt";

function kind(step: Step) {
  if (step.code.startsWith("ERR_") || step.code === "AccessKeyDoesNotExist") return "refused";
  if (/return/i.test(step.label)) return "back";
  if (step.code === "OK" && units(step.moved) > BigInt(0)) return "paid";
  return "neutral";
}

export function RunStats({ steps }: { steps: Step[] }) {
  const count = tally(steps);
  return (
    <div className="stats">
      <div className="stat">
        <span>Cleared</span>
        <b>{formatUnits(count.paid)}</b>
        <small>tUSDC</small>
      </div>
      <div className="stat">
        <span>Sent back</span>
        <b>{formatUnits(count.back)}</b>
        <small>tUSDC</small>
      </div>
      <div className="stat">
        <span>Stopped</span>
        <b>{count.stopped}</b>
        <small>lines, nothing moved</small>
      </div>
    </div>
  );
}

export function RunTable({ receipt, steps, caption = "Lines from the recorded testnet run" }: { receipt: Receipt; steps: Step[]; caption?: string }) {
  return (
    <div className="table-wrap">
      <table className="ledger-table ledger-run">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th>Line</th>
            <th>Meter</th>
            <th>Result</th>
            <th className="num">Moved</th>
            <th>Transaction</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step) => (
            <tr key={`${step.code}-${step.hash ?? step.label}`}>
              <td data-label="Line">
                <span className="cell-value">
                  <b>{step.label}</b>
                  {step.detail ? <small className="detail">{step.detail}</small> : null}
                </span>
              </td>
              <td data-label="Meter"><span className="cell-value mono">{meterFor(receipt, step)}</span></td>
              <td data-label="Result"><span className="cell-value"><span className="tag" data-kind={kind(step)}>{step.code}</span></span></td>
              <td className="num" data-label="Moved"><span className="cell-value mono">{formatUnits(step.moved ?? "0")}</span></td>
              <td data-label="Transaction">
                <span className="cell-value">
                  {step.hash ? (
                    <a className="hash" href={txUrl(step.hash)} title={step.hash}>{step.hash.slice(0, 8)}…{step.hash.slice(-6)}</a>
                  ) : (
                    <span className="muted">Rejected</span>
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
