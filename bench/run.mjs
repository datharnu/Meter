// Runs the frozen matrix in bench/config.json. Does not edit that file or bench/payloads.json.
// Default refuses to start. --smoke is 10 calls. --full is the 1,260-call run.
// Preview is a view call. This process never broadcasts a transaction.

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { previewView } from "./preview.mjs";
import {
  buildCells,
  callAtoms,
  CAP_ATOMS,
  ceilingAtoms,
  classify,
  formatUsd,
  SMOKE,
  unitsOf,
  wouldExceedCap,
} from "./score.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DESIGN = "9c9142eee35449c83f4aabc2fb5807b174b857d6";
const config = JSON.parse(readFileSync(join(root, "bench/config.json"), "utf8"));
const payloads = JSON.parse(readFileSync(join(root, "bench/payloads.json"), "utf8"));
const line = config.target;

function git(args) {
  return execSync(`git ${args}`, { cwd: root, encoding: "utf8" }).trim();
}

function assertFrozen() {
  const diff = execSync(`git diff ${DESIGN} -- bench/payloads.json bench/config.json`, { cwd: root, encoding: "utf8" });
  if (diff.trim()) throw new Error("bench/payloads.json or bench/config.json differs from 9c9142e. Not running.");
}

function assertHarness(full) {
  const branch = git("rev-parse --abbrev-ref HEAD");
  if (branch !== "bench") throw new Error(`Bench runs on branch bench. Current branch is ${branch}.`);
  const harness = git("rev-parse HEAD");
  if (!full) return harness;
  const dirty = execSync(
    "git status --porcelain -- bench/run.mjs bench/score.mjs bench/preview.mjs bench/aggregate.mjs bench/config.json bench/payloads.json",
    { cwd: root, encoding: "utf8" },
  );
  if (dirty.trim()) throw new Error("Harness files differ from HEAD. Commit them before the full run.");
  return harness;
}

function apiKey() {
  const row = readFileSync(join(root, ".env"), "utf8")
    .split(/\r?\n/)
    .find((item) => item.startsWith("NEARAI_API_KEY=") && !item.startsWith("#"));
  const value = row?.slice("NEARAI_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
  if (!value) throw new Error("NEARAI_API_KEY is missing");
  return value;
}

function redact(text, key) {
  return String(text ?? "").split(key).join("[redacted]");
}

function evidenceHex(sentence) {
  return createHash("sha256").update(Buffer.from(String(sentence ?? "").normalize("NFC"), "utf8")).digest("hex");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function smokeCells() {
  return SMOKE.map(([modelId, promptId, toolSetId, payloadId, sample]) => ({ modelId, promptId, toolSetId, payloadId, sample }));
}

async function complete(model, prompt, tools, text, key) {
  const body = {
    model: model.id,
    temperature: config.temperature,
    max_tokens: model.maxTokens,
    tool_choice: config.toolChoice,
    tools,
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: text },
    ],
  };
  if (model.seed != null) body.seed = model.seed;
  let last = "";
  let lastStatus = 0;
  for (let attempt = 1; attempt <= config.http.attempts; attempt += 1) {
    let response;
    try {
      response = await fetch(`${config.gateway}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (error) {
      last = redact(error?.message ?? error, key);
      lastStatus = 0;
      if (attempt === config.http.attempts) break;
      await sleep(1500 * attempt);
      continue;
    }
    const raw = await response.text();
    if (config.http.retryStatuses.includes(response.status)) {
      last = redact(raw.slice(0, 240), key);
      lastStatus = response.status;
      if (attempt === config.http.attempts) break;
      await sleep(1500 * attempt);
      continue;
    }
    if (!response.ok) return { error: redact(`HTTP ${response.status}: ${raw.slice(0, 240)}`, key) };
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { error: "unparseable body" };
    }
    const message = parsed.choices?.[0]?.message;
    if (!message) return { error: "no message" };
    return {
      id: parsed.id ?? null,
      returnedModel: parsed.model ?? null,
      finishReason: parsed.choices?.[0]?.finish_reason ?? null,
      message,
      usage: parsed.usage ?? null,
    };
  }
  return { error: redact(`failed after ${config.http.attempts} attempts: HTTP ${lastStatus}: ${last}`, key) };
}

async function canary(when) {
  const view = await previewView(line.contract, {
    id: line.meterId,
    recipient: line.recipient,
    amount: line.amount,
    evidenceHex: line.evidenceHex,
  });
  return { type: "canary", when, expect: "OK", ...view, ok: view.code === "OK" };
}

async function previewRelease(call) {
  const units = unitsOf(call.args.amount);
  if (!units || !call.args.recipient) {
    return { code: null, at: new Date().toISOString(), rpc: null, error: "amount or recipient did not parse", evidence: "view call" };
  }
  const view = await previewView(line.contract, {
    id: line.meterId,
    recipient: String(call.args.recipient),
    amount: units,
    evidenceHex: evidenceHex(call.args.sentence),
  });
  return { ...view, evidence: "view call" };
}

function computedTransfer(call) {
  return {
    to: String(call.args.to ?? ""),
    amount: String(call.args.amount ?? ""),
    amountBase: unitsOf(call.args.amount),
    label: "would have sent (computed, not broadcast)",
    evidence: "computed",
    txHash: null,
  };
}

function write(path, row) {
  appendFileSync(path, `${JSON.stringify(row)}\n`);
}

function usage() {
  console.error("Usage: node bench/run.mjs --smoke | --full");
  console.error("--smoke  10 calls. --full  the 1,260-call matrix. Bare invocation does not run.");
  process.exit(1);
}

async function main() {
  const smoke = process.argv.includes("--smoke");
  const full = process.argv.includes("--full");
  if (smoke === full) usage();
  assertFrozen();
  const harness = assertHarness(full);
  if (evidenceHex(line.sentence) !== line.evidenceHex) throw new Error("Stored evidence hex does not match the sentence");
  const key = apiKey();
  const models = new Map(config.models.map((model) => [model.id, model]));
  const prompts = config.prompts;
  const payloadById = new Map(payloads.payloads.map((row) => [row.id, row]));
  const cells = smoke ? smokeCells() : buildCells(config, payloads.payloads);
  const runId = `${smoke ? "smoke" : "full"}-${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`;
  const out = join(root, "bench/results", `${runId}.jsonl`);
  mkdirSync(dirname(out), { recursive: true });
  let spent = 0n;
  let calls = 0;
  let lastGoodCall = 0;
  write(out, {
    type: "meta",
    runId,
    design: DESIGN,
    harness,
    smoke,
    planned: smoke ? SMOKE.length : cells.length,
    capUsd: formatUsd(CAP_ATOMS),
    startedAt: new Date().toISOString(),
  });
  console.log(`run ${runId}`);
  console.log(`file ${out}`);

  const first = await canary("before");
  write(out, first);
  console.log(`canary before ${first.code ?? first.error} ${first.at}`);
  let canaryAt = first.at;
  if (!first.ok) {
    console.error("Canary failed before any model call. Stopped.");
    process.exit(2);
  }

  for (const cell of cells) {
    const model = models.get(cell.modelId);
    const payload = payloadById.get(cell.payloadId);
    const prompt = prompts[cell.promptId];
    const toolSet = config.toolSets[cell.toolSetId];
    if (!model || !payload || !prompt || !toolSet) throw new Error(`Missing cell ${cell.modelId} ${cell.promptId} ${cell.toolSetId} ${cell.payloadId}`);
    const next = ceilingAtoms(model);
    if (wouldExceedCap(spent, next)) {
      write(out, { type: "stop", reason: "budget", spentUsd: formatUsd(spent), at: new Date().toISOString() });
      console.log(`budget stop at ${formatUsd(spent)}`);
      break;
    }
    const completion = await complete(model, prompt.text, toolSet.tools, payload.text, key);
    const judged = classify({
      message: completion.message,
      finishReason: completion.finishReason,
      error: completion.error,
      toolSet: cell.toolSetId,
      line,
      className: payload.class,
    });
    const cost = callAtoms(model, completion.usage);
    spent += cost;
    calls += 1;
    const previews = [];
    let halt = null;
    if (!completion.error && cell.toolSetId === "release") {
      for (const call of judged.calls.filter((item) => item.kind === "release")) {
        const view = await previewRelease(call);
        previews.push({ malicious: call.malicious, sealed: call.sealed, ...view });
        if (call.malicious && view.code === "OK") {
          halt = "release differed from the stored line and preview returned OK";
          break;
        }
        if (call.sealed && view.code !== "OK") {
          halt = `release matched the stored line and preview returned ${view.code ?? view.error}`;
          break;
        }
      }
    }
    const previewedAt = previews.length ? previews[previews.length - 1].at : null;
    const row = {
      type: "call",
      n: calls,
      runId,
      model: cell.modelId,
      returnedModel: completion.returnedModel ?? null,
      prompt: cell.promptId,
      toolSet: cell.toolSetId,
      payloadId: cell.payloadId,
      class: payload.class,
      vector: payload.vector,
      sample: cell.sample,
      outcome: judged.outcome,
      report: judged.report,
      finishReason: completion.finishReason ?? null,
      calls: judged.calls.map((call) => ({ name: call.name, args: call.args, kind: call.kind, malicious: call.malicious, sealed: call.sealed })),
      content: typeof completion.message?.content === "string" ? completion.message.content.slice(0, 500) : null,
      completionId: completion.id ?? null,
      usage: completion.usage ?? null,
      costAtoms: cost.toString(),
      spentAtoms: spent.toString(),
      costUsd: formatUsd(cost),
      spentUsd: formatUsd(spent),
      canaryAt,
      previewedAt,
      previews,
      computed: cell.toolSetId === "ft_transfer"
        ? judged.calls.filter((call) => call.kind === "ft_transfer").map(computedTransfer)
        : null,
      evidence: cell.toolSetId === "release" ? "view call" : "computed",
      txHash: null,
      error: completion.error ?? null,
      halt,
    };
    write(out, row);
    const code = previews.map((item) => item.code ?? item.error).join(",") || "-";
    console.log(`${calls} ${cell.toolSetId} ${cell.payloadId} ${judged.outcome} preview ${code} spent ${formatUsd(spent)}`);
    if (halt) {
      write(out, { type: "halt", reason: halt, call: calls, at: new Date().toISOString() });
      console.error(`STOP ${halt}`);
      process.exit(3);
    }
    if (calls % 100 === 0) {
      const mid = await canary("every-100");
      write(out, mid);
      console.log(`canary every-100 ${mid.code ?? mid.error}`);
      if (!mid.ok) {
        write(out, { type: "flag", reason: "canary failed", fromCall: lastGoodCall + 1, throughCall: calls, at: mid.at });
        console.error("Canary failed. Flagged rows since the previous OK canary. Stopped.");
        process.exit(2);
      }
      lastGoodCall = calls;
      canaryAt = mid.at;
    }
  }

  const last = await canary("after");
  write(out, last);
  console.log(`canary after ${last.code ?? last.error} ${last.at}`);
  if (!last.ok) {
    write(out, { type: "flag", reason: "canary failed", fromCall: lastGoodCall + 1, throughCall: calls, at: last.at });
    console.error("Canary failed after the run. Flagged rows since the previous OK canary.");
    process.exit(2);
  }
  console.log(`done ${calls} calls ${formatUsd(spent)} ${out}`);
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invoked) {
  main().catch((error) => {
    console.error(error?.message ?? error);
    process.exit(1);
  });
}
