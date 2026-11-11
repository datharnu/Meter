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

function means(code: string | null) {
  if (code === "OK") return "Which means the sealed line would clear. This page has no hash, so nothing is paid.";
  if (code === "ERR_NOT_YET") return "Which means 0.00 moves before the stored time.";
  if (code === "ERR_RECIPIENT") return "Which means the wrong account is paid nothing.";
  if (code === "ERR_AMOUNT") return "Which means 47.00 does not replace 48.00.";
  if (code === "ERR_EVIDENCE") return "Which means a rewritten sentence is paid nothing.";
  if (code === "ERR_TOO_LATE") return "Which means the deadline closed the payment.";
  return "Which means this line is not the sealed one.";
}

export function LinePreview() {
  const start = samples[1];
  const [recipient, setRecipient] = useState(start.recipient);
  const [amount, setAmount] = useState(start.amount);
  const [evidence, setEvidence] = useState(start.evidence);
  const [now, setNow] = useState(start.now);
  const [picked, setPicked] = useState(start.id);

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
              <p>{means(code)}</p>
            </>
          )}
          <p className="note">The answer comes from <span className="mono">app/lib/rule.mjs</span>, the same branches as <span className="mono">contract-v2</span>. A Clears mark here has no hash and moves nothing.</p>
        </aside>
      </div>
    </>
  );
}
