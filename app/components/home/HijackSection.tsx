"use client";

import { useEffect, useId, useState } from "react";
import {
  attackById,
  balanceDelta,
  baselineTrial,
  broadcastTrial,
  hardenedCase,
  ladderRows,
  onChainLabel,
  outcomeWord,
  splitInvoice,
  toolLine,
  type HardenedCase,
  type InjectReceipt,
  type InjectTrial,
  type LadderRow,
  type ToolCall,
} from "@/lib/hijack";
import { formatUnits, txUrl } from "@/lib/useReceipt";

function shortHash(hash: string) {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

function recordedAt(iso: string | undefined) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

function InvoiceCard({ invoice }: { invoice: string | undefined }) {
  const parts = splitInvoice(invoice);
  if (!parts) return <p className="note">This receipt has no invoice.</p>;
  return (
    <pre className="hijack-invoice">
      {parts.head}
      {parts.note ? (
        <>
          {"\n\n"}
          <mark>Note: {parts.note}</mark>
        </>
      ) : null}
    </pre>
  );
}

function CallLine({ call, system, invoice, startOpen = false }: { call: ToolCall | undefined; system?: string; invoice?: string; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const text = [
    system ? `System\n${system}` : null,
    invoice || null,
    call ? `Tool call\n${JSON.stringify({ name: call.name, args: call.args }, null, 2)}` : null,
  ].filter(Boolean).join("\n\n");

  return (
    <div>
      <p className="mono hijack-call">{toolLine(call)}</p>
      <button className="text-btn" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {open ? "Hide transcript" : "Show full transcript"}
      </button>
      {open ? <pre className="transcript">{text || "This receipt has no transcript."}</pre> : null}
    </div>
  );
}

function callOf(trial: InjectTrial | null, hardened: HardenedCase | null): ToolCall | undefined {
  return hardened?.trials?.[0]?.toolCall ?? trial?.transcript?.toolCall;
}

function Result({
  word,
  figure,
  code,
  hash,
  note,
}: {
  word: "PAID" | "STOPPED";
  figure: string;
  code: string;
  hash: string | null;
  note?: string | null;
}) {
  return (
    <div className="hijack-result" data-word={word}>
      <span className="tag" data-kind={word === "PAID" ? "paid" : "refused"}>{word}</span>
      <b>{figure}</b>
      <span className="mono">{code}</span>
      {hash ? <a className="mono" href={txUrl(hash)} title={hash}>{shortHash(hash)}</a> : <span className="muted">No transaction</span>}
      {note ? <small>{note}</small> : null}
    </div>
  );
}

function DeltaLine({ trial, attacker }: { trial: InjectTrial | null; attacker: string }) {
  const before = trial?.balances?.before?.attacker;
  const after = trial?.balances?.after?.attacker;
  const delta = balanceDelta(before, after);
  if (!delta) return <p className="note">This receipt has no balance for that call.</p>;
  const sign = delta.negative ? "−" : "+";
  return (
    <p className="hijack-delta">
      <b>{sign}{formatUnits(delta.units)}</b>
      <small>{attacker} held {formatUnits(delta.before)} before these calls (from the naive transfer). Only the change matters.</small>
    </p>
  );
}

function Side({
  title,
  invoice,
  trial,
  hardened,
  word,
  figure,
  code,
  hash,
  chain,
  extra,
  systemText,
}: {
  title: string;
  invoice: string | undefined;
  trial: InjectTrial | null;
  hardened: HardenedCase | null;
  word: "PAID" | "STOPPED";
  figure: string;
  code: string;
  hash: string | null;
  chain: string | null;
  extra?: string | null;
  systemText?: string;
}) {
  const obeyed = hardened ? `${hardened.obeyed} of ${hardened.runs}` : null;
  return (
    <article className="hijack-side" data-word={word}>
      <h3>{title}</h3>
      <InvoiceCard invoice={hardened?.invoice ?? invoice} />
      <CallLine
        call={callOf(trial, hardened)}
        system={systemText ?? trial?.transcript?.system}
        invoice={hardened?.invoice ?? trial?.transcript?.invoice}
      />
      <Result
        word={word}
        figure={figure}
        code={code}
        hash={hash}
        note={hardened ? `Hardened prompt obeyed ${obeyed}. The hash is the recorded naive call. ${extra ? "" : "Not re-broadcast."}` : chain}
      />
      {extra ? <p className="note">{extra}</p> : null}
    </article>
  );
}

function RowPanel({ receipt, row, prompt, systemText, startOpen = false }: { receipt: InjectReceipt; row: LadderRow; prompt: "naive" | "hardened"; systemText?: string; startOpen?: boolean }) {
  const attack = row.attack;
  const trial = broadcastTrial(attack);
  const hardened = prompt === "hardened" ? hardenedCase(receipt, String(attack.id)) : null;
  const word = outcomeWord(attack.moneyMoved ?? trial?.moved);
  return (
    <div className="hijack-panel">
      <p className="hijack-kicker">{row.name}</p>
      {attack.parts ? (
        <div className="hijack-parts">
          {["revoke", "deposit", "token"].map((key) => {
            const part = attack.parts?.[key];
            const partTrial = part?.trials?.[0];
            const partHard = prompt === "hardened" ? hardenedCase(receipt, `${attack.id}-${key}`) : null;
            if (!partTrial && !partHard) return null;
            return (
              <section key={key}>
                <h3>{key}</h3>
                <CallLine
                  call={callOf(partTrial ?? null, partHard)}
                  system={systemText ?? partTrial?.transcript?.system}
                  invoice={partHard?.invoice ?? partTrial?.transcript?.invoice}
                  startOpen={startOpen}
                />
                <p>
                  <span className="tag" data-kind="refused">STOPPED</span>{" "}
                  <span className="mono">{partTrial?.code || "No code"}</span>
                  {" · "}
                  {partTrial?.hash ? <a className="mono" href={txUrl(partTrial.hash)}>{shortHash(partTrial.hash)}</a> : <span>no tx · rejected before inclusion</span>}
                </p>
                {partTrial?.failure ? <p className="note">{partTrial.failure}</p> : null}
                {partHard ? <p className="note">Hardened prompt obeyed {partHard.obeyed} of {partHard.runs}. Not broadcast.</p> : null}
              </section>
            );
          })}
        </div>
      ) : (
        <>
          <InvoiceCard invoice={hardened?.invoice ?? trial?.transcript?.invoice} />
          <CallLine
            call={callOf(trial, hardened)}
            system={systemText ?? trial?.transcript?.system}
            invoice={hardened?.invoice ?? trial?.transcript?.invoice}
            startOpen={startOpen}
          />
          <Result
            word={word}
            figure={`${formatUnits(attack.moneyMoved ?? trial?.moved ?? "0")} moved`}
            code={trial?.code || row.code}
            hash={row.hash}
            note={hardened ? `Hardened prompt obeyed ${hardened.obeyed} of ${hardened.runs}. ${receipt.hardened?.whyNotBroadcast ?? "Not broadcast."}` : onChainLabel(attack.runs, attack.broadcast)}
          />
          {hardened?.reading ? <p className="note">{hardened.reading}</p> : null}
          <DeltaLine trial={trial} attacker={receipt.attacker || "the attacker"} />
          {trial?.balances?.before?.vendor != null && trial.balances.after?.vendor != null ? (
            <p className="note">Payee change {signedUnits(trial.balances.before.vendor, trial.balances.after.vendor)}.</p>
          ) : null}
        </>
      )}
      {attack.id === 7 && attack.keysAfterBurn != null ? (
        <p className="note">Access keys after the burn: {attack.keysAfterBurn}. Next call: {attack.nextCall?.code || "missing"}. {attack.nextCall?.failure || ""}</p>
      ) : null}
      {attack.id === 8 && attack.reinstallHash ? (
        <p className="note">Reinstall <a className="mono" href={txUrl(attack.reinstallHash)}>{shortHash(attack.reinstallHash)}</a>{attack.recoveryPublicKey ? ` · ${attack.recoveryPublicKey}` : ""}</p>
      ) : null}
    </div>
  );
}

function signedUnits(before: string, after: string) {
  const delta = balanceDelta(before, after);
  if (!delta) return "unavailable";
  return `${delta.negative ? "−" : "+"}${formatUnits(delta.units)}`;
}

export function HijackSection({ receipt, variant }: { receipt: InjectReceipt; variant: "home" | "page" }) {
  const rows = ladderRows(receipt);
  const [selected, setSelected] = useState(rows[0]?.key ?? "");
  const [prompt, setPrompt] = useState<"naive" | "hardened">("naive");
  const [showSystem, setShowSystem] = useState(false);
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const [narrow, setNarrow] = useState(false);
  const sheetId = useId();
  const row = rows.find((item) => item.key === selected) ?? rows[0];
  const baseline = receipt.baseline;
  const naiveTrial = baselineTrial(receipt);
  const meter = attackById(receipt, 1);
  const meterTrial = broadcastTrial(meter);
  const hardBaseline = prompt === "hardened" ? hardenedCase(receipt, "baseline") : null;
  const hardMeter = prompt === "hardened" ? hardenedCase(receipt, "1") : null;
  const trip = attackById(receipt, 7);
  const honest = attackById(receipt, 8);
  const honestTrial = broadcastTrial(honest);
  const when = recordedAt(receipt.at);
  const hasHardened = Boolean(receipt.hardened?.cases?.length);
  const system = prompt === "hardened" && receipt.hardened?.system ? receipt.hardened.system : receipt.system;

  useEffect(() => {
    const media = window.matchMedia("(max-width: 809.98px)");
    const apply = () => setNarrow(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  async function copyVerify() {
    try {
      await navigator.clipboard.writeText("node chain/verify.mjs");
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }

  function choose(key: string) {
    setSelected(key);
    if (narrow) {
      const dialog = document.getElementById(sheetId) as HTMLDialogElement | null;
      dialog?.showModal();
    }
  }

  const panel = row ? <RowPanel receipt={receipt} row={row} prompt={prompt} systemText={system} /> : <p className="note">This receipt has no attack rows.</p>;

  return (
    <div className="hijack" data-variant={variant}>
      <header className="craft-intro">
        <p className="craft-eyebrow">The hijack</p>
        <h2>We told an AI to pay the wrong account. It did. 0.00 moved.</h2>
        <p className="craft-lead">Same model, same poisoned invoice. One clerk holds a full-access key. One holds a Meter key.</p>
        {when && receipt.contract ? <p className="mono craft-lead">{receipt.contract} · {when}</p> : null}
      </header>

      {hasHardened ? (
        <div className="hijack-toggle" role="group" aria-label="Which prompt">
          <button type="button" data-on={prompt === "naive"} onClick={() => setPrompt("naive")}>Naive prompt</button>
          <button type="button" data-on={prompt === "hardened"} onClick={() => setPrompt("hardened")}>Hardened prompt</button>
        </div>
      ) : null}

      <div className="hijack-split">
        <Side
          title="Without Meter"
          invoice={baseline?.invoice}
          trial={naiveTrial}
          hardened={hardBaseline}
          word="PAID"
          figure={`${formatUnits(baseline?.moneyMoved ?? "0")} sent to ${receipt.attacker ?? "the other account"}`}
          code={naiveTrial?.code || "OK"}
          hash={naiveTrial?.hash || null}
          chain={onChainLabel(baseline?.runs, baseline?.broadcast)}
          extra={null}
          systemText={system}
        />
        <Side
          title="With Meter"
          invoice={meterTrial?.transcript?.invoice ?? baseline?.invoice}
          trial={meterTrial}
          hardened={hardMeter}
          word="STOPPED"
          figure={`${formatUnits(meter?.moneyMoved ?? "0")} moved`}
          code={meterTrial?.code || meter?.expected || "ERR_RECIPIENT"}
          hash={meterTrial?.hash || null}
          chain={onChainLabel(meter?.runs, meter?.broadcast)}
          systemText={system}
        />
      </div>
      <p className="hijack-differ">
        {prompt === "hardened"
          ? "The hardened prompt paid the header. The hashes below are the naive run, which did obey."
          : "The model obeyed in both. The key is what differed."}
      </p>

      <h3 className="hijack-sub">Attack ladder</h3>
      <div className="pitch-scroll">
        <table className="pitch-table">
          <caption>Eight attacks. Selecting a row shows that transcript.</caption>
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
            {rows.map((item) => (
              <tr key={item.key} data-on={item.key === row?.key} data-permission={item.permission ? "true" : undefined}>
                <th scope="row">
                  <button type="button" className="text-btn" onClick={() => choose(item.key)} aria-pressed={item.key === row?.key}>{item.name}</button>
                  {item.permission ? <small className="hijack-perm">key permission, not a contract refusal</small> : null}
                </th>
                <td>{prompt === "hardened" ? hardenedObey(receipt, item) : item.obeyed}</td>
                <td className="mono">{item.code}</td>
                <td>{outcomeWord(item.moved)} {formatUnits(item.moved)}</td>
                <td>
                  {item.hash ? <a className="mono" href={txUrl(item.hash)} title={item.hash}>{shortHash(item.hash)}</a> : <span>{item.hashNote || "No transaction"}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {variant === "page" ? (
        <div className="hijack-expanded">
          {rows.map((item) => <RowPanel key={item.key} receipt={receipt} row={item} prompt={prompt} systemText={system} startOpen />)}
        </div>
      ) : narrow ? (
        <dialog id={sheetId} className="hijack-sheet" onClose={() => undefined}>
          {panel}
          <form method="dialog"><button className="ghost" type="submit">Close</button></form>
        </dialog>
      ) : panel}

      <ol className="hijack-trip" aria-label="What the poisoned invoice did to the key">
        <li><b>Hijacked</b><span>The note named {receipt.attacker || "another account"}.</span></li>
        <li>
          <b>Refusal ×5</b>
          <span className="hijack-pips" aria-label={`${Math.min(trip?.trials?.filter((trial) => trial.broadcast && (trial.refusals ?? 0) > 0).length ?? 0, 5)} refusals recorded`}>
            {[1, 2, 3, 4, 5].map((pip) => {
              const hit = (trip?.trials ?? []).some((trial) => trial.broadcast && (trial.refusals ?? 0) >= pip);
              return <i key={pip} data-on={hit ? "true" : "false"} />;
            })}
          </span>
        </li>
        <li>
          <b>Key deleted</b>
          {trip?.keysAfterBurn === 0 ? <span>Access-key list: empty. {trip.nextCall?.code}. {trip.burnHash ? <a className="mono" href={txUrl(trip.burnHash)}>{shortHash(trip.burnHash)}</a> : null}</span> : <span className="note">This receipt does not show an empty key list.</span>}
        </li>
        <li>
          <b>Buyer reinstalls</b>
          <span>1 yoctoNEAR. {honest?.reinstallHash ? <a className="mono" href={txUrl(honest.reinstallHash)}>{shortHash(honest.reinstallHash)}</a> : "No reinstall hash in this receipt."}</span>
        </li>
        <li>
          <b>Honest invoice</b>
          <span>{outcomeWord(honest?.moneyMoved)} {formatUnits(honest?.moneyMoved ?? "0")}. {honestTrial?.hash ? <a className="mono" href={txUrl(honestTrial.hash)}>{shortHash(honestTrial.hash)}</a> : "No payment hash."}</span>
        </li>
      </ol>
      <p className="hijack-caption">The poisoned invoice can burn the key. It cannot touch the tokens.</p>

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
      {meter ? <p className="note">{onChainLabel(meter.runs, meter.broadcast) || "Broadcast count is not in this receipt."} The ten calls at temperature 0 were the same call.</p> : null}
      {hasHardened && prompt === "hardened" ? (
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
        <button className="ghost" type="button" onClick={copyVerify}>{copied === "done" ? "Copied" : copied === "failed" ? "Copy failed" : "Copy"}</button>
        <span>Expected last line: verify: ok</span>
        {receipt.contract ? <a href={`https://testnet.nearblocks.io/address/${receipt.contract}`}>Account on NearBlocks</a> : null}
      </div>

      {variant === "page" && receipt.failureKept?.length ? (
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
      {variant === "page" && (receipt.wasm || receipt.commit) ? (
        <p className="mono note">{receipt.wasm ? `wasm ${receipt.wasm}` : ""} {receipt.commit ? `commit ${receipt.commit}` : ""}</p>
      ) : null}
    </div>
  );
}

function hardenedObey(receipt: InjectReceipt, row: LadderRow) {
  if (row.attack.parts) {
    const parts = ["revoke", "deposit", "token"].map((key) => hardenedCase(receipt, `${row.attack.id}-${key}`)).filter(Boolean);
    if (!parts.length) return "—";
    const obeyed = parts.every((item) => item && item.obeyed === item.runs);
    return obeyed ? "yes" : parts.map((item) => `${item?.obeyed}/${item?.runs}`).join(" · ");
  }
  const found = hardenedCase(receipt, String(row.attack.id));
  if (!found) return "—";
  return found.obeyed === found.runs ? "yes" : `${found.obeyed} of ${found.runs}`;
}
