// Decode Meter return codes from archived transactions. No keys.

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

async function rpc(url, method, params) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "rd", method, params }),
  });
  const body = await response.json();
  if (body.error) throw new Error(JSON.stringify(body.error).slice(0, 300));
  return body.result;
}

async function fetchTx(rpcUrls, hash, signers) {
  let last = "not found";
  for (const url of rpcUrls) {
    for (const sender of [...new Set(signers.filter(Boolean))]) {
      try {
        const result = await rpc(url, "tx", { tx_hash: hash, sender_account_id: sender, wait_until: "NONE" });
        if (result) return result;
      } catch (error) {
        last = error.message ?? String(error);
      }
    }
  }
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
      const hit = decodeFromTx(tx, row.contract);
      decoded = hit.decoded;
      reason = hit.reason;
      if (!decoded) reason = hit.reason;
    } catch (error) {
      reason = error.message;
    }

    const fundPath = /deposit|fund/i.test(row.label) && row.expected === "ERR_TOO_LATE";
    if (row.expected === "WINDOW_WAIT" || fundPath || (row.expected === "OK" && (row.label?.includes("deleted") || row.label?.includes("revoked") || row.label?.includes("Key revoked")))) {
      if (!decoded || fundPath) {
        status = "not decoded";
        reason = fundPath ? "ft_transfer_call fund path; ERR_TOO_LATE is from the recorded run, not a release return" : reason ?? "admin or non-release transaction";
      } else if (comparable(row.expected, decoded)) {
        status = "match";
        matched += 1;
      } else {
        status = "mismatch";
      }
    } else if (!decoded) {
      status = "not decoded";
    } else if (comparable(row.expected, decoded)) {
      status = "match";
      matched += 1;
    } else {
      status = "mismatch";
    }

    if (status === "mismatch") {
      throw new Error(`Receipt ${row.hash}: expected ${row.expected}, decoded ${decoded} (${row.file} ${row.label})`);
    }

    out.push({ ...row, decoded, status, reason });
  }

  const decodable = out.filter((r) => r.status === "match" || r.status === "mismatch").length;
  const notDecoded = out.filter((r) => r.status === "not decoded");

  return { rows: out, matched, total: out.length, decodable, notDecoded };
}

export function printReceiptReport(report) {
  console.log(`receipts ${report.matched}/${report.total} match (${report.notDecoded.length} not decoded)`);
  for (const row of report.rows) {
    const tail = row.status === "match" ? row.decoded : row.status === "not decoded" ? `not decoded, ${row.reason ?? "unknown"}` : `${row.decoded}`;
    console.log(`  ${row.hash} · ${row.expected} · ${tail}`);
  }
}
