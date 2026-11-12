// Decode Meter return codes from archived transactions. No keys.

import { existsSync } from "node:fs";

const ARCHIVAL = "https://archival-rpc.testnet.fastnear.com";

function parseReturn(status) {
  if (!status) return null;
  if (status.SuccessValue) {
    const raw = Buffer.from(status.SuccessValue, "base64").toString("utf8");
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === "string" ? parsed : raw;
    } catch {
      return raw.replace(/^"|"$/g, "");
    }
  }
  if (status.Failure) {
    const text = JSON.stringify(status.Failure);
    const code = text.match(/ERR_[A-Z_]+|AccessKeyDoesNotExist|MethodNotAllowed|DepositNotAllowed/)?.[0];
    return code ?? null;
  }
  return null;
}

function decodeFromTx(result, contract) {
  const hits = [];
  for (const receipt of result?.receipts_outcome ?? []) {
    if (receipt.receiver_id !== contract) continue;
    const code = parseReturn(receipt.outcome?.status);
    if (code) hits.push({ code, receipt: receipt.receipt_id });
  }
  const top = parseReturn(result?.status);
  if (top) hits.push({ code: top, receipt: "transaction" });
  if (!hits.length) return { decoded: null, reason: "no SuccessValue or ERR_* on contract receipts" };
  const last = hits[hits.length - 1];
  return { decoded: last.code, reason: hits.length > 1 ? `${hits.length} contract outcomes; used last` : null };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A row the RPC still will not serve after retries. Distinct from a pruned tx.
export const RATE_LIMIT_LABEL = "not decoded: rate limited (429)";
const MAX_TRIES = 5;

function gapMs() {
  const n = Number(process.env.METER_RPC_GAP_MS);
  return Number.isFinite(n) && n >= 0 ? n : 200;
}

function backoffMs(attempt) {
  const n = Number(process.env.METER_RPC_BACKOFF_MS);
  const base = Number.isFinite(n) && n >= 0 ? n : 400;
  return base * 2 ** attempt;
}

function rateLimitError() {
  const error = new Error(RATE_LIMIT_LABEL);
  error.rateLimited = true;
  return error;
}

function isRateLimited(error) {
  if (!error || typeof error !== "object") return false;
  if (error.code === -429 || error.code === 429) return true;
  return /rate limit/i.test(String(error.message ?? ""));
}

let nextAt = 0;

async function pace() {
  const now = Date.now();
  const wait = Math.max(0, nextAt - now);
  nextAt = now + wait + gapMs();
  if (wait) await sleep(wait);
}

export async function rpcCall(url, method, params) {
  let last = rateLimitError();
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    await pace();
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "rd", method, params }),
    });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    const error = body?.error ?? null;
    if (response.status === 429 || isRateLimited(error)) {
      last = rateLimitError();
      if (attempt < MAX_TRIES - 1) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw last;
    }
    if (!response.ok) throw new Error((text || `HTTP ${response.status}`).slice(0, 300));
    if (error) throw new Error(JSON.stringify(error).slice(0, 300));
    return body?.result;
  }
  throw last;
}

async function rpc(url, method, params) {
  return rpcCall(url, method, params);
}

async function fetchTx(rpcUrls, hash, signers) {
  let last = "not found";
  let limited = false;
  for (const url of rpcUrls) {
    for (const sender of [...new Set(signers.filter(Boolean))]) {
      try {
        const result = await rpc(url, "tx", { tx_hash: hash, sender_account_id: sender, wait_until: "NONE" });
        if (result) return result;
      } catch (error) {
        last = error.message ?? String(error);
        if (error.rateLimited) {
          // The limit is on this client, not on the signer. The next host gets its own five tries.
          limited = true;
          break;
        }
      }
    }
  }
  if (limited) throw rateLimitError();
  if (/UNKNOWN_TRANSACTION|doesn't exist/i.test(last)) return null;
  throw new Error(last);
}

function collectRows(root, readFileSync, join) {
  const rows = [];
  const add = (file, step, contract) => {
    if (!step?.hash) return;
    rows.push({
      file,
      hash: step.hash,
      expected: step.code ?? step.expected ?? "OK",
      contract: contract ?? step.contract,
      signers: [step.signer, step.buyer, step.vendor, contract].filter(Boolean),
      label: step.label ?? step.what ?? "",
    });
  };

  const load = (name) => JSON.parse(readFileSync(join(root, "app/public", name), "utf8"));

  if (existsSync(join(root, "app/public/real-token.json"))) {
    const data = load("real-token.json");
    for (const step of data.steps ?? []) {
      add("real-token.json", { ...step, buyer: data.buyer, vendor: data.vendor }, data.contract);
    }
    for (const step of data.refundRun ?? []) {
      add("real-token.json", { ...step, buyer: data.buyer, vendor: data.vendor }, data.contract);
    }
    if (data.earlyRefundRun?.hash) {
      add(
        "real-token.json",
        {
          label: "Refund before deadline",
          hash: data.earlyRefundRun.hash,
          code: data.earlyRefundRun.code ?? "ERR_TOO_EARLY",
          signer: data.earlyRefundRun.signer ?? data.buyer,
          buyer: data.buyer,
        },
        data.contract,
      );
    }
  }

  for (const name of ["chain.json", "tee.json", "v2.json"]) {
    const data = load(name);
    for (const step of data.steps ?? []) {
      add(name, { ...step, buyer: data.buyer, vendor: data.vendor }, data.contract);
    }
    if (data.lateDeposit?.hash) {
      add(name, {
        label: "Late deposit",
        hash: data.lateDeposit.hash,
        code: data.lateDeposit.code,
        signer: data.lateDeposit.signer,
        buyer: data.buyer,
      }, data.contract);
    }
  }

  const inject = load("inject.json");
  for (const step of inject.failureKept ?? []) {
    add("inject.json", { ...step, label: step.what, signer: inject.buyer }, step.contract);
  }
  for (const attack of inject.attacks ?? []) {
    const trials = attack.parts ? Object.values(attack.parts).flatMap((p) => p.trials ?? []) : attack.trials ?? [];
    for (const trial of trials) {
      if (!trial.broadcast || !trial.hash) continue;
      add("inject.json", {
        label: `attack ${attack.id} trial ${trial.n}`,
        hash: trial.hash,
        code: trial.code ?? (attack.kind === "permission" ? trial.failure : "OK"),
        signer: trial.signer ?? inject.contract,
        buyer: inject.buyer,
      }, inject.contract);
    }
  }

  return rows;
}

function comparable(expected, decoded) {
  if (expected === decoded) return true;
  if (expected === "OK" && decoded === "OK") return true;
  if (expected === "AccessKeyDoesNotExist" && /AccessKeyDoesNotExist|UNKNOWN_ACCESS_KEY|does not exist/i.test(decoded ?? "")) return true;
  if (expected === "WINDOW_WAIT") return decoded === null;
  return false;
}

export function judgeReceipt(row, decoded, reason) {
  let status;
  const fundOkReturn = row.file === "real-token.json" && /fund/i.test(row.label) && row.expected === "OK" && decoded && /^\d+$/.test(String(decoded));
  if (fundOkReturn) {
    return { status: "match", decoded, reason: "ft_transfer_call return amount" };
  }

  const fundPath = /deposit|fund/i.test(row.label) && row.expected === "ERR_TOO_LATE";
  if (row.expected === "WINDOW_WAIT" || fundPath || (row.expected === "OK" && (row.label?.includes("deleted") || row.label?.includes("revoked") || row.label?.includes("Key revoked")))) {
    if (!decoded || fundPath) {
      status = "not decoded";
      reason = fundPath ? "ft_transfer_call fund path; ERR_TOO_LATE is from the recorded run, not a release return" : reason ?? "admin or non-release transaction";
    } else if (comparable(row.expected, decoded)) {
      status = "match";
    } else {
      status = "mismatch";
    }
  } else if (!decoded) {
    status = "not decoded";
  } else if (comparable(row.expected, decoded)) {
    status = "match";
  } else {
    status = "mismatch";
  }

  if (status === "mismatch") {
    throw new Error(`Receipt ${row.hash}: expected ${row.expected}, decoded ${decoded} (${row.file} ${row.label})`);
  }
  return { status, decoded, reason };
}

export async function verifyReceiptRows(root, readFileSync, join, rpcUrl) {
  const rpcUrls = [...new Set([ARCHIVAL, rpcUrl].filter(Boolean))];
  const rows = collectRows(root, readFileSync, join);
  const out = [];
  let matched = 0;

  for (const row of rows) {
    let status;
    let decoded = null;
    let reason = null;
    try {
      const tx = await fetchTx(rpcUrls, row.hash, [...row.signers, row.contract]);
      if (!tx) {
        status = "not decoded";
        reason = "not decoded: pruned";
        out.push({ ...row, decoded: null, status, reason });
        continue;
      }
      const hit = decodeFromTx(tx, row.contract);
      decoded = hit.decoded;
      reason = hit.reason;
      if (!decoded) reason = hit.reason;
    } catch (error) {
      if (error.rateLimited) {
        out.push({ ...row, decoded: null, status: "not decoded", reason: RATE_LIMIT_LABEL });
        continue;
      }
      reason = error.message;
    }

    const judged = judgeReceipt(row, decoded, reason);
    if (judged.status === "match") matched += 1;
    out.push({ ...row, decoded: judged.decoded, status: judged.status, reason: judged.reason });
  }

  const decodable = out.filter((r) => r.status === "match" || r.status === "mismatch").length;
  const notDecoded = out.filter((r) => r.status === "not decoded");

  return { rows: out, matched, total: out.length, decodable, notDecoded };
}

export { ARCHIVAL, decodeFromTx, fetchTx };

export function printReceiptReport(report) {
  console.log(`receipts ${report.matched}/${report.total} match (${report.notDecoded.length} not decoded)`);
  for (const row of report.rows) {
    const tail = row.status === "match" ? row.decoded : row.status === "not decoded" ? (String(row.reason ?? "").startsWith("not decoded") ? row.reason : `not decoded, ${row.reason ?? "unknown"}`) : `${row.decoded}`;
    console.log(`  ${row.hash} · ${row.expected} · ${tail}`);
  }
}
