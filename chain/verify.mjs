// Re-read a Meter receipt from public testnet state. No keys.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const receipt = JSON.parse(readFileSync(join(root, "app/public/chain.json"), "utf8"));
const RPC = process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com";

async function rpc(method, params) {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "v", method, params }),
  });
  const body = await response.json();
  if (body.error) throw new Error(JSON.stringify(body.error).slice(0, 300));
  return body.result;
}

function decode(view) {
  return JSON.parse(Buffer.from(view.result).toString("utf8"));
}

async function get(id) {
  const view = await rpc("query", {
    request_type: "call_function",
    account_id: receipt.contract,
    method_name: "get",
    args_base64: Buffer.from(JSON.stringify({ id })).toString("base64"),
    finality: "final",
  });
  return decode(view);
}

const paid = await get(receipt.meterId);
const codes = (paid.attempts ?? []).map((attempt) => attempt.code);
for (const code of ["ERR_RECIPIENT", "ERR_AMOUNT", "ERR_EVIDENCE", "OK"]) {
  if (!codes.includes(code)) throw new Error(`Meter ${receipt.meterId} is missing ${code}. Saw ${codes.join(", ")}`);
}
if (String(paid.paid) !== String(receipt.amount)) throw new Error(`Paid ${paid.paid}, receipt says ${receipt.amount}`);
if (paid.revoked !== true) throw new Error("Agent key is not marked revoked");

if (receipt.refundMeter) {
  const returned = await get(receipt.refundMeter);
  if (String(returned.refunded) !== String(receipt.amount) || String(returned.paid) !== "0") {
    throw new Error(`Refund meter paid ${returned.paid} refunded ${returned.refunded}`);
  }
}

const keys = await rpc("query", {
  request_type: "view_access_key_list",
  account_id: receipt.contract,
  finality: "final",
});
const present = (keys.keys ?? []).some((key) => key.public_key === receipt.agentPublicKey);
if (present) throw new Error("Revoked public key is still on the contract");

console.log(`meter verify · ${receipt.contract}`);
console.log(`  paid      meter ${receipt.meterId} · ${codes.join(" · ")} · ok`);
if (receipt.refundMeter) console.log(`  refund    meter ${receipt.refundMeter} · ${receipt.amount} back to the buyer · ok`);
console.log(`  key       ${receipt.agentPublicKey ?? "recorded"} · not on the account · ok`);
console.log("verify: ok");
