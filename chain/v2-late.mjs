// On the recorded time-gate contract, open a second meter and deposit at the deadline.
// The deposit must be rejected and the meter must stay unfunded.
// Does not deploy, and does not replace the four receipts on meter 1.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions, getTransactionLastResult } from "near-api-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const keys = JSON.parse(readFileSync(join(root, ".keys/testnet.json"), "utf8"));
const receiptPath = join(root, "app/public/v2.json");
const copyPath = join(root, "chain/v2-receipt.json");
const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
const RPC = process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com";
const TGAS = 1_000_000_000_000n;
const AMOUNT = "48000000";
const SENTENCE = String(receipt.sentence).normalize("NFC");
const EVIDENCE = createHash("sha256").update(Buffer.from(SENTENCE, "utf8")).digest("hex");

if (receipt.lateDeposit?.hash) {
  console.log(`late deposit already recorded ${receipt.lateDeposit.hash}`);
  process.exit(0);
}

const provider = new JsonRpcProvider({ url: RPC });
const buyer = new Account(receipt.buyer, provider, new KeyPairSigner(KeyPair.fromString(keys.buyer.secretKey)));
const vendor = new Account(receipt.vendor, provider, new KeyPairSigner(KeyPair.fromString(keys.vendorSecretKey)));

function call(method, args, gas, deposit = 0n) {
  return actions.functionCall(method, args, gas, deposit);
}

async function send(actor, receiverId, txActions, label) {
  const result = await actor.signAndSendTransaction({
    receiverId,
    actions: txActions,
    waitUntil: "FINAL",
    throwOnFailure: false,
  });
  const hash = result?.transaction_outcome?.id ?? null;
  const texts = [];
  if (result?.status?.Failure) texts.push(JSON.stringify(result.status.Failure));
  for (const item of result?.receipts_outcome ?? []) {
    if (item.outcome?.status?.Failure) texts.push(JSON.stringify(item.outcome.status.Failure));
  }
  const failure = texts.join(" ");
  let value = null;
  try {
    value = getTransactionLastResult(result);
  } catch {
    value = null;
  }
  console.log(`  ${label.padEnd(18)} ${hash ?? "no hash"}${failure ? ` · ${failure.slice(0, 180)}` : ""}`);
  return { hash, failure, value };
}

async function blockTime() {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "t", method: "block", params: { finality: "final" } }),
  });
  const body = await response.json();
  if (!body.result?.header?.timestamp) throw new Error("No block time");
  return BigInt(body.result.header.timestamp);
}

async function view(id) {
  return provider.callFunction({
    contractId: receipt.contract,
    method: "get",
    args: { id },
    blockQuery: { finality: "final" },
  });
}

const now = await blockTime();
const notBefore = now + 20_000_000_000n;
const deadline = now + 40_000_000_000n;
const opened = await send(buyer, receipt.contract, [
  call("open", {
    vendor: receipt.vendor,
    recipient: receipt.vendor,
    amount: AMOUNT,
    sentence: SENTENCE,
    evidence_hex: EVIDENCE,
    not_before_ns: notBefore.toString(),
    deadline_ns: deadline.toString(),
  }, 40n * TGAS),
], "open late");
if (opened.failure) throw new Error(opened.failure);
const id = Number(opened.value);
if (!Number.isInteger(id)) throw new Error(`open returned ${opened.value}`);
const meter = await view(id);

for (const [actor, label] of [[buyer, "sign buyer"], [vendor, "sign vendor"]]) {
  const signed = await send(actor, receipt.contract, [
    call("sign", { id, line_hash: meter.line_hash }, 20n * TGAS),
  ], label);
  if (signed.failure) throw new Error(signed.failure);
}

const minted = await send(buyer, receipt.token, [
  call("mint", { account_id: receipt.buyer, amount: AMOUNT }, 20n * TGAS),
], "mint");
if (minted.failure) throw new Error(minted.failure);

while (await blockTime() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

const deposited = await send(buyer, receipt.token, [
  call("ft_transfer_call", {
    receiver_id: receipt.contract,
    amount: AMOUNT,
    memo: "late",
    msg: String(id),
  }, 150n * TGAS, 1n),
], "late deposit");
if (!deposited.failure || !deposited.failure.includes("ERR_TOO_LATE")) {
  throw new Error(`Late deposit was not ERR_TOO_LATE: ${deposited.failure}`);
}
const after = await view(id);
if (String(after.funded) !== "0") throw new Error(`Late deposit funded ${after.funded}`);

receipt.lateDeposit = { meterId: id, hash: deposited.hash, code: "ERR_TOO_LATE", funded: "0", signer: receipt.buyer };
const text = JSON.stringify(receipt, null, 2) + "\n";
writeFileSync(receiptPath, text);
writeFileSync(copyPath, text);
console.log(`  receipt           ${deposited.hash}`);
