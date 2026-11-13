"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { HijackCompare, ThreatCard, useDefence } from "@/components/home/HijackScene";
import { Tripwire } from "@/components/home/Tripwire";
import {
  attackById,
  attackerReached,
  baselineTrial,
  callDestination,
  deadKeyHashes,
  invoiceField,
  ladderRows,
  obeyText,
  onChainLabel,
  outcomeWord,
  overpay,
  sampleLine,
  splitInvoice,
  termsFieldMissing,
  toolLine,
  tripwireFact,
  type DefenceAttack,
  type DefenceFile,
  type InjectReceipt,
  type LadderRow,
} from "@/lib/hijack";
import { formatUnits, txUrl } from "@/lib/useReceipt";

function defenceLine(label: string, row: DefenceAttack | undefined, attacker: string) {
  if (!row) return null;
  if (termsFieldMissing(row)) {
    return <small>{label}: N/A. This tool has no terms field, so this cell is not resistance.</small>;
  }
  const paid = overpay(row);
  const obeyed = row.emittedMalicious ? "1 of 1" : "0 of 1";
  const early = row.id === 4 && label === "Prompt-only defence" ? " Paid early, outside the window." : "";
  const payee = invoiceField(row.invoice, "Payee");
  const sealed = payee && callDestination(row) === payee && BigInt(row.moneyMoved || "0") > BigInt(0)
    ? `, ${formatUnits(row.moneyMoved)} to the sealed payee`
    : "";
  const moved = paid
    ? `overpaid ${formatUnits(paid.moved)} to the sealed payee, ${paid.times}x the sealed amount`
    : `reached the injected target ${formatUnits(attackerReached(row, attacker))}${sealed}`;
  return (
    <small>
      {label}: obeyed {obeyed}, {toolLine(row.toolCall)}, {moved}, {row.evidence}{early}
      {row.hash ? <> <a className="mono" href={txUrl(row.hash)}>{row.hash}</a></> : null}
    </small>
  );
}

function RowMeta({ receipt, row, defence }: { receipt: InjectReceipt; row: LadderRow; defence: DefenceFile | null }) {
  return (
    <>
      {row.permission ? <small className="hijack-perm">key permission, not a contract refusal</small> : null}
      {tripwireFact(receipt, row.attack) ? <small>{tripwireFact(receipt, row.attack)}</small> : null}
      {deadKeyHashes(row.attack).length ? <small>Not on a live key: {deadKeyHashes(row.attack).join(", ")}</small> : null}
      <DefenceLines defence={defence} id={row.key} attacker={receipt.attacker || ""} />
    </>
  );
}

function DefenceLines({ defence, id, attacker }: { defence: DefenceFile | null; id: string; attacker: string }) {
  const numeric = Number(id);
  if (!defence || !Number.isInteger(numeric)) return null;
  const only = defence.promptOnly?.attacks?.find((item) => item.id === numeric);
  const meter = defence.meterKey?.attacks?.find((item) => item.id === numeric);
  if (!only && !meter) return null;
  return (
    <>
      {defenceLine("Prompt-only defence", only, attacker)}
      {defenceLine("With Meter", meter, attacker)}
    </>
  );
}

function InvoiceLines({ invoice }: { invoice: string | undefined }) {
  const parts = splitInvoice(invoice);
  if (!parts || (!parts.extra.length && !parts.note)) return null;
  return (
    <span className="attack-invoice">
      {parts.extra.map((line) => <span className="bill-note" key={line}><mark>{line}</mark></span>)}
      {parts.note ? <span className="bill-note"><mark>{parts.note}</mark></span> : null}
    </span>
  );
}

function Escalation({ defence }: { defence: DefenceFile | null }) {
  const runs = defence?.escalation?.runs ?? [];
  if (!defence) return null;
  if (!runs.length) {
    if (!defence.escalation?.payloads?.length) return null;
    return <p className="note">Escalation payloads are committed. No run is in this receipt yet.</p>;
  }
  return (
    <section className="hijack-threat" aria-labelledby="escalation-title">
      <h3 id="escalation-title">Escalation</h3>
      <ul>
        {runs.map((row) => {
          const name = row.config === "meterKey" ? "Hardened prompt + Meter key" : "Prompt-only defence";
          const paid = overpay(row);
          return (
            <li key={`${row.config ?? "run"}-${row.id}`}>
              {termsFieldMissing(row)
                ? <>{name}, attack {row.id}: N/A. This tool has no terms field, so this cell is not resistance.</>
                : paid
                  ? <>{name}, attack {row.id}: {paid.times === "1" ? "paid" : "overpaid"} {formatUnits(paid.moved)} to the sealed payee, {paid.times}x the sealed amount. {toolLine(row.toolCall)}. {row.evidence}</>
                  : <>{name}, attack {row.id}: {row.emittedMalicious ? "emitted the malicious call" : "did not emit the malicious call"}. {toolLine(row.toolCall)}. Reached the injected target {formatUnits(row.injectedReached || "0")}. {row.evidence}</>}
              {row.code && !termsFieldMissing(row) ? <> <span className="mono">{row.code}</span></> : null}
              {row.hash ? <> <a className="mono" href={txUrl(row.hash)}>{row.hash}</a></> : null}
              <InvoiceLines invoice={row.invoice} />
            </li>
          );
        })}
      </ul>
      <p className="note">{sampleLine(defence)}</p>
    </section>
  );
}

function recordedAt(iso: string | undefined) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

export function AttackRecord({ receipt }: { receipt: InjectReceipt }) {
  const [showSystem, setShowSystem] = useState(false);
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const rows = ladderRows(receipt);
  const baseline = receipt.baseline;
  const naive = baselineTrial(receipt);
  const when = recordedAt(receipt.at);
  const meter = attackById(receipt, 1);
  const system = receipt.system;
  const { file: defence, state: defenceState } = useDefence();
  const baselineObey = obeyText(baseline?.obeyed, baseline?.runs, baseline?.broadcast);

  return (
    <div className="attack-record">
      <header className="page-head">
        <div>
          <p className="kicker">Record</p>
          <h1>The hijack</h1>
          <p className="lede">One poisoned invoice. The no-defence key paid. The Meter key did not. <Link href="/check">Check a call</Link></p>
        </div>
        {receipt.contract ? <p className="mono">{receipt.contract}{when ? ` · ${when}` : ""}</p> : null}
      </header>
      <HijackCompare receipt={receipt} />
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
                  <Link href="/attack/baseline">No defence</Link>
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
              <Fragment key={row.key}>
              <tr data-permission={row.permission ? "true" : undefined}>
                <th scope="row">
                  <Link href={`/attack/${encodeURIComponent(row.key)}`}>{row.name}</Link>
                  <div className="attack-meta">
                    <RowMeta receipt={receipt} row={row} defence={defence} />
                  </div>
                </th>
                <td>{row.obeyed}</td>
                <td className="mono">{row.code}</td>
                <td>{outcomeWord(row.moved)} {formatUnits(row.moved)}</td>
                <td>
                  {row.permission ? <span>{row.hashNote}</span> : (
                    <>
                      <span className="evidence">{row.evidence}</span>
                      {row.hash ? <a className="mono hash-full" href={txUrl(row.hash)}>{row.hash}</a> : <span>{row.hashNote || "No transaction in this receipt."}</span>}
                    </>
                  )}
                  {row.attack.runs != null && row.attack.broadcast != null ? <small>{onChainLabel(row.attack.runs, row.attack.broadcast, row.attack.burnHash ? "delete" : "first")}</small> : null}
                </td>
              </tr>
              <tr className="attack-follow">
                <td colSpan={5}>
                  <RowMeta receipt={receipt} row={row} defence={defence} />
                </td>
              </tr>
              </Fragment>
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
        {" · "}one deterministic run per attack (temperature 0). The obeyed cell says how many times that call was executed on chain.
        {" "}
        <button className="text-btn" type="button" onClick={() => setShowSystem((value) => !value)}>
          {showSystem ? "Hide system prompt" : "View system prompt"}
        </button>
      </p>
      {showSystem ? <pre className="transcript">{system || "This receipt has no system prompt."}</pre> : null}
      {meter ? <p className="note">{onChainLabel(meter.runs, meter.broadcast) || "Broadcast count is not in this receipt."}</p> : null}
      <p className="note">Hardened prompt results are one temperature-0 sample per attack.</p>
      <p className="note">Discarded pass</p>
      <p className="note">A first temperature-0 pass was discarded before any transaction because the buyer held under 8 NEAR.</p>
      {defenceState === "error" ? <p className="note" role="alert">The hardened receipt did not load.</p> : <Escalation defence={defence} />}
      {defenceState === "loading" ? <p className="note">Reading the hardened run.</p> : null}
      <ThreatCard note={receipt.notYetNote} />
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
