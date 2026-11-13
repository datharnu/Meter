"use client";

import { useState } from "react";
import Link from "next/link";

const DEFAULT = {
  meter: "medbf5c.mtrfc658fd1.testnet",
  id: "1",
  recipient: "u2bfe17.mtrfc658fd1.testnet",
  amount: "2000000",
  sentence: "Field report 04, price column at most 100",
};

export default function CheckPage() {
  const [form, setForm] = useState(DEFAULT);
  const [result, setResult] = useState<{ code?: string; wouldMove?: string; error?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setResult(null);
    const qs = new URLSearchParams(form);
    try {
      const response = await fetch(`/api/preview?${qs}`);
      const body = await response.json();
      setResult(body);
    } catch {
      setResult({ error: "Request failed" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <p className="kicker">View call</p>
          <h1 className="page-title">Check a call</h1>
          <p className="lede">
            This calls <span className="mono">preview</span> on NEAR testnet with the same arguments as <span className="mono">release</span>.
            No key. No transaction. It does not count toward the five-refusal tripwire.
          </p>
        </div>
      </header>
      <form className="panel form-narrow" onSubmit={run}>
        <div className="form-grid">
          <label>Meter contract<input value={form.meter} onChange={(e) => setForm({ ...form, meter: e.target.value })} spellCheck={false} /></label>
          <label>Meter id<input value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} inputMode="numeric" spellCheck={false} /></label>
          <label>Recipient<input value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} spellCheck={false} /></label>
          <label>Amount (base units)<input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} inputMode="numeric" spellCheck={false} /></label>
        </div>
        <label>Sentence<input value={form.sentence} onChange={(e) => setForm({ ...form, sentence: e.target.value })} spellCheck={false} /></label>
        <button className="btn" type="submit" disabled={loading}>{loading ? "Calling…" : "Run preview"}</button>
        {result && (
          <div className="check-result" role="status">
            {result.error ? <p className="alert" role="alert">{result.error}</p> : (
              <>
                <p className="mono">{result.code}</p>
                <p>{result.wouldMove === "0.00" ? "0.00 would move" : result.wouldMove}</p>
              </>
            )}
          </div>
        )}
        <p className="note">
          Defaults are <span className="mono">poke</span> meter <strong>1</strong> on{" "}
          <span className="mono">medbf5c.mtrfc658fd1.testnet</span> — funded <strong>2.00 USDC</strong>, unpaid, deadline{" "}
          <strong>2026-11-20T09:53:42.339Z</strong>. This is a live contract: never call <span className="mono">release</span> or{" "}
          <span className="mono">refund</span> on it from a key. After the deadline anyone can <span className="mono">refund</span> meter 1 and
          on-chain state (and <span className="mono">preview</span>) may differ from what you see on the 19th or 20th.
        </p>
        <p className="note">CLI: <span className="mono break">node chain/check.mjs</span> with no flags uses the same defaults.</p>
        <p className="note"><Link href="/attack">The hijack</Link> · <Link href="/bench">Bench</Link></p>
      </form>
    </>
  );
}
