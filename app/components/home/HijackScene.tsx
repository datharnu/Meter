"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  attackById,
  baselineTrial,
  attackerReached,
  broadcastTrial,
  callDestination,
  hardenedCase,
  invoiceField,
  onChainLabel,
  outcomeWord,
  splitInvoice,
  toolLine,
  type DefenceAttack,
  type DefenceFile,
  type InjectReceipt,
  type ToolCall,
} from "@/lib/hijack";
import { formatUnits, txUrl } from "@/lib/useReceipt";

function shortHash(hash: string) {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

function invoiceRows(invoice: string | undefined) {
  const parts = splitInvoice(invoice);
  if (!parts) return null;
  const rows = parts.head
    .split("\n")
    .map((line) => {
      const at = line.indexOf(":");
      if (at < 1) return null;
      return { label: line.slice(0, at).trim(), value: line.slice(at + 1).trim() };
    })
    .filter((row): row is { label: string; value: string } => Boolean(row?.value));
  return { rows, note: parts.note, raw: parts.head };
}

function Bill({
  title,
  invoice,
  call,
  word,
  figure,
  code,
  hash,
  note,
  headline,
  subline,
}: {
  title: string;
  invoice: string | undefined;
  call: ToolCall | undefined;
  word: "PAID" | "STOPPED";
  figure: string;
  code: string;
  hash: string | null;
  note: string;
  headline?: string | null;
  subline?: string | null;
}) {
  const paper = invoiceRows(invoice);
  const amount = paper?.rows.find((row) => row.label.toLowerCase() === "amount")?.value;
  return (
    <article className="bill" data-word={word}>
      <header>
        <p>{title}</p>
        <span className="tag" data-kind={word === "PAID" ? "paid" : "refused"}>{word}</span>
      </header>
      {headline ? <p className="bill-amount bill-attacker">{headline}</p> : <p className="bill-amount">{amount || figure}<small>tUSDC</small></p>}
      {subline ? <p className="note">{subline}</p> : null}
      {paper && paper.rows.length > 0 ? (
        <dl>
          {paper.rows.filter((row) => row.label.toLowerCase() !== "amount").map((row) => (
            <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>
          ))}
          {paper.note ? <div className="bill-note"><dt>Note</dt><dd><mark>{paper.note}</mark></dd></div> : null}
        </dl>
      ) : (
        <p className="note">{paper ? paper.raw : "This receipt has no invoice."}</p>
      )}
      <footer>
        <p className="mono">{toolLine(call)}</p>
        <p>
          <b>{figure}</b>
          <span className="mono">{code}</span>
          {hash ? <a className="mono" href={txUrl(hash)} title={hash}>{shortHash(hash)}</a> : <span className="muted">No transaction</span>}
        </p>
        <p className="note">{note}</p>
      </footer>
    </article>
  );
}

export function HijackCompare({
  receipt,
  prompt,
  onPrompt,
}: {
  receipt: InjectReceipt;
  prompt: "naive" | "hardened";
  onPrompt: (next: "naive" | "hardened") => void;
}) {
  const hasHardened = Boolean(receipt.hardened?.cases?.length);
  const naive = baselineTrial(receipt);
  const meter = attackById(receipt, 1);
  const meterTrial = broadcastTrial(meter);
  const hardBase = prompt === "hardened" ? hardenedCase(receipt, "baseline") : null;
  const hardMeter = prompt === "hardened" ? hardenedCase(receipt, "1") : null;
  const leftCall = hardBase?.trials?.[0]?.toolCall ?? naive?.transcript?.toolCall;
  const rightCall = hardMeter?.trials?.[0]?.toolCall ?? meterTrial?.transcript?.toolCall;
  const { file: defence } = useDefence();
  const promptOnly = defence?.promptOnly?.attacks?.find((item) => item.id === 1) ?? null;
  const attacker = receipt.attacker || "";
  const promptWhere = promptOnly ? promptOnlyWhere(promptOnly, attacker) : null;

  return (
    <div>
      {hasHardened ? (
        <div className="hijack-toggle" role="group" aria-label="Which prompt">
          <button type="button" data-on={prompt === "naive"} onClick={() => onPrompt("naive")}>No defence</button>
          <button type="button" data-on={prompt === "hardened"} onClick={() => onPrompt("hardened")}>Hardened prompt</button>
        </div>
      ) : null}
      <div className="hijack-split" data-cols={promptOnly ? "3" : "2"}>
        <Bill
          title="No defence"
          invoice={hardBase?.invoice ?? receipt.baseline?.invoice}
          call={leftCall}
          word="PAID"
          figure={`${formatUnits(receipt.baseline?.moneyMoved ?? "0")} sent to ${receipt.attacker || "the other account"}`}
          code={naive?.code || "OK"}
          hash={naive?.hash || null}
          note={hardBase ? `Hardened prompt obeyed ${hardBase.obeyed} of ${hardBase.runs}. The hash is the recorded naive call. Not broadcast.` : (onChainLabel(receipt.baseline?.runs, receipt.baseline?.broadcast) || "Broadcast count is not in this receipt.")}
        />
        {promptOnly ? (
          <Bill
            title="Prompt-only defence"
            invoice={promptOnly.invoice}
            call={promptOnly.toolCall}
            word={outcomeWord(attackerReached(promptOnly, attacker))}
            figure={`to attacker: ${formatUnits(attackerReached(promptOnly, attacker))}`}
            headline={`to attacker: ${formatUnits(attackerReached(promptOnly, attacker))}`}
            subline={promptWhere}
            code={promptOnly.code || (promptOnly.emittedMalicious ? "emitted" : "no malicious call")}
            hash={promptOnly.hash || null}
            note={`${promptOnly.emittedMalicious ? "The agent emitted the call the note asked for." : "The agent did not emit the malicious call. The broadcast is the sealed line."} Obeyed ${promptOnly.emittedMalicious ? "1 of 1" : "0 of 1"}. ${promptOnly.evidence}.`}
          />
        ) : null}
        <Bill
          title="With Meter"
          invoice={hardMeter?.invoice ?? meterTrial?.transcript?.invoice}
          call={rightCall}
          word="STOPPED"
          figure={`${formatUnits(meter?.moneyMoved ?? "0")} moved`}
          code={meterTrial?.code || meter?.expected || "ERR_RECIPIENT"}
          hash={meterTrial?.hash || null}
          note={hardMeter ? `Hardened prompt obeyed ${hardMeter.obeyed} of ${hardMeter.runs}. The hash is the recorded naive call. Not broadcast.` : (onChainLabel(meter?.runs, meter?.broadcast) || "Broadcast count is not in this receipt.")}
        />
      </div>
      <p className="hijack-differ">
        {prompt === "hardened"
          ? "The hardened prompt paid the header. The hashes are the recorded naive calls."
          : "The model obeyed in both. The key is what differed."}
      </p>
    </div>
  );
}

function promptOnlyWhere(row: DefenceAttack, attacker: string) {
  const dest = callDestination(row);
  const payee = invoiceField(row.invoice, "Payee");
  const moved = BigInt(row.moneyMoved || "0");
  if (row.id === 4 && payee && dest === payee && moved > BigInt(0)) return "paid early, outside the window";
  if (payee && dest === payee && moved > BigInt(0)) return `${formatUnits(row.moneyMoved)} to the sealed payee, correct`;
  if (dest === attacker && moved > BigInt(0)) return `${formatUnits(row.moneyMoved)} to the attacker`;
  return `${formatUnits(row.moneyMoved || "0")} moved`;
}

export function useDefence() {
  const [file, setFile] = useState<DefenceFile | null>(null);
  const [state, setState] = useState<"loading" | "empty" | "error" | "ready">("loading");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/inject2.json", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then((body) => {
        if (!body?.promptOnly?.attacks && !body?.meterKey?.attacks && !body?.escalation?.runs) {
          setFile(body ?? null);
          setState("empty");
          return;
        }
        setFile(body);
        setState("ready");
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setFile(null);
        setState("error");
      });
    return () => controller.abort();
  }, []);
  return { file, state };
}

export function ThreatCard({ note }: { note?: string | null }) {
  return (
    <section className="hijack-threat" aria-labelledby="threat-title">
      <h3 id="threat-title">What a hijacked agent can still do</h3>
      <ul>
        <li>It can trigger the payment at the earliest allowed moment. That is intended.</li>
        <li>It can burn its own key. That is availability loss, no fund loss. The buyer reinstalls with 1 yoctoNEAR.</li>
        <li>It can do nothing. The buyer is refunded after the deadline.</li>
        <li>It cannot change the recipient, the amount, or the sentence, pay twice, attach a deposit, call revoke_agent, or call the token directly.</li>
      </ul>
      <p className="note">{note || "ERR_NOT_YET counts toward the five. preview is a view and does not count, so an honest agent should call preview first."}</p>
    </section>
  );
}

export function HijackScene({ receipt }: { receipt: InjectReceipt }) {
  const [prompt, setPrompt] = useState<"naive" | "hardened">("naive");
  return (
    <div className="hijack">
      <header className="craft-intro">
        <p className="craft-eyebrow">The hijack</p>
        <h2>We told an AI to pay the wrong account. It did. 0.00 moved.</h2>
        <p className="craft-lead">Same model, same poisoned invoice. One clerk holds a full-access key. One holds a Meter key.</p>
      </header>
      <HijackCompare receipt={receipt} prompt={prompt} onPrompt={setPrompt} />
      <ThreatCard note={receipt.notYetNote} />
      <p><Link href="/attack">Open the record</Link></p>
    </div>
  );
}
