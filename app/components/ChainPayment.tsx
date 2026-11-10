"use client";

import { useEffect, useState } from "react";

type Receipt = {
  network: string;
  contract: string;
  token: string;
  buyer: string;
  vendor: string;
  meterId: number;
  amount: string;
  evidence: string;
  refused: { hash: string; code: string };
  paid: { hash: string; code: string };
  vendorBalance: string;
  at: string;
};

function txUrl(hash: string) {
  return `https://testnet.nearblocks.io/txns/${hash}`;
}

export function ChainPayment() {
  const [state, setState] = useState<"loading" | "empty" | "error" | "ready">("loading");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let gone = false;
    setState("loading");
    fetch("/chain.json")
      .then(async (response) => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<Receipt>;
      })
      .then((body) => {
        if (gone) return;
        if (!body?.paid?.hash) {
          setState("empty");
          return;
        }
        setReceipt(body);
        setState("ready");
      })
      .catch(() => {
        if (!gone) setState("error");
      });
    return () => {
      gone = true;
    };
  }, [attempt]);

  if (state === "loading") {
    return (
      <div className="skeleton" aria-busy="true" aria-live="polite">
        <span style={{ width: "28%" }} />
        <span style={{ width: "70%" }} />
        <span />
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="error" role="alert">
        <p>The testnet receipt did not load.</p>
        <button className="ghost" type="button" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
      </div>
    );
  }
  if (state === "empty" || !receipt) {
    return (
      <div className="empty">
        <p>No testnet payment yet. The rows below are the desk. The desk does not move tokens.</p>
      </div>
    );
  }
  const usdc = (Number(receipt.amount) / 1_000_000).toFixed(2);
  return (
    <article className="sheet sheet-pad chain">
      <div className="kicker">
        <span>Testnet payment</span>
        <span>Meter {receipt.meterId}</span>
      </div>
      <p className="amount">{usdc}<span>tUSDC</span></p>
      <div className="stamp" data-kind="paid">Paid</div>
      <div className="attempt">
        <div>
          <b>Wrong recipient refused</b>
          <small className="mono">{receipt.refused.code}</small>
        </div>
        <a className="ellipsis hash" href={txUrl(receipt.refused.hash)} title={receipt.refused.hash}>{receipt.refused.hash}</a>
      </div>
      <div className="attempt">
        <div>
          <b>Paid {receipt.vendor}</b>
          <small className="mono">{receipt.paid.code} · vendor holds {usdc}</small>
        </div>
        <a className="ellipsis hash" href={txUrl(receipt.paid.hash)} title={receipt.paid.hash}>{receipt.paid.hash}</a>
      </div>
      <p className="note">
        {receipt.evidence}. The token account is {receipt.token}. It is a test token with a public mint, not Circle USDC. The meter account {receipt.contract} has no access key. Mainnet waits on an audit.
      </p>
    </article>
  );
}
