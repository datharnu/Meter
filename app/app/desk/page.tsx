"use client";

import Link from "next/link";
import { ReceiptGate } from "@/components/ReceiptGate";
import { RunStats, RunTable } from "@/components/RunTable";
import { formatUsdc, phase } from "@/lib/rule.mjs";
import { useDesk } from "@/lib/store";
import { useReceipt } from "@/lib/useReceipt";

export default function MetersPage() {
  const ready = useDesk((s) => s.ready);
  const meters = useDesk((s) => s.meters);
  const receipt = useReceipt();

  if (!ready) {
    return (
      <div className="skeleton" aria-busy="true" aria-live="polite">
        <p>Opening the desk</p>
        <span style={{ width: "24%" }} />
        <span />
        <span style={{ width: "70%" }} />
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Desk</h1>
          <p className="lede">The figures are one testnet run. Slips in this browser follow the same rule and move no tokens.</p>
        </div>
        <Link className="btn" href="/new">New slip</Link>
      </div>
      <ReceiptGate state={receipt.state} onRetry={receipt.reload} empty="No testnet receipt yet. The book stays empty until a run is recorded.">
        {receipt.receipt && (
          <>
            <RunStats steps={receipt.receipt.steps ?? []} />
            <RunTable receipt={receipt.receipt} steps={receipt.receipt.steps ?? []} />
          </>
        )}
      </ReceiptGate>
      <h2 className="section-title">This browser</h2>
      {meters.length === 0 ? (
        <div className="empty">
          <p>No slip in this browser yet. Seal one and it stays on this desk. It will not move tokens.</p>
          <Link className="btn" href="/new">Seal a slip</Link>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="ledger-table">
            <caption>Desk slips. No token moves.</caption>
            <thead>
              <tr>
                <th className="num">Amount</th>
                <th>Parties</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {meters.map((m) => {
                const status = m.paid > 0 ? "Paid" : m.refunded > 0 ? "Returned" : phase(m, m.clock);
                return (
                  <tr key={m.id}>
                    <td className="num" data-label="Amount"><Link className="mono" href={`/m/${m.id}`}>{formatUsdc(m.amount)} USDC</Link></td>
                    <td data-label="Parties"><span className="cell-value" title={`${m.buyerName} and ${m.vendorName}`}>{m.buyerName} and {m.vendorName}</span></td>
                    <td data-label="Status"><span className="tag" data-kind={m.paid > 0 ? "paid" : m.refunded > 0 ? "back" : "neutral"}>{status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
