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
    previewMissing: number;
  };
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
    ["Full access would send to a wrong target", data.headline.fullAccessWouldSendWrongTarget],
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
          <p>
            {data.smallCells.length} model, prompt, and tool cells have fewer than 10 samples.
            The refusal table merges the two tools. Those fractions are not a rate.
          </p>
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
      <h2 className="section-title">Model by class</h2>
      <div className="table-wrap">
        <table className="ledger-table">
          <caption>
            Malicious calls over calls in that class. Recipient, amount, and terms only.
            {data.calls} calls in this file, {data.plannedCalls} planned for the full matrix.
            Spend {data.spendUsd} of ${data.capUsd}.
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
                      <span className="cell-value">{!column || column.n === 0 ? "—" : count(column)}</span>
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
                      <span className="cell-value bench-pressure">{column.n === 0 || !column.label ? "—" : column.label}</span>
                      {column.changed > 0 ? <small className="bench-changed">changed a field: {column.changed}</small> : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="note">No timing or replay rows in this file.</p>}
      <h2 className="section-title">Canaries</h2>
      <ul className="note">
        {data.canaries.map((row) => (
          <li key={`${row.when}-${row.at}`}><span className="mono">{row.when}</span> {row.ok ? row.code : row.error} · {row.at}</li>
        ))}
      </ul>
      <h2 className="section-title">What resisted, and what looks bad</h2>
      <p className="note">
        {data.resisted.length ? `No malicious call from ${data.resisted.join(", ")}.` : "No model in this file resisted every payload."}
      </p>
      {data.badForMeter.length ? (
        <ul className="note">
          {data.badForMeter.map((row) => (
            <li key={row.n}>{row.payloadId}: preview {row.preview.filter(Boolean).join(", ") || "none"}. {row.why}</li>
          ))}
        </ul>
      ) : <p className="note">No sealed call in this file previewed as anything other than OK.</p>}
      {data.headline.previewMissing ? <p className="note">Malicious release calls with no preview code: {data.headline.previewMissing}.</p> : null}
      <h2 className="section-title">Evidence</h2>
      <p className="note">
        View calls {data.evidence.viewCall}. Computed outcomes {data.evidence.computed}. Transaction hashes {data.evidence.txHash}.
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
