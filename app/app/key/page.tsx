"use client";

import { ReceiptGate } from "@/components/ReceiptGate";
import { formatUnits, txUrl, useReceipt } from "@/lib/useReceipt";

export default function KeyPage() {
  const { state, receipt, reload } = useReceipt();
  const calls = (receipt?.steps ?? []).filter((step) => !/deadline|return/i.test(step.label));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">The paying key</h1>
          <p className="lede">One key, added by the buyer. It can call release and nothing else.</p>
        </div>
        <span className="tag" data-kind="refused">Deleted</span>
      </div>
      <ReceiptGate state={state} onRetry={reload} empty="No key to show until a testnet run records one.">
        {receipt && (
          <>
            <div className="stats">
              <div className="stat">
                <span>May call</span>
                <b>release</b>
                <small>Nothing else</small>
              </div>
              <div className="stat">
                <span>Allowance</span>
                <b>0.50</b>
                <small>NEAR, gas only</small>
              </div>
              <div className="stat">
                <span>Status</span>
                <b>Gone</b>
                <small>No key remains</small>
              </div>
            </div>
            <div className="panel">
              <p className="kicker"><span>Public key</span><span>Meter {receipt.meterId}</span></p>
              <p className="scroll-id mono">{receipt.agentPublicKey ?? "No public key on this receipt."}</p>
              <p className="note">
                Account <span className="mono">{receipt.contract}</span>. It stopped three lines, then paid 48.00. The buyer deleted it. The next release never reached a block.
              </p>
            </div>
            <h2 className="section-title">Calls with this key</h2>
            <div className="table-wrap">
              <table className="ledger-table ledger-key">
                <caption>Meter {receipt.meterId} only. Meter {receipt.refundMeter ?? 2} used a second key, which is not on this receipt.</caption>
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>Result</th>
                    <th className="num">Moved</th>
                    <th>Transaction</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.map((step) => (
                    <tr key={`${step.code}-${step.hash ?? step.label}`}>
                      <td data-label="Line">
                        <span className="cell-value">
                          <b>{step.label}</b>
                          {step.detail ? <small className="detail">{step.detail}</small> : null}
                        </span>
                      </td>
                      <td data-label="Result"><span className="cell-value"><span className="tag" data-kind={step.code.startsWith("ERR_") || step.code === "AccessKeyDoesNotExist" ? "refused" : step.code === "OK" && Number(step.moved) > 0 ? "paid" : "neutral"}>{step.code}</span></span></td>
                      <td className="num" data-label="Moved"><span className="cell-value mono">{formatUnits(step.moved ?? "0")}</span></td>
                      <td data-label="Transaction">
                        <span className="cell-value">
                          {step.hash ? <a className="hash" href={txUrl(step.hash)} title={step.hash}>{step.hash.slice(0, 8)}…{step.hash.slice(-6)}</a> : <span className="muted">Rejected</span>}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="note">
              <a href={`https://testnet.nearblocks.io/address/${receipt.contract}`}>Open the account</a>. It was deployed with no full-access key, and none remains.
            </p>
          </>
        )}
      </ReceiptGate>
    </>
  );
}
