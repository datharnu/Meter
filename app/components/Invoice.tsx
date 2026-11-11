"use client";

import { useEffect, useState } from "react";
import { formatUsdc, fund, phase, refund, release, sign } from "@/lib/rule.mjs";
import { useDesk } from "@/lib/store";
import type { Meter } from "@/lib/types";

const STEPS = ["Sealed", "Signed", "Locked", "Closed"] as const;

export function Invoice({ id }: { id: string }) {
  const ready = useDesk((s) => s.ready);
  const meter = useDesk((s) => s.meters.find((m) => m.id === id));
  const patch = useDesk((s) => s.patch);
  const pushAttempt = useDesk((s) => s.pushAttempt);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), 280);
    return () => clearTimeout(t);
  }, [id]);

  if (!ready || !show) {
    return (
      <div className="skeleton" aria-busy="true" aria-live="polite">
        <p>Opening this slip</p>
        <span style={{ width: "30%" }} />
        <span style={{ width: "55%" }} />
        <span />
      </div>
    );
  }
  if (!meter) {
    return (
      <div className="error" role="alert">
        <h1 className="page-title">This meter is not on the desk</h1>
        <p>It is not in this browser. A chain meter would load from the contract view, and a missing id would stay missing.</p>
      </div>
    );
  }
  return <Sheet meter={meter} patch={patch} pushAttempt={pushAttempt} />;
}

function Sheet({
  meter,
  patch,
  pushAttempt,
}: {
  meter: Meter;
  patch: (id: string, next: Partial<Meter>) => void;
  pushAttempt: (id: string, attempt: Meter["attempts"][number]) => void;
}) {
  const step = phase(meter, meter.clock);
  const paidWidth = meter.amount === 0 ? 0 : Math.round((meter.paid / meter.amount) * 100);
  const backWidth = meter.amount === 0 ? 0 : Math.round((meter.refunded / meter.amount) * 100);

  function copy() {
    return { ...meter, attempts: [...meter.attempts] };
  }

  function stampSign(who: "buyer" | "vendor") {
    const next = copy();
    if (sign(next, who) !== "OK") return;
    patch(meter.id, who === "buyer" ? { buyerSigned: true } : { vendorSigned: true });
  }

  function lock() {
    const next = copy();
    const result = fund(next, next.amount);
    if (result.code !== "OK" || result.kept === 0) return;
    patch(meter.id, { funded: next.funded });
  }

  function pay(recipient: string, label: string) {
    const next = copy();
    const result = release(next, recipient, next.amount, next.evidence, next.clock);
    if (result.code === "OK") patch(meter.id, { paid: result.moved });
    pushAttempt(meter.id, { id: crypto.randomUUID(), label, code: result.code, moved: result.moved });
  }

  function sendBack() {
    const next = copy();
    const result = refund(next, next.clock);
    if (result.code === "OK") patch(meter.id, { refunded: result.moved });
    pushAttempt(meter.id, {
      id: crypto.randomUUID(),
      label: "Return the balance to the buyer",
      code: result.code,
      moved: result.moved,
    });
  }

  const open = meter.paid === 0 && meter.refunded === 0;
  const late = meter.clock >= meter.deadline;

  const status = meter.paid > 0 ? "Paid" : meter.refunded > 0 ? "Returned" : step;
  const statusKind = meter.paid > 0 ? "paid" : meter.refunded > 0 ? "back" : "neutral";

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{meter.buyerName} and {meter.vendorName}</h1>
          <p className="lede">Desk slip {meter.id.slice(0, 8)}. No token moves on this page.</p>
        </div>
        <span className="tag" data-kind={statusKind}>{status}</span>
      </div>
      <div className="split">
        <article className="panel">
          <div className="steps" aria-label="Progress">
            {STEPS.map((name) => (
              <i key={name} data-on={name === step}>{name}</i>
            ))}
          </div>
          <p className="amount">{formatUsdc(meter.amount)}<span>USDC</span></p>
          <div className="bar" aria-hidden="true">
            <i className="paid" style={{ width: `${paidWidth}%` }} />
            <i className="back" style={{ width: `${backWidth}%` }} />
          </div>
          <div className="parties">
            <div className="party">
              <small>Buyer</small>
              <b>{meter.buyerName}</b>
              <code className="ellipsis" title={meter.buyer}>{meter.buyer}</code>
            </div>
            <div className="party">
              <small>Vendor</small>
              <b>{meter.vendorName}</b>
              <code className="ellipsis" title={meter.vendor}>{meter.vendor}</code>
            </div>
          </div>
          <div className="line">
            <div>
              <b>{meter.evidence}</b>
              <small>Evidence both sides sealed</small>
            </div>
            <code className="ellipsis" title={meter.recipient}>{meter.recipient}</code>
            <b className="mono">{formatUsdc(meter.amount)}</b>
          </div>
          {meter.attempts.filter((a) => a.code !== "OK").slice(-1).map((a) => (
            <span key={a.id} className="tag" data-kind="refused">{a.code}</span>
          ))}
          {meter.attempts.map((a) => (
            <div className="line" key={a.id}>
              <div>
                <b>{a.label}</b>
                <small className="mono">{a.code}</small>
              </div>
              <span />
              <b className="mono">{formatUsdc(a.moved)} USDC</b>
            </div>
          ))}
        </article>
        <aside className="panel sticky-side">
          <p className="kicker"><span>This desk</span><span>{step}</span></p>
          {open && meter.funded === 0 && (
            <div className="actions">
              <button className="ghost" type="button" disabled={meter.buyerSigned} onClick={() => stampSign("buyer")}>Sign as {meter.buyerName}</button>
              <button className="ghost" type="button" disabled={meter.vendorSigned} onClick={() => stampSign("vendor")}>Sign as {meter.vendorName}</button>
              <button className="btn" type="button" disabled={!meter.buyerSigned || !meter.vendorSigned || meter.funded > 0} onClick={lock}>Lock {formatUsdc(meter.amount)} USDC</button>
            </div>
          )}
          {step === "Locked" && !late && (
            <div className="actions">
              <button className="ghost" type="button" onClick={() => pay("other.testnet", "Pay a different recipient")}>Pay a different recipient</button>
              <button className="btn" type="button" onClick={() => pay(meter.recipient, `Pay ${meter.recipient}`)}>Pay {formatUsdc(meter.amount)} USDC</button>
              <button className="ghost" type="button" onClick={() => patch(meter.id, { clock: meter.deadline })}>Move the desk clock past the deadline</button>
            </div>
          )}
          {meter.funded > 0 && open && late && (
            <div className="dock">
              <button className="btn" type="button" onClick={sendBack}>Return {formatUsdc(meter.funded)} USDC to {meter.buyerName}</button>
            </div>
          )}
          {!open && <p>This slip is closed on the desk.</p>}
          <p className="note">The ceiling and the floor stayed off this sheet. The desk clock is not NEAR block time. A payment here is the rule, with no token moved.</p>
        </aside>
      </div>
    </>
  );
}
