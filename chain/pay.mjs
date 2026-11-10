// Deploy Meter on NEAR testnet and pay one locked slip.
// A swapped recipient reverts. The matching payment returns a transaction hash.
// Keys stay in .keys/. The public receipt is app/public/chain.json.
// Re-running prints that receipt. FORCE=1 pays again.

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
const AMOUNT = "48000000";
const EVIDENCE_TEXT = "Field report 04, price column at most 100";
const EVIDENCE = createHash("sha256").update(EVIDENCE_TEXT).digest("hex");
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
  if (existsSync(keysPath)) return JSON.parse(readFileSync(keysPath, "utf8"));
  const buyerKey = KeyPairEd25519.fromRandom();
  const vendorKey = KeyPairEd25519.fromRandom();
  const suffix = randomBytes(4).toString("hex");
  const keys = {
    buyer: { accountId: `mtr${suffix}.testnet`, secretKey: buyerKey.toString() },
    vendorSecretKey: vendorKey.toString(),
  };
  mkdirSync(dirname(keysPath), { recursive: true });
  writeFileSync(keysPath, JSON.stringify(keys, null, 2));
  return keys;
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

async function codeHash(id) {
  const view = await provider.query({ request_type: "view_account", account_id: id, finality: "final" });
  return view.code_hash;
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

async function send(actor, receiverId, txActions, label) {
  const result = await actor.signAndSendTransaction({
    receiverId,
    actions: txActions,
    waitUntil: "FINAL",
    throwOnFailure: false,
  });
  const hash = hashOf(result);
  const failure = failureOf(result);
  console.log(`  ${label.padEnd(18)} ${hash ?? "no hash"}${failure ? ` · ${failure.split("\n")[0]}` : ""}`);
  return { result, hash, failure };
}

async function waitForAccount(id) {
  for (let i = 0; i < 30; i++) {
    if (await exists(id)) return;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`${id} was requested and did not appear on testnet`);
}

async function createBuyer(keys) {
  if (await exists(keys.buyer.accountId)) return;
  const publicKey = KeyPair.fromString(keys.buyer.secretKey).getPublicKey().toString();
  const response = await fetch("https://helper.testnet.near.org/account", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ newAccountId: keys.buyer.accountId, newAccountPublicKey: publicKey }),
  });
  const text = await response.text();
  console.log(`  helper            ${response.status} ${text.slice(0, 400)}`);
  if (!response.ok && !/already exists/i.test(text)) {
    throw new Error(`Could not create ${keys.buyer.accountId}: ${response.status} ${text.slice(0, 240)}`);
  }
  await waitForAccount(keys.buyer.accountId);
}

async function balance(id) {
  const view = await provider.query({ request_type: "view_account", account_id: id, finality: "final" });
  return BigInt(view.amount);
}

async function sponsor(buyerId) {
  const floor = 6n * 10n ** 24n;
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
  const gift = 6n * 10n ** 24n;
  const sent = await send(account(id, key.toString()), buyerId, [actions.transfer(gift)], "sponsor");
  if (sent.failure) throw new Error(sent.failure);
}

function wasm(name) {
  return readFileSync(join(targetDir, "wasm32-unknown-unknown/release", name));
}

function endow(bytes) {
  return BigInt(bytes) * STORAGE_BYTE + 50_000_000_000_000_000_000_000n;
}

async function deployBare(buyer, accountId, file, initArgs) {
  if (await exists(accountId)) {
    const hash = await codeHash(accountId);
    if (hash !== "11111111111111111111111111111111") {
      console.log(`  deployed          ${accountId}`);
      return;
    }
  }
  const code = wasm(file);
  const created = await send(buyer, accountId, [
    actions.createAccount(),
    actions.transfer(endow(code.length)),
    actions.deployContract(new Uint8Array(code)),
    actions.functionCall("new", initArgs, 40n * TGAS, 0n),
  ], "deploy");
  if (created.failure) throw new Error(`Deploy of ${accountId} failed: ${created.failure}`);
}

async function main() {
  if (existsSync(outPath) && process.env.FORCE !== "1") {
    console.log(readFileSync(outPath, "utf8"));
    return;
  }
  build();
  const keys = loadKeys();
  const buyerId = keys.buyer.accountId;
  const vendorId = `vendor.${buyerId}`;
  const tokenId = `token.${buyerId}`;
  const meterId = `meter3.${buyerId}`;
  const buyer = account(buyerId, keys.buyer.secretKey);
  const vendor = account(vendorId, keys.vendorSecretKey);

  await createBuyer(keys);
  await sponsor(buyerId);
  console.log(`  buyer             ${buyerId}`);

  if (!(await exists(vendorId))) {
    const created = await send(buyer, vendorId, [
      actions.createAccount(),
      actions.transfer(500_000_000_000_000_000_000_000n),
      actions.addFullAccessKey(KeyPair.fromString(keys.vendorSecretKey).getPublicKey()),
    ], "vendor");
    if (created.failure) throw new Error(created.failure);
  }

  await deployBare(buyer, tokenId, "meter_token.wasm", {});
  await deployBare(buyer, meterId, "meter.wasm", { token: tokenId });

  const minted = await send(buyer, tokenId, [
    actions.functionCall("mint", { account_id: buyerId, amount: AMOUNT }, 20n * TGAS, 0n),
  ], "mint");
  if (minted.failure) throw new Error(minted.failure);

  for (const accountId of [meterId, vendorId]) {
    const registered = await send(buyer, tokenId, [
      actions.functionCall("register", { account_id: accountId }, 20n * TGAS, 0n),
    ], "register");
    if (registered.failure) throw new Error(registered.failure);
  }

  const deadline = (BigInt(Date.now()) * 1_000_000n + 3_600_000_000_000n).toString();
  const opened = await send(buyer, meterId, [
    actions.functionCall("open", {
      vendor: vendorId,
      recipient: vendorId,
      amount: AMOUNT,
      evidence_hex: EVIDENCE,
      deadline_ns: deadline,
    }, 30n * TGAS, 0n),
  ], "open");
  if (opened.failure) throw new Error(opened.failure);
  const id = Number(getTransactionLastResult(opened.result));
  if (!Number.isInteger(id) || id < 1) throw new Error(`open did not return a meter id (${id})`);

  for (const [actor, label] of [[buyer, "sign buyer"], [vendor, "sign vendor"]]) {
    const signed = await send(actor, meterId, [
      actions.functionCall("sign", { id }, 20n * TGAS, 0n),
    ], label);
    if (signed.failure) throw new Error(signed.failure);
  }

  const funded = await send(buyer, tokenId, [
    actions.functionCall("ft_transfer_call", {
      receiver_id: meterId,
      amount: AMOUNT,
      memo: "lock",
      msg: String(id),
    }, 150n * TGAS, 1n),
  ], "lock");
  if (funded.failure) throw new Error(funded.failure);

  const refused = await send(buyer, meterId, [
    actions.functionCall("release", {
      id,
      recipient: "other.testnet",
      amount: AMOUNT,
      evidence_hex: EVIDENCE,
    }, 80n * TGAS, 0n),
  ], "refuse");
  if (!refused.hash || !refused.failure?.includes("ERR_RECIPIENT")) {
    throw new Error(`Expected ERR_RECIPIENT with a hash, got ${refused.failure ?? "success"} ${refused.hash ?? ""}`);
  }

  const paid = await send(buyer, meterId, [
    actions.functionCall("release", {
      id,
      recipient: vendorId,
      amount: AMOUNT,
      evidence_hex: EVIDENCE,
    }, 80n * TGAS, 0n),
  ], "pay");
  if (paid.failure || !paid.hash) throw new Error(paid.failure || "payment returned no hash");

  const view = await provider.callFunction({ contractId: meterId, method: "get", args: { id }, blockQuery: { finality: "final" } });
  const vendorBalance = await provider.callFunction({
    contractId: tokenId, method: "ft_balance_of", args: { account_id: vendorId }, blockQuery: { finality: "final" },
  });
  if (view?.paid !== AMOUNT && view?.paid?.toString() !== AMOUNT) {
    throw new Error(`Meter ${id} paid ${JSON.stringify(view?.paid)}, expected ${AMOUNT}`);
  }

  const receipt = {
    network: "testnet",
    contract: meterId,
    token: tokenId,
    buyer: buyerId,
    vendor: vendorId,
    meterId: id,
    amount: AMOUNT,
    evidence: EVIDENCE_TEXT,
    refused: { hash: refused.hash, code: "ERR_RECIPIENT" },
    paid: { hash: paid.hash, code: "OK" },
    vendorBalance: String(vendorBalance),
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
