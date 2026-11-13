"use client";

import { useEffect, useState } from "react";
import { attackById, broadcastTrial, outcomeWord, type InjectReceipt } from "@/lib/hijack";
import { formatUnits, txUrl, type Step } from "@/lib/useReceipt";

function shortHash(hash: string) {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

type TripwireReceipt = {
  contract: string;
  steps?: Step[];
};

export function Tripwire({ receipt }: { receipt: InjectReceipt }) {
  const [reduce, setReduce] = useState(false);
  const [v3Trip, setV3Trip] = useState<TripwireReceipt | null>(null);
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

  useEffect(() => {
    const controller = new AbortController();
    fetch("/v3-tripwire.json", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<TripwireReceipt>;
      })
      .then((body) => setV3Trip(body))
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setV3Trip(null);
      });
    return () => controller.abort();
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
            <span>Access-key list empty. The promise receipt is DeleteKey. {burn.burnHash ? <a className="mono" href={txUrl(burn.burnHash)}>{shortHash(burn.burnHash)}</a> : null} The transaction status is empty.{burn.nextCall?.code ? ` The next call returned ${burn.nextCall.code}.` : ""}</span>
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
      {v3Trip?.contract && v3Trip.steps ? (() => {
        const steps = v3Trip.steps;
        const fifth = steps.find((step) => step.label === "Release 5 before time");
        const reinstall = steps.find((step) => step.label === "Reinstall agent");
        const pay = steps.find((step) => step.label === "Second pay on tripwire meter");
        const shortContract = v3Trip.contract.replace(".mtrfc658fd1.testnet", "");
        return (
          <p className="note">
            Recorded again on the current build ({shortContract}): the fifth refusal returned <span className="mono">ERR_NOT_YET</span> and the <span className="mono">BURNED</span> key event
            {fifth?.hash ? <> ({<a className="mono" href={txUrl(fifth.hash)}>{shortHash(fifth.hash)}</a>})</> : null}
            ; the next call failed with <span className="mono">AccessKeyDoesNotExist</span>; reinstall
            {reinstall?.hash ? <> ({<a className="mono" href={txUrl(reinstall.hash)}>{shortHash(reinstall.hash)}</a>})</> : null}
            , then a {formatUnits(pay?.moved ?? "0")} USDC payment
            {pay?.hash ? <> ({<a className="mono" href={txUrl(pay.hash)}>{shortHash(pay.hash)}</a>})</> : null}
            .
          </p>
        );
      })() : null}
      <p className="hijack-caption">The poisoned invoice can burn the key. It cannot touch the tokens.</p>
    </section>
  );
}
