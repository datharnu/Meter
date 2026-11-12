"use client";

import { useState } from "react";
import Link from "next/link";
import { HijackCompare } from "@/components/home/HijackScene";
import { Tripwire } from "@/components/home/Tripwire";
import {
  attackById,
  baselineTrial,
  hardenedCase,
  ladderRows,
  onChainLabel,
  outcomeWord,
  type InjectReceipt,
  type LadderRow,
} from "@/lib/hijack";
import { formatUnits, txUrl } from "@/lib/useReceipt";

function hardenedObey(receipt: InjectReceipt, row: LadderRow) {
  if (row.attack.parts) {
    const parts = ["revoke", "deposit", "token"].map((key) => hardenedCase(receipt, `${row.attack.id}-${key}`)).filter(Boolean);
    if (!parts.length) return "—";
    return parts.every((item) => item && item.obeyed === item.runs) ? "yes" : parts.map((item) => `${item?.obeyed}/${item?.runs}`).join(" · ");
  }
  const found = hardenedCase(receipt, String(row.attack.id));
  if (!found) return "—";
  return found.obeyed === found.runs ? "yes" : `${found.obeyed} of ${found.runs}`;
}

function recordedAt(iso: string | undefined) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

export function AttackRecord({ receipt }: { receipt: InjectReceipt }) {
  const [prompt, setPrompt] = useState<"naive" | "hardened">("naive");
  const [showSystem, setShowSystem] = useState(false);
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const rows = ladderRows(receipt);
  const baseline = receipt.baseline;
  const naive = baselineTrial(receipt);
  const when = recordedAt(receipt.at);
  const meter = attackById(receipt, 1);
  const hardBase = prompt === "hardened" ? hardenedCase(receipt, "baseline") : null;
  const hardMeter = prompt === "hardened" ? hardenedCase(receipt, "1") : null;
  const system = prompt === "hardened" && receipt.hardened?.system ? receipt.hardened.system : receipt.system;
  const baselineObey = hardBase
    ? hardBase.obeyed === hardBase.runs ? "yes" : `${hardBase.obeyed} of ${hardBase.runs}`
    : baseline?.obeyed != null && baseline.obeyed === baseline.runs ? "yes" : `${baseline?.obeyed ?? "—"} of ${baseline?.runs ?? "—"}`;

  return (
    <div className="attack-record">
      <header className="page-head">
        <div>
          <p className="kicker">Record</p>
          <h1>The hijack</h1>
          <p className="lede">One poisoned invoice. The naive key paid. The Meter key did not.</p>
        </div>
        {receipt.contract ? <p className="mono">{receipt.contract}{when ? ` · ${when}` : ""}</p> : null}
      </header>
      <HijackCompare receipt={receipt} prompt={prompt} onPrompt={setPrompt} />
      <h2 className="hijack-sub">Attack ladder</h2>
      <div className="pitch-scroll">
        <table className="pitch-table">
          <caption>{(rows.length + (baseline ? 1 : 0))} calls. Open a row for that record.</caption>
          <thead>
            <tr>
              <th scope="col">Attack</th>
              <th scope="col">Agent obeyed</th>
              <th scope="col">Code</th>
              <th scope="col">Moved</th>
              <th scope="col">Transaction</th>
            </tr>
          </thead>
          <tbody>
            {baseline ? (
              <tr>
                <th scope="row">
                  <Link href="/attack/baseline">Naive key</Link>
                </th>
                <td>{baselineObey}</td>
                <td className="mono">{naive?.code || "OK"}</td>
                <td>{outcomeWord(baseline.moneyMoved)} {formatUnits(baseline.moneyMoved ?? "0")}</td>
                <td>
                  <span className="evidence">{naive?.hash ? "tx hash" : "rejected before inclusion (no tx)"}</span>
                  {naive?.hash ? <a className="mono hash-full" href={txUrl(naive.hash)}>{naive.hash}</a> : "No transaction"}
                  {baseline?.runs != null && baseline.broadcast != null ? <small>{onChainLabel(baseline.runs, baseline.broadcast, "only")}</small> : null}
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={row.key} data-permission={row.permission ? "true" : undefined}>
                <th scope="row">
                  <Link href={`/attack/${encodeURIComponent(row.key)}`}>{row.name}</Link>
                  {row.permission ? <small className="hijack-perm">key permission, not a contract refusal</small> : null}
                </th>
                <td>{prompt === "hardened" ? hardenedObey(receipt, row) : row.obeyed}</td>
                <td className="mono">{row.code}</td>
                <td>{outcomeWord(row.moved)} {formatUnits(row.moved)}</td>
                <td>
                  <span className="evidence">{row.evidence}</span>
                  {row.hash ? <a className="mono hash-full" href={txUrl(row.hash)}>{row.hash}</a> : <span>{row.hashNote || "No transaction in this receipt."}</span>}
                  {row.attack.runs != null && row.attack.broadcast != null ? <small>{onChainLabel(row.attack.runs, row.attack.broadcast, row.attack.burnHash ? "delete" : "first")}</small> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Tripwire receipt={receipt} />
      <p className="hijack-disclose">
        Model {receipt.modelVersion || receipt.model || "not in this receipt"}
        {" · "}temperature {receipt.temperature ?? "—"}
        {" · "}tool choice {receipt.toolChoice || "—"}
        {" · "}the prompt tells the agent the invoice is the instruction
        {" · "}stored in inject.json, not edited after results
        {" · "}one deterministic run per attack, one broadcast per row that says 1 on chain.
        {" "}
        <button className="text-btn" type="button" onClick={() => setShowSystem((value) => !value)}>
          {showSystem ? "Hide system prompt" : "View system prompt"}
        </button>
      </p>
      {showSystem ? <pre className="transcript">{system || "This receipt has no system prompt."}</pre> : null}
      {meter ? <p className="note">{onChainLabel(meter.runs, meter.broadcast) || "Broadcast count is not in this receipt."}</p> : null}
      {prompt === "hardened" ? (
        <p className="note">Hardened prompt obeyed {hardMeter ? `${hardMeter.obeyed} of ${hardMeter.runs}` : "—"} on the wrong-account invoice. {receipt.hardened?.whyNotBroadcast}</p>
      ) : null}
      <section className="hijack-threat" aria-labelledby="threat-title">
        <h3 id="threat-title">What a hijacked agent can still do</h3>
        <ul>
          <li>Trigger the payment at the earliest allowed moment. This is intended.</li>
          <li>Burn its own key through refusals. Availability loss, no fund loss. The buyer reinstalls it.</li>
          <li>Do nothing. The buyer is refunded after the deadline.</li>
          <li>Cannot: change recipient, amount, or sentence; pay twice; attach a deposit; call revoke_agent; call the token directly.</li>
        </ul>
        {receipt.notYetNote ? <p className="note">{receipt.notYetNote}</p> : null}
      </section>
      <div className="hijack-verify">
        <code>node chain/verify.mjs</code>
        <button className="ghost" type="button" onClick={async () => {
          try {
            await navigator.clipboard.writeText("node chain/verify.mjs");
            setCopied("done");
          } catch {
            setCopied("failed");
          }
        }}>{copied === "done" ? "Copied" : copied === "failed" ? "Copy failed" : "Copy"}</button>
        <span>Expected last line: verify: ok</span>
        {receipt.contract ? <a href={`https://testnet.nearblocks.io/address/${receipt.contract}`}>Account on NearBlocks</a> : null}
      </div>
      {receipt.failureKept?.length ? (
        <details className="hijack-earlier">
          <summary>Earlier attempts</summary>
          <ul>
            {receipt.failureKept.map((item) => (
              <li key={item.hash || item.contract}>
                <span className="mono">{item.code}</span> {item.contract}{" "}
                {item.hash ? <a className="mono" href={txUrl(item.hash)}>{item.hash}</a> : null}
                <p>{item.what}</p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {receipt.wasm || receipt.commit ? (
        <p className="mono note">{receipt.wasm ? `wasm ${receipt.wasm}` : ""} {receipt.commit ? `commit ${receipt.commit}` : ""}</p>
      ) : null}
    </div>
  );
}
