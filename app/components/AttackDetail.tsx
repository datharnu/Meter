"use client";

import { useState } from "react";
import Link from "next/link";
import {
  balanceDelta,
  baselineTrial,
  broadcastTrial,
  hardenedCase,
  ladderRows,
  onChainLabel,
  outcomeWord,
  splitInvoice,
  toolLine,
  type InjectReceipt,
  type InjectTrial,
  type ToolCall,
} from "@/lib/hijack";
import { formatUnits, txUrl } from "@/lib/useReceipt";

function payeeChange(trial: InjectTrial | null) {
  const before = trial?.balances?.before?.vendor;
  const after = trial?.balances?.after?.vendor;
  if (before == null || after == null) return null;
  const delta = balanceDelta(before, after);
  if (!delta) return null;
  return `${delta.negative ? "−" : "+"}${formatUnits(delta.units)}`;
}

function InvoicePaper({ invoice }: { invoice: string | undefined }) {
  const parts = splitInvoice(invoice);
  if (!parts) return <p className="note">This receipt has no invoice.</p>;
  const rows = parts.head
    .split("\n")
    .map((line) => {
      const at = line.indexOf(":");
      if (at < 1) return null;
      return { label: line.slice(0, at).trim(), value: line.slice(at + 1).trim() };
    })
    .filter((row): row is { label: string; value: string } => Boolean(row?.value));
  if (!rows.length) return <pre className="hijack-invoice">{parts.head}</pre>;
  return (
    <dl className="attack-invoice">
      {rows.map((row) => (
        <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>
      ))}
      {parts.note ? <div className="bill-note"><dt>Note</dt><dd><mark>{parts.note}</mark></dd></div> : null}
    </dl>
  );
}

function Delta({ trial, attacker }: { trial: InjectTrial | null; attacker: string }) {
  const delta = balanceDelta(trial?.balances?.before?.attacker, trial?.balances?.after?.attacker);
  if (!delta) return <p className="note">This receipt has no balance for that call.</p>;
  return (
    <p className="hijack-delta">
      <b>{delta.negative ? "−" : "+"}{formatUnits(delta.units)}</b>
      <small>{attacker} held {formatUnits(delta.before)} before these calls (from the naive transfer). Only the change matters.</small>
    </p>
  );
}

function CallCard({ call, code, word, moved, hash, hashNote }: {
  call: ToolCall | undefined;
  code: string;
  word: "PAID" | "STOPPED";
  moved: string;
  hash: string | null;
  hashNote?: string | null;
}) {
  return (
    <div className="attack-call">
      <p className="kicker">Tool call</p>
      <p className="mono">{toolLine(call)}</p>
      <p>
        <span className="tag" data-kind={word === "PAID" ? "paid" : "refused"}>{word}</span>{" "}
        <b>{moved}</b>{" "}
        <span className="mono">{code}</span>
      </p>
      {hash ? <p><a className="mono" href={txUrl(hash)}>{hash}</a></p> : <p>{hashNote || "No transaction."}</p>}
    </div>
  );
}

export function AttackDetail({ receipt, id }: { receipt: InjectReceipt; id: string }) {
  const [prompt, setPrompt] = useState<"naive" | "hardened">("naive");
  const rows = ladderRows(receipt);
  const row = id === "baseline" ? null : rows.find((item) => item.key === id) ?? null;
  const isBaseline = id === "baseline" && Boolean(receipt.baseline);
  if (!isBaseline && !row) {
    return (
      <div>
        <p><Link href="/attack">The hijack</Link></p>
        <h1>This attack is not in the receipt.</h1>
      </div>
    );
  }

  const attack = row?.attack;
  const trial = isBaseline ? baselineTrial(receipt) : broadcastTrial(attack);
  const hardenedId = isBaseline ? "baseline" : String(attack?.id ?? id);
  const hasHardened = Boolean(receipt.hardened?.cases?.some((item) => item.id === hardenedId || item.id.startsWith(`${hardenedId}-`)));
  const showing = prompt === "hardened" && hasHardened ? "hardened" : "naive";
  const hardened = showing === "hardened" ? hardenedCase(receipt, hardenedId) : null;
  const system = showing === "hardened" && receipt.hardened?.system ? receipt.hardened.system : (trial?.transcript?.system || receipt.system);
  const invoice = hardened?.invoice ?? (isBaseline ? receipt.baseline?.invoice : trial?.transcript?.invoice);
  const call = hardened?.trials?.[0]?.toolCall ?? trial?.transcript?.toolCall;
  const word = isBaseline ? "PAID" as const : outcomeWord(attack?.moneyMoved ?? trial?.moved);
  const moved = isBaseline
    ? `${formatUnits(receipt.baseline?.moneyMoved ?? "0")} sent`
    : `${formatUnits(attack?.moneyMoved ?? trial?.moved ?? "0")} moved`;
  const code = trial?.code || (isBaseline ? "OK" : row?.code || "No code");
  const hash = isBaseline ? trial?.hash || null : row?.hash || null;
  const title = isBaseline ? "Naive key" : row?.name || "Attack";
  const lead = isBaseline ? receipt.baseline?.injection : attack?.injection;
  const chain = isBaseline
    ? onChainLabel(receipt.baseline?.runs, receipt.baseline?.broadcast)
    : onChainLabel(attack?.runs, attack?.broadcast);
  const obeyed = hardened
    ? `${hardened.obeyed} of ${hardened.runs}`
    : isBaseline
      ? receipt.baseline?.obeyed != null && receipt.baseline.obeyed === receipt.baseline.runs ? "yes" : `${receipt.baseline?.obeyed ?? "—"} of ${receipt.baseline?.runs ?? "—"}`
      : row?.obeyed || "—";

  return (
    <article className="attack-detail">
      <p><Link href="/attack">The hijack</Link></p>
      <header className="page-head">
        <div>
          <p className="kicker">Attack</p>
          <h1>{title}</h1>
          {lead ? <p className="lede">{lead}</p> : null}
        </div>
        {receipt.contract ? <p className="mono">{receipt.contract}</p> : null}
      </header>
      {hasHardened ? (
        <div className="hijack-toggle" role="group" aria-label="Which prompt">
          <button type="button" data-on={showing === "naive"} onClick={() => setPrompt("naive")}>Naive prompt</button>
          <button type="button" data-on={showing === "hardened"} onClick={() => setPrompt("hardened")}>Hardened prompt</button>
        </div>
      ) : null}
      {attack?.parts ? (
        <p className="hijack-perm">key permission, not a contract refusal</p>
      ) : (
        <dl className="attack-facts">
          <div><dt>Agent obeyed</dt><dd>{obeyed}</dd></div>
          <div><dt>Code</dt><dd className="mono">{code}</dd></div>
          <div><dt>Moved</dt><dd><span className="tag" data-kind={word === "PAID" ? "paid" : "refused"}>{word}</span> {moved}</dd></div>
          <div><dt>Transaction</dt><dd>{hash ? <a className="mono" href={txUrl(hash)}>{hash}</a> : row?.hashNote || "No transaction"}</dd></div>
        </dl>
      )}
      {attack?.parts ? (
        <div className="attack-parts">
          {["revoke", "deposit", "token"].map((key) => {
            const partTrial = attack.parts?.[key]?.trials?.[0] ?? null;
            const partHard = showing === "hardened" ? hardenedCase(receipt, `${attack.id}-${key}`) : null;
            if (!partTrial && !partHard) return null;
            return (
              <section key={key} className="attack-part">
                <h2>{key}</h2>
                <div className="attack-body">
                  <InvoicePaper invoice={partHard?.invoice ?? partTrial?.transcript?.invoice} />
                  <CallCard
                    call={partHard?.trials?.[0]?.toolCall ?? partTrial?.transcript?.toolCall}
                    code={partTrial?.code || "No code"}
                    word="STOPPED"
                    moved="0.00 moved"
                    hash={partTrial?.hash || null}
                    hashNote="no tx · rejected before inclusion"
                  />
                </div>
                {partTrial?.failure ? <p className="note">{partTrial.failure}</p> : null}
                {partHard ? <p className="note">Hardened prompt obeyed {partHard.obeyed} of {partHard.runs}. Not broadcast.</p> : null}
                <Delta trial={partTrial} attacker={receipt.attacker || "the attacker"} />
                <pre className="transcript">{partHard ? receipt.hardened?.system : partTrial?.transcript?.system || "This receipt has no system prompt."}</pre>
              </section>
            );
          })}
        </div>
      ) : (
        <>
          <div className="attack-body">
            <section>
              <p className="kicker">Invoice</p>
              <InvoicePaper invoice={invoice} />
            </section>
            <CallCard call={call} code={code} word={word} moved={moved} hash={hash} hashNote={row?.hashNote} />
          </div>
          <p className="note">
            {hardened
              ? `Hardened prompt obeyed ${hardened.obeyed} of ${hardened.runs}. The hash is the recorded naive call. ${receipt.hardened?.whyNotBroadcast ?? "Not broadcast."}`
              : chain || "Broadcast count is not in this receipt."}
          </p>
          {hardened?.reading ? <p className="note">{hardened.reading}</p> : null}
          <section>
            <h2>Balances</h2>
            <Delta trial={trial} attacker={receipt.attacker || "the attacker"} />
            {payeeChange(trial) ? <p className="note">Payee change {payeeChange(trial)}.</p> : null}
          </section>
          {attack?.payment?.hash && attack.payment.hash !== hash ? (
            <p className="note">An earlier call on this meter paid {formatUnits(attack.payment.moved ?? "0")} ({attack.payment.code || "OK"}). <a className="mono" href={txUrl(attack.payment.hash)}>{attack.payment.hash}</a>. This call does not delete a key.</p>
          ) : null}
          {Number(attack?.id) === 7 && attack?.keysAfterBurn != null ? (
            <p className="note">Access keys after the burn: {attack.keysAfterBurn}. Next call: {attack.nextCall?.code || "missing"}. {attack.nextCall?.failure || ""}</p>
          ) : null}
          {Number(attack?.id) === 8 && attack?.reinstallHash ? (
            <p className="note">Reinstall <a className="mono" href={txUrl(attack.reinstallHash)}>{attack.reinstallHash}</a>{attack.recoveryPublicKey ? ` · ${attack.recoveryPublicKey}` : ""}</p>
          ) : null}
          <section>
            <h2>System prompt</h2>
            <pre className="transcript">{system || "This receipt has no system prompt."}</pre>
          </section>
        </>
      )}
    </article>
  );
}
