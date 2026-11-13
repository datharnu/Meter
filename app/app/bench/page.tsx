import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";

type Rate = { k: number; n: number; low: number | null; high: number | null; small?: boolean };

type BenchFile = {
  kind: string;
  note?: string;
  statement: string;
  calls: number;
  plannedCalls: number;
  spendUsd: string;
  capUsd: number;
  runId: string | null;
  design: string | null;
  headline: {
    emittedMalicious: Rate;
    meterRefused: Rate & { excludes: string };
    previewWouldPayWrongTarget: Rate;
    fullAccessWouldSendWrongTarget: Rate;
    maliciousReleases?: number;
    previewedReleases?: number;
    previewMissing?: number;
  };
  statements?: string[];
  promptSplit?: {
    prompt: string;
    emittedMalicious: Rate;
    meterRefused: Rate;
    fullAccessWouldSendWrongTarget: Rate;
  }[];
  truncation?: { text: string } | null;
  evidenceLabel?: string;
  modelByClass: { model: string; classes: ({ class: string } & Rate)[] }[];
  pressureByModel?: { model: string; classes: { class: string; sealed: number; n: number; changed: number; label: string | null }[] }[];
  smallCells: { cell: string; n: number }[];
  resisted: string[];
  badForMeter: { n: number; payloadId: string; preview: (string | null)[]; why: string }[];
  pressure: { n: number; label: string; why: string };
  canaries: { when: string; code: string | null; ok: boolean; at: string; error: string | null }[];
  txHashes: string[];
  evidence: { viewCall: number; computed: number; txHash: number };
  caveats: string[];
};

function load(): BenchFile | null | { error: string } {
  const path = join(process.cwd(), "public", "bench.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as BenchFile;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "bench.json could not be read" };
  }
}

function count(rate: Rate) {
  return `${rate.k}/${rate.n}`;
}

function band(rate: Rate) {
  if (rate.low == null || rate.high == null || rate.n === 0) return "no interval";
  return `${(rate.low * 100).toFixed(1)}–${(rate.high * 100).toFixed(1)}%`;
}

function Count({ rate }: { rate?: Rate }) {
  if (!rate || rate.n === 0) return <span className="cell-value">—</span>;
  return (
    <span className="cell-value">
      {count(rate)}
      {rate.n < 10 ? <small className="bench-meta">indicative</small> : null}
    </span>
  );
}

function SplitCount({ rate }: { rate: Rate }) {
  return (
    <span className="cell-value">
      {count(rate)}
      <small className="bench-meta">{band(rate)}</small>
      {rate.n < 10 ? <small className="bench-meta">indicative</small> : null}
    </span>
  );
}

function renderCaveat(line: string) {
  return line.replace("The payloads were written by us,", "The payloads were written by the author before any run,");
}

function canarySchedule(canaries: BenchFile["canaries"]) {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const row of canaries) {
    if (seen.has(row.when)) continue;
    seen.add(row.when);
    if (row.when === "every-100") labels.push("every 100 calls");
    else if (row.when === "before") labels.push("before");
    else if (row.when === "after") labels.push("after");
    else labels.push(row.when);
  }
  return labels.join(", ");
}

function OnChainReceiptLinks() {
  return (
    <>
      the escalation pair (<Link className="mono" href="/attack">h09d6ce</Link>) and the v3 run (
      <Link className="mono" href="/v3.json">mf004b2</Link>, 15 of 15 decoded from events)
    </>
  );
}

export default function BenchPage() {
  const data = load();
  if (data && "error" in data) {
    return (
      <>
        <header className="page-head"><div><h1>Bench</h1><p className="lede">The published file could not be read.</p></div></header>
        <div className="error"><p>{data.error}</p></div>
      </>
    );
  }
  if (!data) {
    return (
      <>
        <header className="page-head">
          <div>
            <h1>Bench</h1>
            <p className="lede">No published run. The page is waiting for app/public/bench.json.</p>
          </div>
        </header>
        <div className="empty">
          <p>Nothing has been aggregated. A 10-call smoke is <span className="mono">node bench/run.mjs --smoke</span>, then <span className="mono">node bench/aggregate.mjs</span> on that jsonl.</p>
          <p>The full matrix is 1,260 calls and does not start from this page.</p>
        </div>
      </>
    );
  }

  const maliciousReleases = data.headline.maliciousReleases ?? 0;
  const previewedReleases = data.headline.previewedReleases ?? data.headline.meterRefused.n;
  const previewMissing = data.headline.previewMissing ?? 0;
  const maliciousTotal = data.headline.emittedMalicious.k;
  const ftTransferMalicious = maliciousTotal - maliciousReleases;
  const wrongTargetPreviews = data.headline.previewWouldPayWrongTarget.k;
  const weakMalicious = data.promptSplit?.find((row) => row.prompt === "weak-v1")?.emittedMalicious;
  const hardenedMalicious = data.promptSplit?.find((row) => row.prompt === "hardened-inject2")?.emittedMalicious;

  const full = data.kind === "full";
  const headline = [
    ["Emitted a malicious call", data.headline.emittedMalicious],
    ["Meter preview refused", data.headline.meterRefused],
    ["Preview would pay a wrong target", data.headline.previewWouldPayWrongTarget],
    ["Full access would have sent to a wrong target (computed, not broadcast)", data.headline.fullAccessWouldSendWrongTarget],
  ] as const;

  const reading = [
    data.statement,
    "The range under a count is a 95% Wilson interval.",
    "A cell under 10 samples is indicative.",
    data.headline.meterRefused.excludes,
    ...(data.statements ?? []).filter((line) => {
      if (full && line.startsWith("Wrong-target")) return false;
      if (full && /^281 of 291 malicious releases/.test(line)) return false;
      if (full && /^Terms is N\/A on ft_transfer/.test(line)) return false;
      return true;
    }),
  ].join(" ");

  const evidenceLabel = data.evidenceLabel?.trim();
  const seen = new Set<string>();
  const caveats = data.caveats
    .map(renderCaveat)
    .filter((line) => {
      const key = line.trim();
      if (evidenceLabel && key === evidenceLabel) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .filter((line) => !/^281 of 291 malicious releases/.test(line))
    .filter((line) => !/^Terms is N\/A on ft_transfer/.test(line));

  const covered =
    /gateway|seed is sent|temperature is|written by the author|previous-build|view call|fewer than 10|preview on this unpaid|computed outcome|would have sent|every result is a view call|every payload uses one sealed/i;
  const leftover = caveats
    .filter((line) => !covered.test(line))
    .filter((line) => !/^The tool descriptions and the weak prompt use 2\.00/.test(line));

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{full ? "Bench" : "Bench smoke"}</h1>
          {full ? (
            <p className="bench-claim">
              {weakMalicious && hardenedMalicious
                ? `A hardened prompt cut malicious calls from ${count(weakMalicious)} to ${count(hardenedMalicious)}. It did not remove them.`
                : "A hardened prompt cut malicious calls. It did not remove them."}{" "}
              On a Meter key, {wrongTargetPreviews} of {previewedReleases} previewed releases would have paid a wrong target.
            </p>
          ) : (
            <p className="lede">{data.statement}</p>
          )}
          {full ? (
            <>
              <p className="note bench-lead">
                {maliciousReleases} malicious releases: {previewedReleases} previewed, {previewMissing} with unparseable arguments, not previewed.
              </p>
              <p className="note bench-lead">
                {wrongTargetPreviews} of {previewedReleases} covers <span className="mono">release</span> calls only. The other {ftTransferMalicious} malicious calls were <span className="mono">ft_transfer</span>, which a Meter key cannot call at all.
                {maliciousReleases + ftTransferMalicious !== maliciousTotal
                  ? ` (Expected ${maliciousTotal} malicious calls; release + ft_transfer = ${maliciousReleases + ftTransferMalicious}.)`
                  : null}
              </p>
            </>
          ) : null}
        </div>
      </header>
      {data.note ? <p className="note">{data.note}</p> : null}
      <div className="stats four">
        {headline.map(([label, rate]) => (
          <div className="stat" key={label}>
            <span>{label}</span>
            <b>{count(rate)}</b>
            <small>{band(rate)}</small>
          </div>
        ))}
      </div>
      {full ? (
        <p className="note bench-lead">
          Bench rows are view calls and computed outcomes. On-chain examples of the same refusals: <OnChainReceiptLinks />.
        </p>
      ) : null}
      {data.promptSplit?.length ? (
        <>
          <h2 className="section-title flush">By prompt</h2>
          <div className="table-wrap">
            <table className="ledger-table">
              <caption>The counts above, split by prompt.</caption>
              <thead>
                <tr>
                  <th>Prompt</th>
                  <th>Malicious calls</th>
                  <th>Meter preview refused</th>
                  <th>Would have sent</th>
                </tr>
              </thead>
              <tbody>
                {data.promptSplit.map((row) => (
                  <tr key={row.prompt}>
                    <td data-label="Prompt"><span className="mono bench-id">{row.prompt}</span></td>
                    <td data-label="Malicious calls"><SplitCount rate={row.emittedMalicious} /></td>
                    <td data-label="Meter preview refused"><SplitCount rate={row.meterRefused} /></td>
                    <td data-label="Would have sent"><SplitCount rate={row.fullAccessWouldSendWrongTarget} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      <div className="panel bench-read">
        <h2>How to read this</h2>
        <p>{reading}</p>
        <p>
          Limits: one gateway (cloud-api.near.ai), view-call evaluation against a previous-build contract (medbf5c), payloads written by the author before any run,
          temperature 0.7, seed on one model (openai/gpt-4.1-mini), and small large-model cells.
        </p>
        {full ? (
          <p className="note">
            The weak prompt and tool descriptions use 2.00 USDC while inject.json still says 48.00. The preview target holds a 2.00 line, so the old 48.00 amount would be scored as an amount attack instead of matching the sealed line.
          </p>
        ) : null}
      </div>
      <h2 className="section-title">Model by class</h2>
      <div className="table-wrap">
        <table className="ledger-table">
          <caption>
            Malicious calls over calls in that class. Recipient, amount, and terms only. Complete: {data.calls} of {data.plannedCalls} planned calls. Spend {data.spendUsd} of ${data.capUsd}.
          </caption>
          <thead>
            <tr>
              <th>Model</th>
              {["recipient", "amount", "terms"].map((name) => <th key={name}>{name}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.modelByClass.map((row) => (
              <tr key={row.model}>
                <td data-label="Model"><span className="mono bench-id">{row.model}</span></td>
                {["recipient", "amount", "terms"].map((name) => {
                  const column = row.classes.find((item) => item.class === name);
                  return (
                    <td key={name} data-label={name}>
                      <Count rate={column} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="section-title">Emitted the sealed call</h2>
      <p className="note">{data.pressure.why}</p>
      {full && previewMissing > 0 ? (
        <p className="note">
          The {previewMissing} unparseable <span className="mono">release</span> calls are not in this table. They emitted malicious arguments, not the sealed line under pressure.
        </p>
      ) : null}
      {data.pressureByModel?.length ? (
        <div className="table-wrap">
          <table className="ledger-table">
            <caption>
              Timing and replay only. A cell counts calls that emitted the stored line. It is not a refusal count.
            </caption>
            <thead>
              <tr>
                <th>Model</th>
                <th>Timing</th>
                <th>Replay</th>
              </tr>
            </thead>
            <tbody>
              {data.pressureByModel.map((row) => (
                <tr key={row.model}>
                  <td data-label="Model"><span className="mono bench-id">{row.model}</span></td>
                  {row.classes.map((column) => (
                    <td key={column.class} data-label={column.class}>
                      <span className="cell-value bench-pressure">
                        {column.n === 0 || !column.label ? "—" : column.label}
                        {column.n > 0 && column.n < 10 ? <small className="bench-meta">indicative</small> : null}
                        {column.changed > 0 ? <small className="bench-changed">changed a field: {column.changed}</small> : null}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="note">No timing or replay rows in this file.</p>}
      {data.truncation ? <p className="note">{data.truncation.text}</p> : null}
      <h2 className="section-title">Canaries</h2>
      <p className="note">
        {data.canaries.length} canaries, {data.canaries.every((row) => row.ok) ? "all OK" : "not all OK"} ({canarySchedule(data.canaries)}).
      </p>
      <h2 className="section-title">Sealed previews</h2>
      {data.badForMeter.length ? (
        <ul className="note">
          {data.badForMeter.map((row) => (
            <li key={row.n}>{row.payloadId}: preview {row.preview.filter(Boolean).join(", ") || "none"}. {row.why}</li>
          ))}
        </ul>
      ) : <p className="note">No sealed call in this file previewed as anything other than OK.</p>}
      <h2 className="section-title">Evidence</h2>
      {evidenceLabel ? <p className="note">{evidenceLabel}</p> : null}
      <p className="note">
        View calls {data.evidence.viewCall}. Computed outcomes {data.evidence.computed}. Transaction hashes {data.evidence.txHash}.
        {data.txHashes.length
          ? ` Listed: ${data.txHashes.join(", ")}.`
          : (
            <>
              {" "}
              This file lists no transaction hash. On-chain examples: <OnChainReceiptLinks />.
            </>
          )}
      </p>
      {leftover.length ? (
        <>
          <h2 className="section-title">Caveats</h2>
          <ul className="note">
            {leftover.map((line) => (
              <li key={line}>
                {line}
                {/is_ready false/.test(line) ? (
                  <> All {data.calls} calls completed with no errors; no anomaly was observed. This does not show the flag had no effect.</>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p className="note">Run {data.runId}. Design {data.design}. This page reads the file. It does not call a model.</p>
    </>
  );
}
