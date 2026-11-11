// Deploy a fresh Meter and run the payment proof on testnet.
// The agent holds one key that can call release only.
// A wrong recipient, amount, and evidence are refused and recorded.
// The matching payment moves 48.00. The buyer then deletes the key.
// A second meter misses its deadline and the balance returns to the buyer.
// Keys stay in .keys/. The public receipt is app/public/chain.json.

import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Account, JsonRpcProvider, KeyPair, KeyPairEd25519, KeyPairSigner, actions, getTransactionLastResult } from "near-api-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const keysPath = join(root, ".keys/testnet.json");
const outPath = join(root, "app/public/chain.json");
const targetDir = join(root, "contract/target");
const RPC = process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com";
const TGAS = 1_000_000_000_000n;
const NEAR = 10n ** 24n;
const AMOUNT = "48000000";
const EVIDENCE_TEXT = "Field report 04, price column at most 100";
const EVIDENCE = createHash("sha256").update(EVIDENCE_TEXT).digest("hex");
const BAD_EVIDENCE = EVIDENCE.slice(0, -1) + (EVIDENCE.endsWith("a") ? "b" : "a");
const STORAGE_BYTE = 10_000_000_000_000_000_000n;

const provider = new JsonRpcProvider({ url: RPC });

function build() {
  const env = { ...process.env, CARGO_TARGET_DIR: targetDir, RUSTFLAGS: `${process.env.RUSTFLAGS ?? ""} --cfg near`.trim() };
  for (const manifest of ["contract/Cargo.toml", "contract/token/Cargo.toml"]) {
    const run = spawnSync("cargo", ["build", "--manifest-path", join(root, manifest), "--target", "wasm32-unknown-unknown", "--release"], { stdio: "inherit", env });
    if (run.status !== 0) process.exit(run.status ?? 1);
  }
}

function loadKeys() {
  if (!existsSync(keysPath)) throw new Error("Missing .keys/testnet.json. Run node chain/pay.mjs once to create the buyer.");
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

function hashOf(result) {
  return result?.transaction_outcome?.id ?? null;
}

function failureOf(result) {
  const texts = [];
  if (result?.status?.Failure) texts.push(JSON.stringify(result.status.Failure));
  for (const receipt of result?.receipts_outcome ?? []) {
    const status = receipt.outcome?.status;
    if (status?.Failure) texts.push(JSON.stringify(status.Failure));
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
  const value = failure ? null : returned(result);
  console.log(`  ${label.padEnd(18)} ${hash ?? "no hash"}${failure ? ` · ${failure.split("\n")[0].slice(0, 180)}` : value != null ? ` · ${JSON.stringify(value).slice(0, 80)}` : ""}`);
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

async function waitUntil(deadline) {
  for (let i = 0; i < 40; i++) {
    const now = await blockTime();
    if (now >= deadline) return now;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error("Deadline did not arrive on chain");
}

function wasm(name) {
  return readFileSync(join(targetDir, "wasm32-unknown-unknown/release", name));
}

function endow(bytes) {
  return BigInt(bytes) * STORAGE_BYTE + 200_000_000_000_000_000_000_000n;
}

async function viewMeter(contractId, id) {
  return provider.callFunction({ contractId, method: "get", args: { id }, blockQuery: { finality: "final" } });
}

async function tokenBalance(tokenId, accountId) {
  const value = await provider.callFunction({
    contractId: tokenId, method: "ft_balance_of", args: { account_id: accountId }, blockQuery: { finality: "final" },
  });
  return String(value).replaceAll('"', "");
}

function call(method, args, gas, deposit = 0n) {
  return actions.functionCall(method, args, gas, deposit);
}

async function openMeter(buyer, vendor, meterId, vendorId, deadline) {
  const opened = await send(buyer, meterId, [
    call("open", {
      vendor: vendorId,
      recipient: vendorId,
      amount: AMOUNT,
      evidence_hex: EVIDENCE,
      deadline_ns: deadline.toString(),
    }, 40n * TGAS),
  ], "open");
  if (opened.failure) throw new Error(opened.failure);
  const id = Number(opened.value);
  if (!Number.isInteger(id) || id < 1) throw new Error(`open did not return a meter id (${opened.value})`);
  for (const [actor, label] of [[buyer, "sign buyer"], [vendor, "sign vendor"]]) {
    const signed = await send(actor, meterId, [call("sign", { id }, 20n * TGAS)], label);
    if (signed.failure) throw new Error(signed.failure);
  }
  const funded = await send(buyer, tokenOf(meterId), [
    call("ft_transfer_call", { receiver_id: meterId, amount: AMOUNT, memo: "lock", msg: String(id) }, 150n * TGAS, 1n),
  ], "lock");
  if (funded.failure) throw new Error(funded.failure);
  return id;
}

function tokenOf() {
  return tokenAccount;
}

let tokenAccount = "";

async function install(buyer, meterId, id, secret) {
  const publicKey = KeyPair.fromString(secret).getPublicKey().toString();
  const installed = await send(buyer, meterId, [
    call("install_agent", { id, public_key: publicKey }, 40n * TGAS, 1n),
  ], "install agent");
  if (installed.failure) throw new Error(installed.failure);
  return publicKey;
}

async function agentRelease(meterId, secret, id, recipient, amount, evidence, label) {
  const agent = account(meterId, secret);
  const sent = await send(agent, meterId, [
    call("release", { id, recipient, amount, evidence_hex: evidence }, 80n * TGAS),
  ], label);
  const view = await viewMeter(meterId, id);
  return { ...sent, view };
}

async function main() {
  if (existsSync(outPath) && process.env.FORCE !== "1") {
    const current = JSON.parse(readFileSync(outPath, "utf8"));
    if (current.steps?.length) {
      console.log(readFileSync(outPath, "utf8"));
      return;
    }
  }

  build();
  const keys = loadKeys();
  const buyerId = keys.buyer.accountId;
  const vendorId = `vendor.${buyerId}`;
  tokenAccount = `token.${buyerId}`;
  const meterId = `m${randomBytes(3).toString("hex")}.${buyerId}`;
  const buyer = account(buyerId, keys.buyer.secretKey);
  const vendor = account(vendorId, keys.vendorSecretKey);
  const payKey = KeyPairEd25519.fromRandom();
  const refundKey = KeyPairEd25519.fromRandom();

  if (await balance(buyerId) < 5n * NEAR) throw new Error(`${buyerId} needs at least 5 NEAR for a fresh contract`);
  console.log(`  contract          ${meterId}`);

  const code = wasm("meter.wasm");
  const deployed = await send(buyer, meterId, [
    actions.createAccount(),
    actions.transfer(endow(code.length) + 2n * NEAR),
    actions.deployContract(new Uint8Array(code)),
    call("new", { token: tokenAccount }, 40n * TGAS),
  ], "deploy");
  if (deployed.failure) throw new Error(deployed.failure);

  const minted = await send(buyer, tokenAccount, [
    call("mint", { account_id: buyerId, amount: String(BigInt(AMOUNT) * 2n) }, 20n * TGAS),
  ], "mint");
  if (minted.failure) throw new Error(minted.failure);
  const registered = await send(buyer, tokenAccount, [
    call("register", { account_id: meterId }, 20n * TGAS),
  ], "register");
  if (registered.failure) throw new Error(registered.failure);

  const payDeadline = (await blockTime()) + 3_600_000_000_000n;
  const payId = await openMeter(buyer, vendor, meterId, vendorId, payDeadline);
  const payPublic = await install(buyer, meterId, payId, payKey.toString());

  const steps = [];
  async function refuse(label, code, recipient, amount, evidence) {
    const sent = await agentRelease(meterId, payKey.toString(), payId, recipient, amount, evidence, label);
    if (sent.failure) throw new Error(sent.failure);
    const last = sent.view.attempts.at(-1);
    if (last?.code !== code || String(sent.view.paid) !== "0") {
      throw new Error(`${label} stored ${last?.code} paid ${sent.view.paid}`);
    }
    steps.push({ label, code, hash: sent.hash, moved: "0" });
  }

  await refuse("Wrong recipient refused", "ERR_RECIPIENT", "other.testnet", AMOUNT, EVIDENCE);
  await refuse("Wrong amount refused", "ERR_AMOUNT", vendorId, "47000000", EVIDENCE);
  await refuse("Wrong evidence refused", "ERR_EVIDENCE", vendorId, AMOUNT, BAD_EVIDENCE);

  const beforeVendor = await tokenBalance(tokenAccount, vendorId);
  const paid = await agentRelease(meterId, payKey.toString(), payId, vendorId, AMOUNT, EVIDENCE, "pay");
  if (paid.failure) throw new Error(paid.failure);
  if (String(paid.view.paid) !== AMOUNT) throw new Error(`Paid ${paid.view.paid}, expected ${AMOUNT}`);
  const afterVendor = await tokenBalance(tokenAccount, vendorId);
  if (BigInt(afterVendor) - BigInt(beforeVendor) !== BigInt(AMOUNT)) {
    throw new Error(`Vendor balance moved ${afterVendor} from ${beforeVendor}`);
  }
  steps.push({ label: `Paid ${vendorId}`, code: "OK", hash: paid.hash, moved: AMOUNT });

  const revoked = await send(buyer, meterId, [
    call("revoke_agent", { id: payId }, 30n * TGAS, 1n),
  ], "revoke");
  if (revoked.failure) throw new Error(revoked.failure);
  steps.push({ label: "Buyer deleted the agent key", code: "OK", hash: revoked.hash, moved: "0" });

  let rejected;
  try {
    rejected = await agentRelease(meterId, payKey.toString(), payId, vendorId, AMOUNT, EVIDENCE, "after revoke");
  } catch (error) {
    rejected = { hash: null, failure: error.message ?? String(error), view: null };
    console.log(`  ${"after revoke".padEnd(18)} rejected · ${rejected.failure.split("\n")[0].slice(0, 180)}`);
  }
  const rejectedText = rejected.failure ?? JSON.stringify(rejected.value ?? "");
  if (!/AccessKey|does not exist|LackBalanceForState|nonce|Cannot find/i.test(rejectedText) && String(rejected.view?.paid) === AMOUNT && rejected.failure == null && rejected.hash) {
    throw new Error(`The deleted key still called release: ${rejected.hash}`);
  }
  steps.push({
    label: "Deleted key was rejected",
    code: "AccessKeyDoesNotExist",
    hash: rejected.hash,
    moved: "0",
    detail: rejectedText.split("\n")[0].slice(0, 240),
  });

  const refundDeadline = (await blockTime()) + 90_000_000_000n;
  const refundId = await openMeter(buyer, vendor, meterId, vendorId, refundDeadline);
  await install(buyer, meterId, refundId, refundKey.toString());
  console.log("  waiting           deadline");
  await waitUntil(refundDeadline);
  const late = await agentRelease(meterId, refundKey.toString(), refundId, vendorId, AMOUNT, EVIDENCE, "too late");
  if (late.failure) throw new Error(late.failure);
  if (late.view.attempts.at(-1)?.code !== "ERR_TOO_LATE" || String(late.view.paid) !== "0") {
    throw new Error(`Late release stored ${late.view.attempts.at(-1)?.code}`);
  }
  steps.push({ label: "Payment after the deadline refused", code: "ERR_TOO_LATE", hash: late.hash, moved: "0" });

  const beforeBuyer = await tokenBalance(tokenAccount, buyerId);
  const refunded = await send(buyer, meterId, [call("refund", { id: refundId }, 80n * TGAS)], "refund");
  if (refunded.failure) throw new Error(refunded.failure);
  const refundView = await viewMeter(meterId, refundId);
  if (String(refundView.refunded) !== AMOUNT || String(refundView.paid) !== "0") {
    throw new Error(`Refund stored paid ${refundView.paid} refunded ${refundView.refunded}`);
  }
  const afterBuyer = await tokenBalance(tokenAccount, buyerId);
  if (BigInt(afterBuyer) - BigInt(beforeBuyer) !== BigInt(AMOUNT)) {
    throw new Error(`Buyer token balance moved ${afterBuyer} from ${beforeBuyer}`);
  }
  steps.push({ label: "Balance returned to the buyer", code: "OK", hash: refunded.hash, moved: AMOUNT });

  const keyList = await provider.query({ request_type: "view_access_key_list", account_id: meterId, finality: "final" });
  const stillThere = (keyList.keys ?? []).some((key) => key.public_key === payPublic);
  if (stillThere) throw new Error("Revoked agent key is still on the account");

  const receipt = {
    network: "testnet",
    contract: meterId,
    token: tokenAccount,
    buyer: buyerId,
    vendor: vendorId,
    meterId: payId,
    refundMeter: refundId,
    amount: AMOUNT,
    evidence: EVIDENCE_TEXT,
    agentPublicKey: payPublic,
    steps,
    vendorBalance: afterVendor,
    at: new Date().toISOString(),
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(receipt, null, 2) + "\n");
  console.log(`  receipt           ${outPath}`);
  console.log(`  paid              https://testnet.nearblocks.io/txns/${paid.hash}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
