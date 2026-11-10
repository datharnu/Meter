"use client";

import Link from "next/link";
import { formatUsdc, phase } from "@/lib/rule.mjs";
import { useDesk } from "@/lib/store";

export default function MetersPage() {
  const ready = useDesk((s) => s.ready);
  const meters = useDesk((s) => s.meters);
  if (!ready) {
    return (
      <div className="skeleton" aria-busy="true">
        <span style={{ width: "24%" }} />
        <span />
        <span style={{ width: "70%" }} />
      </div>
    );
  }
  return (
    <>
      <h1 className="page-title">Meters</h1>
      <p className="lede">Each row is one sealed price. Open it to sign, lock, pay, or send the money back.</p>
      {meters.length === 0 ? (
        <div className="empty">
          <p>No meter yet.</p>
          <Link className="btn" href="/new" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Start a meter</Link>
        </div>
      ) : (
        <div className="rows">
          {meters.map((m) => (
            <Link className="row" key={m.id} href={`/m/${m.id}`}>
              <b className="mono">{formatUsdc(m.amount)} USDC</b>
              <span className="ellipsis" title={`${m.buyerName} and ${m.vendorName}`}>{m.buyerName} and {m.vendorName}</span>
              <span>{m.paid > 0 ? "Paid" : m.refunded > 0 ? "Returned" : phase(m, m.clock)}</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
