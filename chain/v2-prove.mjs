// Deploy Meter v2 and record four receipts.
// Release before the stored time moves 0.
// A transfer to an unregistered recipient leaves the meter unpaid.
// After that account is registered, the same line pays once.
// A second release moves 0.
// Does not write app/public/chain.json or app/public/tee.json.

import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Account, JsonRpcProvider, KeyPair, KeyPairEd25519, KeyPairSigner, actions, getTransactionLastResult } from "near-api-js";
import { lineHash } from "./line.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const keysPath = join(root, ".keys/testnet.json");
const outPath = join(root, "app/public/v2.json");
const copyPath = join(root, "chain/v2-receipt.json");
const targetDir = join(root, "contract-v2/target");
const RPC = process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com";
const TGAS = 1_000_000_000_000n;
const NEAR = 10n ** 24n;
const AMOUNT = "48000000";
const EVIDENCE_TEXT = "Field report 04, price column at most 100";
const EVIDENCE = createHash("sha256").update(EVIDENCE_TEXT).digest("hex");
const STORAGE_BYTE = 10_000_000_000_000_000_000n;

const provider = new JsonRpcProvider({ url: RPC });

function build() {
  const env = { ...process.env, CARGO_TARGET_DIR: targetDir, RUSTFLAGS: `${process.env.RUSTFLAGS ?? ""} --cfg near`.trim() };
  const run = spawnSync(
    "cargo",
    ["build", "--manifest-path", join(root, "contract-v2/Cargo.toml"), "--target", "wasm32-unknown-unknown", "--release"],
    { stdio: "inherit", env },
  );
  if (run.status !== 0) process.exit(run.status ?? 1);
}

function loadKeys() {
  if (!existsSync(keysPath)) throw new Error("Missing .keys/testnet.json.");
  return JSON.parse(readFileSync(keysPath, "utf8"));
}

function signer(secret) {
  return new KeyPairSigner(KeyPair.fromString(secret));
}

function account(id, secret) {
  return new Account(id, provider, signer(secret));
}

async function exists(id) {
  try {
    await provider.query({ request_type: "view_account", account_id: id, finality: "final" });
    return true;
  } catch {
    return false;
  }
}

async function balance(id) {
  const view = await provider.query({ request_type: "view_account", account_id: id, finality: "final" });
  return BigInt(view.amount);
}

async function waitForAccount(id) {
  for (let i = 0; i < 30; i++) {
    if (await exists(id)) return;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`${id} did not appear on testnet`);
}

async function sponsor(buyerId, floor) {
  if (await balance(buyerId) >= floor) return;
  const key = KeyPairEd25519.fromRandom();
  const id = `spr${randomBytes(4).toString("hex")}.testnet`;
  const response = await fetch("https://helper.testnet.near.org/account", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ newAccountId: id, newAccountPublicKey: key.getPublicKey().toString() }),
  });
  const text = await response.text();
  console.log(`  sponsor helper    ${response.status} ${text.slice(0, 180)}`);
  if (!response.ok) throw new Error(`Could not fund ${buyerId}: ${response.status} ${text.slice(0, 180)}`);
  await waitForAccount(id);
  const sent = await send(account(id, key.toString()), buyerId, [actions.transfer(6n * NEAR)], "sponsor");
  if (sent.failure) throw new Error(sent.failure);
}

function hashOf(result) {
  return result?.transaction_outcome?.id ?? null;
}

function failureOf(result) {
  const texts = [];
  if (result?.status?.Failure) texts.push(JSON.stringify(result.status.Failure));
  for (const receipt of result?.receipts_outcome ?? []) {
    if (receipt.outcome?.status?.Failure) texts.push(JSON.stringify(receipt.outcome.status.Failure));
  }
  return texts.length ? texts.join(" ") : null;
}

function returned(result) {
  try {
    return getTransactionLastResult(result);
  } catch {
    return null;
  }
}

async function send(actor, receiverId, txActions, label) {
  const result = await actor.signAndSendTransaction({
    receiverId,
    actions: txActions,
    waitUntil: "FINAL",
    throwOnFailure: false,
  });
  const hash = hashOf(result);
  const failure = failureOf(result);
  const value = returned(result);
  console.log(`  ${label.padEnd(18)} ${hash ?? "no hash"}${failure ? ` · ${failure.split("\n")[0].slice(0, 160)}` : value != null ? ` · ${JSON.stringify(value).slice(0, 80)}` : ""}`);
  return { result, hash, failure, value };
}

async function blockTime() {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "t", method: "block", params: { finality: "final" } }),
  });
  const body = await response.json();
  if (!body.result?.header?.timestamp) throw new Error(`No block time: ${JSON.stringify(body.error ?? body).slice(0, 200)}`);
  return BigInt(body.result.header.timestamp);
}

async function waitUntil(target) {
  for (let i = 0; i < 80; i++) {
    const now = await blockTime();
    if (now >= target) return now;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error("The stored time did not arrive");
}

function wasm() {
  return readFileSync(join(targetDir, "wasm32-unknown-unknown/release/meter_v2.wasm"));
}

function endow(bytes) {
  return BigInt(bytes) * STORAGE_BYTE + 2n * NEAR;
}

async function viewMeter(contractId, id) {
  return provider.callFunction({ contractId, method: "get", args: { id }, blockQuery: { finality: "final" } });
}

async function tokenBalance(tokenId, accountId) {
  const value = await provider.callFunction({
    contractId: tokenId,
    method: "ft_balance_of",
    args: { account_id: accountId },
    blockQuery: { finality: "final" },
  });
  return String(value).replaceAll('"', "");
}

function call(method, args, gas, deposit = 0n) {
  return actions.functionCall(method, args, gas, deposit);
}

async function main() {
  if (existsSync(outPath) && process.env.FORCE !== "1") {
    console.log(readFileSync(outPath, "utf8"));
    console.log("v2 receipt already recorded. FORCE=1 deploys another.");
    return;
  }

  build();
  const keys = loadKeys();
  const buyerId = keys.buyer.accountId;
  const vendorId = `vendor.${buyerId}`;
  const tokenAccount = `token.${buyerId}`;
  const meterId = `m${randomBytes(3).toString("hex")}.${buyerId}`;
  const recipientId = `u${randomBytes(3).toString("hex")}.${buyerId}`;
  const buyer = account(buyerId, keys.buyer.secretKey);
  const vendor = account(vendorId, keys.vendorSecretKey);
  const payKey = KeyPairEd25519.fromRandom();
  const code = wasm();

  await sponsor(buyerId, endow(code.length) + 3n * NEAR);
  console.log(`  contract          ${meterId}`);
  console.log(`  recipient         ${recipientId}`);

  const deployed = await send(buyer, meterId, [
    actions.createAccount(),
    actions.transfer(endow(code.length)),
    actions.deployContract(new Uint8Array(code)),
    call("new", { token: tokenAccount }, 40n * TGAS),
  ], "deploy");
  if (deployed.failure) throw new Error(deployed.failure);

  const created = await send(buyer, recipientId, [
    actions.createAccount(),
    actions.transfer(300_000_000_000_000_000_000_000n),
  ], "create payee");
  if (created.failure) throw new Error(created.failure);

  const minted = await send(buyer, tokenAccount, [
    call("mint", { account_id: buyerId, amount: AMOUNT }, 20n * TGAS),
  ], "mint");
  if (minted.failure) throw new Error(minted.failure);
  const registered = await send(buyer, tokenAccount, [
    call("register", { account_id: meterId }, 20n * TGAS),
  ], "register meter");
  if (registered.failure) throw new Error(registered.failure);

  const now = await blockTime();
  const notBefore = now + 180_000_000_000n;
  const deadline = now + 7_200_000_000_000n;
  const opened = await send(buyer, meterId, [
    call("open", {
      vendor: vendorId,
      recipient: recipientId,
      amount: AMOUNT,
      evidence_hex: EVIDENCE,
      not_before_ns: notBefore.toString(),
      deadline_ns: deadline.toString(),
    }, 40n * TGAS),
  ], "open");
  if (opened.failure) throw new Error(opened.failure);
  const id = Number(opened.value);
  if (!Number.isInteger(id) || id < 1) throw new Error(`open did not return a meter id (${opened.value})`);

  const hash = lineHash({
    contract: meterId,
    meterId: id,
    token: tokenAccount,
    recipient: recipientId,
    amount: AMOUNT,
    notBefore: notBefore.toString(),
    deadline: deadline.toString(),
    evidence: EVIDENCE,
  });
  const viewed = await viewMeter(meterId, id);
  if (viewed.line_hash !== hash) throw new Error(`Line hash ${viewed.line_hash}, local ${hash}`);

  for (const [actor, label] of [[buyer, "sign buyer"], [vendor, "sign vendor"]]) {
    const signed = await send(actor, meterId, [call("sign", { id, line_hash: hash }, 20n * TGAS)], label);
    if (signed.failure) throw new Error(signed.failure);
  }
  const funded = await send(buyer, tokenAccount, [
    call("ft_transfer_call", { receiver_id: meterId, amount: AMOUNT, memo: "lock", msg: String(id) }, 150n * TGAS, 1n),
  ], "lock");
  if (funded.failure) throw new Error(funded.failure);

  const publicKey = payKey.getPublicKey().toString();
  const installed = await send(buyer, meterId, [
    call("install_agent", { id, public_key: publicKey }, 40n * TGAS, 1n),
  ], "install agent");
  if (installed.failure) throw new Error(installed.failure);

  const agent = account(meterId, payKey.toString());
  const steps = [];

  async function release(label) {
    return send(agent, meterId, [
      call("release", { id, recipient: recipientId, amount: AMOUNT, evidence_hex: EVIDENCE }, 120n * TGAS),
    ], label);
  }

  const early = await release("before time");
  if (early.failure) throw new Error(early.failure);
  const earlyView = await viewMeter(meterId, id);
  const earlyAttempt = earlyView.attempts.at(-1);
  if (earlyAttempt?.code !== "ERR_NOT_YET" || String(earlyView.paid) !== "0" || earlyView.releasing !== false) {
    throw new Error(`Early release stored ${JSON.stringify(earlyAttempt)} paid ${earlyView.paid} releasing ${earlyView.releasing}`);
  }
  steps.push({ label: "Release before the stored time", code: "ERR_NOT_YET", hash: early.hash, moved: "0" });

  console.log("  waiting           stored time");
  await waitUntil(notBefore);

  const beforeBalance = await tokenBalance(tokenAccount, recipientId);
  const unregistered = await release("unregistered");
  const unpaid = await viewMeter(meterId, id);
  const unpaidAttempt = unpaid.attempts.at(-1);
  if (unpaidAttempt?.code !== "ERR_TRANSFER" || String(unpaid.paid) !== "0" || unpaid.releasing !== false) {
    throw new Error(`Unregistered release stored ${JSON.stringify(unpaidAttempt)} paid ${unpaid.paid} releasing ${unpaid.releasing} failure ${unregistered.failure}`);
  }
  if (await tokenBalance(tokenAccount, recipientId) !== beforeBalance) {
    throw new Error("Unregistered release moved tokens");
  }
  steps.push({ label: "Unregistered recipient stayed unpaid", code: "ERR_TRANSFER", hash: unregistered.hash, moved: "0" });

  const listed = await send(buyer, tokenAccount, [
    call("register", { account_id: recipientId }, 20n * TGAS),
  ], "register payee");
  if (listed.failure) throw new Error(listed.failure);

  const paid = await release("pay");
  if (paid.failure) throw new Error(paid.failure);
  const paidView = await viewMeter(meterId, id);
  if (String(paidView.paid) !== AMOUNT || paidView.releasing !== false) {
    throw new Error(`Paid ${paidView.paid} releasing ${paidView.releasing}`);
  }
  const afterBalance = await tokenBalance(tokenAccount, recipientId);
  if (BigInt(afterBalance) - BigInt(beforeBalance) !== BigInt(AMOUNT)) {
    throw new Error(`Recipient balance ${afterBalance} from ${beforeBalance}`);
  }
  steps.push({ label: `Paid ${recipientId}`, code: "OK", hash: paid.hash, moved: AMOUNT });

  const again = await release("second");
  if (again.failure) throw new Error(again.failure);
  const againView = await viewMeter(meterId, id);
  const againAttempt = againView.attempts.at(-1);
  if (againAttempt?.code !== "ERR_ALREADY_PAID" || String(againView.paid) !== AMOUNT) {
    throw new Error(`Second release stored ${JSON.stringify(againAttempt)} paid ${againView.paid}`);
  }
  if (await tokenBalance(tokenAccount, recipientId) !== afterBalance) throw new Error("Second release moved tokens");
  steps.push({ label: "Second release moved nothing", code: "ERR_ALREADY_PAID", hash: again.hash, moved: "0" });

  const revoked = await send(buyer, meterId, [
    call("revoke_agent", { id }, 30n * TGAS, 1n),
  ], "revoke");
  if (revoked.failure) throw new Error(revoked.failure);
  const keyList = await provider.query({ request_type: "view_access_key_list", account_id: meterId, finality: "final" });
  if ((keyList.keys ?? []).length !== 0) throw new Error("The contract still has an access key");
  steps.push({ label: "Buyer deleted the agent key", code: "OK", hash: revoked.hash, moved: "0" });

  const receipt = {
    network: "testnet",
    contract: meterId,
    token: tokenAccount,
    buyer: buyerId,
    vendor: vendorId,
    recipient: recipientId,
    meterId: id,
    amount: AMOUNT,
    evidence: EVIDENCE_TEXT,
    notBefore: notBefore.toString(),
    deadline: deadline.toString(),
    lineHash: hash,
    agentPublicKey: publicKey,
    steps,
    at: new Date().toISOString(),
  };
  const text = JSON.stringify(receipt, null, 2) + "\n";
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, text);
  writeFileSync(copyPath, text);
  console.log(`  receipt           ${outPath}`);
  console.log(`  before time       https://testnet.nearblocks.io/txns/${early.hash}`);
  console.log(`  unregistered      https://testnet.nearblocks.io/txns/${unregistered.hash}`);
  console.log(`  paid              https://testnet.nearblocks.io/txns/${paid.hash}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
