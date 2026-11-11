"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { formatUnits, txUrl, type Receipt } from "@/lib/useReceipt";

export default function LandingPage() {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/chain.json")
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<Receipt>;
      })
      .then(setReceipt)
      .catch(() => setFailed(true));
  }, []);

  const refused = receipt?.steps?.find((step) => step.code === "ERR_RECIPIENT");
  const paid = receipt?.steps?.find((step) => step.code === "OK" && /paid/i.test(step.label));

  return (
    <div className="market">
      <header className="market-bar">
        <Logo />
        <nav className="market-nav">
          <Link href="/book">The proof</Link>
          <Link className="btn" href="/sign-in">Open the desk</Link>
        </nav>
      </header>
      <main className="market-main">
        <p className="kicker"><span>NEAR testnet</span><span>Not Circle USDC</span></p>
        <h1>One sealed price. The contract pays that line, or it pays nothing.</h1>
        <p className="market-lead">
          Marlow Studio names a ceiling. Sable Field names a floor. The slip keeps only the price they both accept, the recipient, and one sentence. A different account, figure, or sentence moves 0.
        </p>
        <div className="market-actions">
          <Link className="btn" href="/sign-in">Open the desk</Link>
          <Link className="ghost" href="/book">See the proof</Link>
        </div>
        {failed && <p className="alert" role="alert">The testnet receipt did not load. The desk can still open.</p>}
        {!receipt && !failed && <p className="note">Reading the testnet receipt.</p>}
        {receipt && refused && paid && (
          <div className="market-proof">
            <div>
              <span>Wrong account</span>
              <b>{formatUnits(refused.moved ?? "0")}<small> tUSDC</small></b>
              <a className="mono" href={refused.hash ? txUrl(refused.hash) : "/book"}>{refused.code}</a>
            </div>
            <div>
              <span>Agreed line</span>
              <b>{formatUnits(paid.moved ?? "0")}<small> tUSDC</small></b>
              <a className="mono" href={paid.hash ? txUrl(paid.hash) : "/book"}>{paid.code}</a>
            </div>
            <div>
              <span>Contract</span>
              <b className="market-contract">{receipt.contract}</b>
              <span>Mainnet after an audit</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
