"use client";

import { ReceiptGate } from "@/components/ReceiptGate";
import { formatMoved, txUrl, useReceipt } from "@/lib/useReceipt";

export default function KeyPage() {
  const { state, receipt, reload } = useReceipt();
  const steps = receipt?.steps ?? [];

  return (
    <>
      <h1 className="page-title">The paying key</h1>
      <p className="lede">
        One key, added by the buyer, allowed to call release and nothing else. It cannot change the slip, take a refund, or install another key.
      </p>
      <ReceiptGate state={state} onRetry={reload} empty="No key to show until a testnet run records one.">
        {receipt && (
          <article className="sheet sheet-pad">
            <div className="kicker">
              <span>Function-call key</span>
              <span>Deleted</span>
            </div>
            <p className="amount key-state">Gone</p>
            <p className="break mono">{receipt.agentPublicKey ?? "No public key on this receipt."}</p>
            <div className="parties">
              <div className="party">
                <small>May call</small>
                <b>release</b>
                <span className="ellipsis mono" title={receipt.contract}>{receipt.contract}</span>
              </div>
              <div className="party">
                <small>Allowance</small>
                <b>0.50 NEAR</b>
                <span>Gas only. Not the invoice.</span>
              </div>
            </div>
            <p className="note">
              This key is the one on meter {receipt.meterId}. It stopped three lines, then paid 48.00. The buyer deleted it, and the next release never reached a block.
            </p>
            <ul className="ledger">
              {steps.filter((step) => !/deadline|return/i.test(step.label)).map((step) => (
                <li key={`${step.code}-${step.hash ?? step.label}`}>
                  <div>
                    <b>{step.label}</b>
                    <small className="mono">{step.code} · {formatMoved(step.moved ?? "0")}</small>
                    {step.detail ? <small className="detail">{step.detail}</small> : null}
                  </div>
                  {step.hash ? <a className="hash" href={txUrl(step.hash)}>{step.hash}</a> : null}
                </li>
              ))}
            </ul>
            <p className="note">
              Meter {receipt.refundMeter ?? 2} used a second key. It paid nothing, the balance went back to the buyer, and that key was deleted too. Its public key is not on this receipt.
            </p>
            <p className="note">
              <a href={`https://testnet.nearblocks.io/address/${receipt.contract}`}>Open the account</a>. It was deployed with no full-access key, and none remains.
            </p>
          </article>
        )}
      </ReceiptGate>
    </>
  );
}
