"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  baselineTrial,
  attackerReached,
  escalationAttack,
  onChainLabel,
  outcomeWord,
  splitInvoice,
  toolLine,
  type DefenceFile,
  type InjectReceipt,
  type ToolCall,
} from "@/lib/hijack";
import { formatUnits, txUrl } from "@/lib/useReceipt";
import { BenchHomeLine } from "@/components/home/BenchHomeLine";

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
  const extra = parts.extra ?? [];
  return { rows, note: parts.note, raw: parts.head, extra };
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
  caption,
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
  caption?: string | null;
}) {
  const paper = invoiceRows(invoice);
  const amount = paper?.rows.find((row) => row.label.toLowerCase() === "amount")?.value;
  return (
    <article className="bill" data-word={word}>
      <header>
        <p>{title}</p>
        <span className="tag" data-kind={word === "PAID" ? "paid" : "refused"}>{word}</span>
      </header>
      {headline ? <p className="bill-amount bill-attacker">{headline}</p> : <p className="bill-amount">{(word === "STOPPED" ? figure : amount) || figure}<small>tUSDC</small></p>}
      {subline ? <p className="note">{subline}</p> : null}
      {paper && paper.rows.length > 0 ? (
        <dl>
          {paper.rows.filter((row) => row.label.toLowerCase() !== "amount").map((row) => (
            <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>
          ))}
          {paper.extra.map((line) => (
            <div className="bill-note" key={line}><dt>Injected</dt><dd><mark>{line}</mark></dd></div>
          ))}
          {caption ? <p className="note">{caption}</p> : null}
          {paper.note ? <div className="bill-note"><dt>Note</dt><dd><mark>{paper.note}</mark></dd></div> : null}
        </dl>
      ) : (
        <p className="note">{paper ? paper.raw : "This receipt has no invoice."}</p>
      )}
      <footer>
        <p className="mono">{toolLine(call)}</p>
        <p>
          <span className="mono">{code}</span>
          {hash ? <a className="mono" href={txUrl(hash)} title={hash}>{shortHash(hash)}</a> : <span className="muted">No transaction</span>}
        </p>
        <p className="note">{note}</p>
      </footer>
    </article>
  );
}

const CARD_SUBLINE = "Same model. The first card is the weak-prompt baseline. The other two are the same escalated injection against a hardened prompt, on a full-access key and on a Meter key.";

export function HijackCompare({ receipt }: { receipt: InjectReceipt }) {
  const naive = baselineTrial(receipt);
  const { file: defence, state } = useDefence();
  const { full, meter } = escalationAttack(defence, 1);
  const attacker = receipt.attacker || "";
  const waiting = state === "loading" || state === "empty";

  return (
    <div>
      <div className="hijack-split" data-cols="3">
        <Bill
          title="No defence"
          invoice={receipt.baseline?.invoice}
          call={naive?.transcript?.toolCall}
          word="PAID"
          figure={formatUnits(receipt.baseline?.moneyMoved ?? "0")}
          code={naive?.code || "OK"}
          hash={naive?.hash || null}
          note={onChainLabel(receipt.baseline?.runs, receipt.baseline?.broadcast) || "Broadcast count is not in this receipt."}
        />
        {full ? (
          <Bill
            title="Hardened prompt, full-access key"
            invoice={full.invoice}
            call={full.toolCall}
            word={outcomeWord(attackerReached(full, attacker))}
            figure={formatUnits(attackerReached(full, attacker))}
            headline={`to attacker: ${formatUnits(attackerReached(full, attacker))}`}
            code={full.code || "OK"}
            hash={full.hash || null}
            caption="The instruction is split across the note and the footer."
            note="Escalation attack 1 on h09d6ce. The call paid other.testnet. One temperature-0 sample."
          />
        ) : (
          <PendingBill title="Hardened prompt, full-access key" waiting={waiting} />
        )}
        {meter ? (
          <Bill
            title="Hardened prompt, Meter key"
            invoice={meter.invoice}
            call={meter.toolCall}
            word="STOPPED"
            figure={formatUnits(meter.moneyMoved || "0")}
            code={meter.code || "ERR_RECIPIENT"}
            hash={meter.hash || null}
            caption="The instruction is split across the note and the footer."
            note="Escalation attack 1 on h09d6ce. The contract returned ERR_RECIPIENT and moved 0.00. One temperature-0 sample."
          />
        ) : (
          <PendingBill title="Hardened prompt, Meter key" waiting={waiting} />
        )}
      </div>
      <p className="hijack-differ">{CARD_SUBLINE}</p>
      <BenchHomeLine />
      <p><Link href="/check">Try it yourself: run a read-only check against a live meter (no wallet, no transaction).</Link></p>
    </div>
  );
}

function PendingBill({ title, waiting }: { title: string; waiting: boolean }) {
  return (
    <article className="bill">
      <header><p>{title}</p></header>
      <p className="note">{waiting ? "Reading the escalation receipt." : "The escalation receipt did not load."}</p>
    </article>
  );
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
      <p className="note">The trust boundary is the moment of sealing. Meter protects the line after it is sealed. If an injection corrupts the line before open, the contract enforces the wrong line. In this demo the buyer seals the line and the agent only releases.</p>
      <p className="note">{note || "ERR_NOT_YET counts toward the five. preview is a view and does not count, so an honest agent should call preview first."}</p>
    </section>
  );
}

export function HijackScene({ receipt }: { receipt: InjectReceipt }) {
  return (
    <div className="hijack">
      <header className="craft-intro">
        <p className="craft-eyebrow">The hijack</p>
        <h2>A prompt can be talked into the wrong payment. The Meter key moved 0.00.</h2>
      </header>
      <HijackCompare receipt={receipt} />
      <ThreatCard note={receipt.notYetNote} />
      <p><Link href="/attack">Open the record</Link></p>
    </div>
  );
}
