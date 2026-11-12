"use client";

import { useEffect, useState } from "react";
import { attackById, broadcastTrial, outcomeWord, type InjectReceipt } from "@/lib/hijack";
import { formatUnits, txUrl } from "@/lib/useReceipt";

function shortHash(hash: string) {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

export function Tripwire({ receipt }: { receipt: InjectReceipt }) {
  const [reduce, setReduce] = useState(false);
  const burn = attackById(receipt, 7);
  const honest = attackById(receipt, 8);
  const paid = broadcastTrial(honest);
  const filled = [1, 2, 3, 4, 5].map((pip) => (burn?.trials ?? []).some((trial) => trial.broadcast && (trial.refusals ?? 0) >= pip));

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduce(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  return (
    <section className="pitch-section" id="tripwire" aria-labelledby="trip-title">
      <header className="craft-intro">
        <p className="craft-eyebrow">The tripwire</p>
        <h2 id="trip-title">Five refusals delete the key. The tokens stay.</h2>
      </header>
      <ol className="hijack-trip" data-reduce={reduce ? "true" : "false"} aria-label="What the poisoned invoice did to the key">
        <li><b>Hijacked</b><span>The note named {receipt.attacker || "another account"}.</span></li>
        <li>
          <b>Five refusals</b>
          <span className="hijack-pips" aria-label={`${filled.filter(Boolean).length} refusals recorded`}>
            {filled.map((on, index) => <i key={index} data-on={on ? "true" : "false"} />)}
          </span>
        </li>
        <li>
          <b>Key deleted</b>
          {burn?.keysAfterBurn === 0 ? (
            <span>Access-key list empty. {burn.nextCall?.code}. {burn.burnHash ? <a className="mono" href={txUrl(burn.burnHash)}>{shortHash(burn.burnHash)}</a> : null}</span>
          ) : <span>This receipt does not show an empty key list.</span>}
        </li>
        <li>
          <b>Buyer reinstalls</b>
          <span>{honest?.reinstallHash ? <a className="mono" href={txUrl(honest.reinstallHash)}>{shortHash(honest.reinstallHash)}</a> : "No reinstall hash in this receipt."}</span>
        </li>
        <li>
          <b>Honest invoice</b>
          <span>{outcomeWord(honest?.moneyMoved)} {formatUnits(honest?.moneyMoved ?? "0")}. {paid?.hash ? <a className="mono" href={txUrl(paid.hash)}>{shortHash(paid.hash)}</a> : "No payment hash."}</span>
        </li>
      </ol>
      <p className="hijack-caption">The poisoned invoice can burn the key. It cannot touch the tokens.</p>
    </section>
  );
}
