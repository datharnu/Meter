#!/usr/bin/env node
// View-only preview: same args as release. No key. Does not count toward the tripwire.

import { createHash } from "node:crypto";

const ARCHIVAL = "https://archival-rpc.testnet.fastnear.com";
const RPC = process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com";

function usage() {
  console.error(`Usage: node chain/check.mjs --meter <account> --id <u64> --recipient <account> --amount <base units> --sentence <text>`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i];
    const val = argv[i + 1];
    if (!key?.startsWith("--") || val == null) usage();
    out[key.slice(2)] = val;
  }
  if (!out.meter || !out.id || !out.recipient || !out.amount || !out.sentence) usage();
  return {
    meter: out.meter,
    id: Number(out.id),
    recipient: out.recipient,
    amount: out.amount,
    evidence_hex: createHash("sha256").update(Buffer.from(out.sentence.normalize("NFC"), "utf8")).digest("hex"),
  };
}

async function rpc(url, method, params) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "c", method, params }),
  });
  const body = await response.json();
  if (body.error) throw new Error(JSON.stringify(body.error).slice(0, 300));
  return body.result;
}

async function preview(args) {
  const view = await rpc(ARCHIVAL, "query", {
    request_type: "call_function",
    account_id: args.meter,
    method_name: "preview",
    args_base64: Buffer.from(
      JSON.stringify({
        id: args.id,
        recipient: args.recipient,
        amount: args.amount,
        evidence_hex: args.evidence_hex,
      }),
    ).toString("base64"),
    finality: "final",
  });
  return JSON.parse(Buffer.from(view.result).toString("utf8"));
}

const args = parseArgs(process.argv);

for (const url of [ARCHIVAL, RPC]) {
  try {
    const code = await preview({ ...args, meter: args.meter });
    const move = code === "OK" ? "would move the stored amount if release were signed" : "0.00 would move";
    console.log(`preview: ${code}`);
    console.log(move);
    console.log(`meter ${args.meter} · id ${args.id} · view only · rpc ${url === ARCHIVAL ? "archival" : "live"}`);
    process.exit(0);
  } catch (error) {
    if (url === RPC) throw error;
  }
}
