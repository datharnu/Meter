// Re-read a Meter receipt from public testnet state. No keys.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const receipt = JSON.parse(readFileSync(join(root, "app/public/chain.json"), "utf8"));
const signed = JSON.parse(readFileSync(join(root, "app/public/tee.json"), "utf8"));
const timed = JSON.parse(readFileSync(join(root, "app/public/v2.json"), "utf8"));
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

async function rawCall(account, method, args) {
  const view = await rpc("query", {
    request_type: "call_function",
    account_id: account,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
    finality: "final",
  });
  return Buffer.from(view.result).toString("utf8");
}

async function call(account, method, args) {
  const view = await rpc("query", {
    request_type: "call_function",
    account_id: account,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
    finality: "final",
  });
  return decode(view);
}

async function keysOf(account) {
  const listed = await rpc("query", {
    request_type: "view_access_key_list",
    account_id: account,
    finality: "final",
  });
  return listed.keys ?? [];
}

const paid = await call(receipt.contract, "get", { id: receipt.meterId });
const codes = (paid.attempts ?? []).map((attempt) => attempt.code);
for (const code of ["ERR_RECIPIENT", "ERR_AMOUNT", "ERR_EVIDENCE", "OK"]) {
  if (!codes.includes(code)) throw new Error(`Meter ${receipt.meterId} is missing ${code}. Saw ${codes.join(", ")}`);
}
if (String(paid.paid) !== String(receipt.amount)) throw new Error(`Paid ${paid.paid}, receipt says ${receipt.amount}`);
if (paid.revoked !== true) throw new Error("Agent key is not marked revoked");

if (receipt.refundMeter) {
  const returned = await call(receipt.contract, "get", { id: receipt.refundMeter });
  if (String(returned.refunded) !== String(receipt.amount) || String(returned.paid) !== "0") {
    throw new Error(`Refund meter paid ${returned.paid} refunded ${returned.refunded}`);
  }
}

const present = (await keysOf(receipt.contract)).some((key) => key.public_key === receipt.agentPublicKey);
if (present) throw new Error("Revoked public key is still on the contract");

const meter = await call(signed.contract, "get", { id: signed.meterId });
const signedCodes = (meter.attempts ?? []).map((attempt) => attempt.code);
for (const code of ["ERR_ATTEST_LINE", "OK"]) {
  if (!signedCodes.includes(code)) throw new Error(`Signed meter ${signed.meterId} is missing ${code}. Saw ${signedCodes.join(", ")}`);
}
const refused = (meter.attempts ?? []).find((attempt) => attempt.code === "ERR_ATTEST_LINE");
if (String(refused?.moved) !== "0") throw new Error(`Signed refusal moved ${refused?.moved}`);
if (String(meter.paid) !== String(signed.amount)) throw new Error(`Signed release paid ${meter.paid}, receipt says ${signed.amount}`);
if (meter.revoked !== true) throw new Error("Signed-release key is not marked revoked");
if ((await keysOf(signed.contract)).length !== 0) throw new Error("Signed release still has an access key");
const pin = await call(signed.contract, "tee", {});
const [model, signer] = pin;
if (model !== signed.model) throw new Error(`Pinned model ${model}, receipt says ${signed.model}`);
const pinned = String(signer).replace(/^0x/i, "").toLowerCase();
const expected = String(signed.signer).replace(/^0x/i, "").toLowerCase();
if (pinned !== expected) throw new Error(`Pinned signer ${pinned}, receipt says ${expected}`);

console.log(`meter verify · ${receipt.contract}`);
console.log(`  paid      meter ${receipt.meterId} · ${codes.join(" · ")} · ok`);
if (receipt.refundMeter) console.log(`  refund    meter ${receipt.refundMeter} · ${receipt.amount} back to the buyer · ok`);
console.log(`  key       ${receipt.agentPublicKey ?? "recorded"} · not on the account · ok`);
console.log(`signed release · ${signed.contract}`);
console.log(`  paid      meter ${signed.meterId} · ${signedCodes.join(" · ")} · ok`);
console.log(`  signer    ${model} · ${pinned} · quote not checked · ok`);

const timedRaw = await rawCall(timed.contract, "get", { id: timed.meterId });
const timedMeter = JSON.parse(timedRaw);
const timedCodes = (timedMeter.attempts ?? []).map((attempt) => attempt.code);
for (const code of ["ERR_NOT_YET", "ERR_TRANSFER", "OK", "ERR_ALREADY_PAID"]) {
  if (!timedCodes.includes(code)) throw new Error(`Time gate meter ${timed.meterId} is missing ${code}. Saw ${timedCodes.join(", ")}`);
}
const early = (timedMeter.attempts ?? []).find((attempt) => attempt.code === "ERR_NOT_YET");
const stuck = (timedMeter.attempts ?? []).find((attempt) => attempt.code === "ERR_TRANSFER");
if (String(early?.moved) !== "0" || String(stuck?.moved) !== "0") throw new Error("A time-gate refusal moved tokens");
if (String(timedMeter.paid) !== String(timed.amount) || timedMeter.releasing !== false) {
  throw new Error(`Time gate paid ${timedMeter.paid} releasing ${timedMeter.releasing}`);
}
if (timedMeter.revoked !== true) throw new Error("Time-gate key is not marked revoked");
if ((await keysOf(timed.contract)).length !== 0) throw new Error("Time gate still has an access key");
if (timedMeter.line_hash !== timed.lineHash) throw new Error("Line hash does not match the receipt");
if (timedMeter.recipient !== timed.recipient) throw new Error("Recipient does not match the receipt");
const notBefore = timedRaw.match(/"not_before_ns":(\d+)/)?.[1];
const deadline = timedRaw.match(/"deadline_ns":(\d+)/)?.[1];
if (notBefore !== String(timed.notBefore) || deadline !== String(timed.deadline)) {
  throw new Error(`Window ${notBefore} to ${deadline} does not match the receipt`);
}
console.log(`time gate · ${timed.contract}`);
console.log(`  paid      meter ${timed.meterId} · ${timedCodes.join(" · ")} · ok`);
console.log(`  window    ${notBefore} · quote not checked · ok`);
console.log("verify: ok");
