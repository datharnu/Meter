"use client";

import { useMemo, useState } from "react";
import { decide, formatUsdc, parseUsdc } from "@/lib/rule.mjs";

const EVIDENCE = "Field report 04, price column at most 100";

const samples = [
  { id: "agreed", name: "Agreed line", recipient: "sable.testnet", amount: "48.00", evidence: EVIDENCE, open: true },
  { id: "account", name: "Another account", recipient: "other.testnet", amount: "48.00", evidence: EVIDENCE, open: true },
  { id: "figure", name: "A lower figure", recipient: "sable.testnet", amount: "47.00", evidence: EVIDENCE, open: true },
  { id: "note", name: "A rewritten note", recipient: "sable.testnet", amount: "48.00", evidence: "Field report 04, price column at most 90", open: true },
  { id: "day", name: "After the day", recipient: "sable.testnet", amount: "48.00", evidence: EVIDENCE, open: false },
];

const locked = {
  recipient: "sable.testnet",
  amount: 48_000_000,
  evidence: EVIDENCE,
  buyerSigned: true,
  vendorSigned: true,
  funded: 48_000_000,
  paid: 0,
  refunded: 0,
};

export default function ClausePage() {
  const [recipient, setRecipient] = useState(samples[0].recipient);
  const [amount, setAmount] = useState(samples[0].amount);
  const [evidence, setEvidence] = useState(samples[0].evidence);
  const [open, setOpen] = useState(true);
  const [picked, setPicked] = useState(samples[0].id);

  function apply(sample: (typeof samples)[number]) {
    setRecipient(sample.recipient);
    setAmount(sample.amount);
    setEvidence(sample.evidence);
    setOpen(sample.open);
    setPicked(sample.id);
  }

  const parsed = parseUsdc(amount);
  const now = open ? 0 : 2;
  const deadline = 1;
  const code = useMemo(() => {
    if (parsed == null) return null;
    return decide({ ...locked, deadline }, recipient.trim(), parsed, evidence.trim(), now);
  }, [parsed, recipient, evidence, now]);

  const moved = code === "OK" ? parsed ?? 0 : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">The line</h1>
          <p className="lede">Marlow’s ceiling was 60.00. Sable’s floor was 48.00. The slip is 48.00 to sable.testnet. This page does not send a transaction.</p>
        </div>
      </div>
      <div className="chips" role="group" aria-label="Sample lines">
        {samples.map((sample) => (
          <button key={sample.id} type="button" className="chip" data-on={picked === sample.id} onClick={() => apply(sample)}>
            {sample.name}
          </button>
        ))}
      </div>
      <div className="split">
        <form className="panel" onSubmit={(event) => event.preventDefault()}>
          <div className="kicker"><span>Marlow Studio</span><span>Sable Field</span></div>
          <label>
            Recipient
            <input value={recipient} onChange={(event) => { setRecipient(event.target.value); setPicked(""); }} autoComplete="off" />
          </label>
          <label>
            Figure
            <input value={amount} onChange={(event) => { setAmount(event.target.value); setPicked(""); }} inputMode="decimal" autoComplete="off" aria-invalid={parsed == null} />
          </label>
          <label>
            Sentence
            <textarea value={evidence} onChange={(event) => { setEvidence(event.target.value); setPicked(""); }} rows={4} />
          </label>
        </form>
        <aside className="panel sticky-side" aria-live="polite">
          <p className="kicker"><span>Answer</span><span>Browser copy</span></p>
          {parsed == null ? (
            <p className="alert" role="alert">Write the figure as dollars and cents, like 48.00.</p>
          ) : (
            <>
              <p className="amount">{formatUsdc(moved)}<span>tUSDC</span></p>
              <span className="tag" data-kind={code === "OK" ? "paid" : "refused"}>{code === "OK" ? "Clears" : "Stops"}</span>
              <p className="mono">{code}</p>
            </>
          )}
          <p className="note">The same branches run in the contract. The book is where those answers moved, or did not move, on testnet.</p>
        </aside>
      </div>
    </>
  );
}
