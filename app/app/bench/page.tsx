import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
    previewMissing: number;
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

  const headline = [
    ["Emitted a malicious call", data.headline.emittedMalicious],
    ["Meter preview refused", data.headline.meterRefused],
    ["Preview would pay a wrong target", data.headline.previewWouldPayWrongTarget],
    ["Full access would have sent to a wrong target", data.headline.fullAccessWouldSendWrongTarget],
  ] as const;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{data.kind === "full" ? "Bench" : "Bench smoke"}</h1>
          <p className="lede">{data.statement}</p>
        </div>
      </header>
      {data.note ? <p className="note">{data.note}</p> : null}
      {data.smallCells.length ? (
        <div className="panel">
          <p>A cell with fewer than 10 samples is marked indicative.</p>
        </div>
      ) : null}
      <div className="stats four">
        {headline.map(([label, rate]) => (
          <div className="stat" key={label}>
            <span>{label}</span>
            <b>{count(rate)}</b>
            <small>{band(rate)}</small>
          </div>
        ))}
      </div>
      <p className="note">The ranges under the counts are 95% Wilson intervals.</p>
      <p className="note">{data.headline.meterRefused.excludes}</p>
      {data.statements?.map((line) => <p className="note" key={line}>{line}</p>)}
      {data.promptSplit?.length ? (
        <>
          <h2 className="section-title">By prompt</h2>
          <div className="table-wrap">
            <table className="ledger-table">
              <caption>
                The three counts above, split by prompt. The range under each count is a 95% Wilson interval.
                Terms is N/A on ft_transfer, so the would-have-sent column excludes it.
              </caption>
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
      <h2 className="section-title">Model by class</h2>
      <div className="table-wrap">
        <table className="ledger-table">
          <caption>
            Malicious calls over calls in that class. Recipient, amount, and terms only. A cell under 10 samples is marked indicative. {data.calls} calls in this file, {data.plannedCalls} planned for the full matrix. Spend {data.spendUsd} of ${data.capUsd}.
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
      {data.pressureByModel?.length ? (
        <div className="table-wrap">
          <table className="ledger-table">
            <caption>
              Timing and replay only. A cell counts calls that emitted the stored line. It is not a refusal count.
              A cell under 10 samples is marked indicative.
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
      <ul className="note">
        {data.canaries.map((row) => (
          <li key={`${row.when}-${row.at}`}><span className="mono">{row.when}</span> {row.ok ? row.code : row.error} · {row.at}</li>
        ))}
      </ul>
      <h2 className="section-title">Sealed previews</h2>
      {data.badForMeter.length ? (
        <ul className="note">
          {data.badForMeter.map((row) => (
            <li key={row.n}>{row.payloadId}: preview {row.preview.filter(Boolean).join(", ") || "none"}. {row.why}</li>
          ))}
        </ul>
      ) : <p className="note">No sealed call in this file previewed as anything other than OK.</p>}
      <h2 className="section-title">Evidence</h2>
      <p className="note">
        {data.evidenceLabel ?? "Release rows are a view call against poke meter 1 on a previous-build contract. Full-access outcomes are computed, not broadcast. The label is would have sent."}
        {" "}View calls {data.evidence.viewCall}. Computed outcomes {data.evidence.computed}. Transaction hashes {data.evidence.txHash}.
        {data.txHashes.length ? ` Listed: ${data.txHashes.join(", ")}.` : " This file lists no transaction hash."}
      </p>
      <h2 className="section-title">Caveats</h2>
      <ul className="note">
        {data.caveats.map((line) => <li key={line}>{line}</li>)}
      </ul>
      <p className="note">Run {data.runId}. Design {data.design}. This page reads the file. It does not call a model.</p>
    </>
  );
}
