"use client";

import { useMemo, useState } from "react";
import { decide, formatUsdc, parseUsdc } from "@/lib/rule.mjs";

const EVIDENCE = "Field report 04, price column at most 100";

const samples = [
  { id: "agreed", name: "Agreed line", recipient: "sable.testnet", amount: "48.00", evidence: EVIDENCE, now: 500 },
  { id: "early", name: "Before the time", recipient: "sable.testnet", amount: "48.00", evidence: EVIDENCE, now: 100 },
  { id: "account", name: "Another account", recipient: "other.testnet", amount: "48.00", evidence: EVIDENCE, now: 500 },
  { id: "figure", name: "A lower figure", recipient: "sable.testnet", amount: "47.00", evidence: EVIDENCE, now: 500 },
  { id: "note", name: "A rewritten note", recipient: "sable.testnet", amount: "48.00", evidence: "Field report 04, price column at most 90", now: 500 },
  { id: "day", name: "At the deadline", recipient: "sable.testnet", amount: "48.00", evidence: EVIDENCE, now: 1000 },
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
  notBefore: 400,
  deadline: 1000,
};

export default function ClausePage() {
  const [recipient, setRecipient] = useState(samples[0].recipient);
  const [amount, setAmount] = useState(samples[0].amount);
  const [evidence, setEvidence] = useState(samples[0].evidence);
  const [now, setNow] = useState(samples[0].now);
  const [picked, setPicked] = useState(samples[0].id);

  function apply(sample: (typeof samples)[number]) {
    setRecipient(sample.recipient);
    setAmount(sample.amount);
    setEvidence(sample.evidence);
    setNow(sample.now);
    setPicked(sample.id);
  }

  const parsed = parseUsdc(amount);
  const code = useMemo(() => {
    if (parsed == null) return null;
    return decide(locked, recipient.trim(), parsed, evidence.trim(), now);
  }, [parsed, recipient, evidence, now]);

  const moved = code === "OK" ? parsed ?? 0 : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">The line</h1>
          <p className="lede">The slip is 48.00 to sable.testnet. This preview clock pays only while 400 ≤ time &lt; 1000. This page does not send a transaction. After open, the recipient, the amount, the sentence, and the time cannot be edited.</p>
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
          <p className="note">The same branches run in contract-v2. A Clears mark here has no hash and moves nothing. The book is where those answers have a transaction.</p>
        </aside>
      </div>
    </>
  );
}
