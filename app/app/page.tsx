"use client";

import Link from "next/link";
import { ChainPayment } from "@/components/ChainPayment";
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
      <h1 className="page-title">Desk</h1>
      <p className="lede">One slip, one price. The card is the testnet run. The rows under it live in this browser and do not move tokens.</p>
      <ol className="stops">
        <li><Link href="/new">Write a slip</Link><span>The sheet shows 48.00. The ceiling of 60.00 stays off it.</span></li>
        <li><Link href="/clause">Try a line</Link><span>Change the account, the figure, or the sentence. A mismatch stays at 0.00.</span></li>
        <li><Link href="/book">Read the book</Link><span>The same answers, as the transactions from one testnet run.</span></li>
        <li><Link href="/key">See the key</Link><span>It could call release. The buyer deleted it.</span></li>
      </ol>
      <ChainPayment />
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
