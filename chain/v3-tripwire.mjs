// Tripwire meter on an existing v3 contract: fifth refusal (BURNED), reinstall, second pay.
// Does not run unless RUN=1. Does not deploy. Reads app/public/v3.json for the contract id.
// Not part of the baseline v3 prove run.

import { createHash, readFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Account, JsonRpcProvider, KeyPair, KeyPairEd25519, KeyPairSigner, actions, getTransactionLastResult } from "near-api-js";
import { lineHash } from "./line.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const v3Path = join(root, "app/public/v3.json");
const outPath = join(root, "chain/v3-tripwire-receipt.json");
const keysPath = join(root, ".keys/testnet.json");
const RPC = process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com";
const USDC = "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af";
const TGAS = 1_000_000_000_000n;
const NEAR = 10n ** 24n;
const AMOUNT = "2000000";
const SENTENCE = "Field report 04, price column at most 100".normalize("NFC");
const EVIDENCE = createHash("sha256").update(Buffer.from(SENTENCE, "utf8")).digest("hex");

const provider = new JsonRpcProvider({ url: RPC });

function printPlan(v3) {
  console.log("v3-tripwire does not spend unless RUN=1.");
  console.log(`Contract: ${v3.contract} from app/public/v3.json`);
  console.log("Steps: open tripwire meter · sign · fund 2.00 · install agent (cap 2.00)");
  console.log("Five release calls before not_before → ERR_NOT_YET, fifth emits key BURNED and clears agent");
  console.log("Reinstall agent on the same meter · wait not_before · pay 2.00");
  console.log("USDC: +2.00 fund (refundable after deadline) +2.00 net pay; NEAR: gas only, maybe +0.5 allowance if key re-added");
}

function call(method, args, gas, deposit = 0n) {
  return actions.functionCall(method, args, gas, deposit);
}

function loadKeys() {
  if (!existsSync(keysPath)) throw new Error("Missing .keys/testnet.json.");
  return JSON.parse(readFileSync(keysPath, "utf8"));
}

function account(id, secret) {
  return new Account(id, provider, new KeyPairSigner(KeyPair.fromString(secret)));
}

function eventsOf(result) {
  const found = [];
  for (const receipt of result?.receipts_outcome ?? []) {
    for (const log of receipt.outcome?.logs ?? []) {
      if (typeof log !== "string" || !log.startsWith("EVENT_JSON:")) continue;
      const parsed = JSON.parse(log.slice("EVENT_JSON:".length));
      if (parsed?.standard === "meter" && parsed?.version === "1.0.0") found.push(parsed);
    }
  }
  return found;
}

async function send(actor, receiverId, txActions, label) {
  const result = await actor.signAndSendTransaction({
    receiverId,
    actions: txActions,
    waitUntil: "FINAL",
    throwOnFailure: false,
  });
  const hash = result?.transaction_outcome?.id ?? null;
  let value = null;
  try {
    value = getTransactionLastResult(result);
  } catch {
    value = null;
  }
  console.log(`  ${label.padEnd(22)} ${hash ?? "no hash"}`);
  return { hash, events: eventsOf(result), value };
}

async function blockTime() {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "t", method: "block", params: { finality: "final" } }),
  });
  const body = await response.json();
  return BigInt(body.result.header.timestamp);
}

async function waitUntil(target) {
  for (let i = 0; i < 120; i++) {
    const now = await blockTime();
    if (now >= target) return now;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error("Timed out waiting for chain time");
}

async function main() {
  if (!existsSync(v3Path)) throw new Error("Run chain/v3-prove.mjs first.");
  const v3 = JSON.parse(readFileSync(v3Path, "utf8"));
  if (process.env.RUN !== "1") {
    printPlan(v3);
    return;
  }
  const keys = loadKeys();
  const buyer = account(v3.buyer, keys.buyer.secretKey);
  const vendor = account(v3.vendor, keys.vendorSecretKey);
  const payKey = KeyPairEd25519.fromRandom();
  const publicKey = payKey.getPublicKey().toString();
  const agent = account(v3.contract, payKey.toString());
  const contractId = v3.contract;
  const recipientId = v3.recipient;

  const open = await blockTime();
  const notBefore = open + 120_000_000_000n;
  const deadline = open + 7_200_000_000_000n;
  const opened = await send(buyer, contractId, [
    call("open", {
      vendor: v3.vendor,
      recipient: recipientId,
      amount: AMOUNT,
      sentence: SENTENCE,
      evidence_hex: EVIDENCE,
      not_before_ns: notBefore.toString(),
      deadline_ns: deadline.toString(),
    }, 40n * TGAS),
  ], "open tripwire");
  const id = Number(opened.value);
  const hash = lineHash({
    contract: contractId,
    meterId: id,
    token: USDC,
    recipient: recipientId,
    amount: AMOUNT,
    notBefore: notBefore.toString(),
    deadline: deadline.toString(),
    evidence: SENTENCE,
    domain: "meter/v3",
  });
  for (const [actor, who] of [[buyer, "buyer"], [vendor, "vendor"]]) {
    await send(actor, contractId, [call("sign", { id, line_hash: hash }, 20n * TGAS)], `sign ${who}`);
  }
  const funded = await send(buyer, USDC, [
    call("ft_transfer_call", { receiver_id: contractId, amount: AMOUNT, memo: "lock", msg: String(id) }, 150n * TGAS, 1n),
  ], "fund tripwire");
  await send(buyer, contractId, [
    call("install_agent", { id, public_key: publicKey, cap: AMOUNT }, 40n * TGAS, 1n),
  ], "install agent");

  const steps = [{ label: "Fund tripwire", code: "OK", hash: funded.hash }];
  for (let n = 1; n <= 5; n++) {
    const rel = await send(agent, contractId, [
      call("release", { id, recipient: recipientId, amount: AMOUNT, evidence_hex: EVIDENCE }, 120n * TGAS),
    ], `refusal ${n}`);
    const code = n < 5 ? "ERR_NOT_YET" : "BURNED";
    steps.push({ label: `Release ${n} before time`, code, hash: rel.hash, events: rel.events });
    if (n === 5) {
      const burned = rel.events.find((e) => e.event === "key" && e.data?.[0]?.code === "BURNED");
      if (!burned) throw new Error(`Fifth refusal did not emit BURNED: ${JSON.stringify(rel.events)}`);
    }
  }

  await send(buyer, contractId, [
    call("install_agent", { id, public_key: publicKey, cap: AMOUNT }, 40n * TGAS, 1n),
  ], "reinstall agent");
  await waitUntil(notBefore);
  const paid = await send(agent, contractId, [
    call("release", { id, recipient: recipientId, amount: AMOUNT, evidence_hex: EVIDENCE }, 120n * TGAS),
  ], "second pay");
  const paidEv = paid.events.find((e) => e.event === "paid" && e.data?.[0]?.code === "OK");
  if (!paidEv) throw new Error(`Second pay missing paid OK: ${JSON.stringify(paid.events)}`);
  steps.push({ label: "Second pay on tripwire meter", code: "OK", hash: paid.hash });

  writeFileSync(outPath, `${JSON.stringify({ contract: contractId, meterId: id, agentPublicKey: publicKey, steps, at: new Date().toISOString() }, null, 2)}\n`);
  console.log(`  receipt              ${outPath}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
