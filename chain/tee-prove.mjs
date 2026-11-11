// Deploy a new testnet contract and release one meter with the signed line.
// The recorded account m028a47 is not used. The Intel quote is not checked.
// Keys stay in .keys/. The receipt is chain/tee-receipt.json.

import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Account, JsonRpcProvider, KeyPair, KeyPairEd25519, KeyPairSigner, actions, getTransactionLastResult } from "near-api-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const RPC = process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com";
const TGAS = 1_000_000_000_000n;
const STORAGE_BYTE = 10_000_000_000_000_000_000n;
const AMOUNT = "48000000";
const EVIDENCE_TEXT = "Field report 04, price column at most 100";
const EVIDENCE = createHash("sha256").update(EVIDENCE_TEXT).digest("hex");
const provider = new JsonRpcProvider({ url: RPC });

function build() {
  const env = {
    ...process.env,
    CARGO_TARGET_DIR: join(root, "contract-tee/target"),
    RUSTFLAGS: `${process.env.RUSTFLAGS ?? ""} --cfg near`.trim(),
  };
  const run = spawnSync("cargo", ["build", "--manifest-path", join(root, "contract-tee/Cargo.toml"), "--target", "wasm32-unknown-unknown", "--release"], { stdio: "inherit", env });
  if (run.status !== 0) process.exit(run.status ?? 1);
}

function loadKeys() {
  return JSON.parse(readFileSync(join(root, ".keys/testnet.json"), "utf8"));
}

function loadRelease() {
  const saved = JSON.parse(readFileSync(join(root, "chain/tee-release.json"), "utf8"));
  const keys = loadKeys();
  const vendorId = `vendor.${keys.buyer.accountId}`;
  const line = `meter:1 recipient:${vendorId} amount:${AMOUNT} evidence:${EVIDENCE}`;
  if (saved.line !== line) throw new Error("Saved release line does not match meter 1");
  if (saved.model !== "z-ai/glm-5.3-flash") throw new Error(`Unexpected model ${saved.model}`);
  if (!saved.request.includes(line) || !saved.response.includes(line)) throw new Error("Saved bodies do not contain the line");
  return { saved, keys, vendorId, line };
}

function signer(secret) {
  return new KeyPairSigner(KeyPair.fromString(secret));
}

function account(id, secret) {
  return new Account(id, provider, signer(secret));
}

async function balance(id) {
  const view = await provider.query({ request_type: "view_account", account_id: id, finality: "final" });
  return BigInt(view.amount);
}

async function exists(id) {
  try {
    await provider.query({ request_type: "view_account", account_id: id, finality: "final" });
    return true;
  } catch {
    return false;
  }
}

async function waitForAccount(id) {
  for (let i = 0; i < 30; i++) {
    if (await exists(id)) return;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`${id} was requested and did not appear on testnet`);
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
  const gift = 6n * 10n ** 24n;
  const sent = await send(account(id, key.toString()), buyerId, [actions.transfer(gift)], "sponsor");
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
  const value = failure ? null : returned(result);
  console.log(`  ${label.padEnd(18)} ${hash ?? "no hash"}${failure ? ` · ${failure.split("\n")[0].slice(0, 180)}` : value != null ? ` · ${JSON.stringify(value).slice(0, 80)}` : ""}`);
  return { hash, failure, value };
}

function call(method, args, gas, deposit = 0n) {
  return actions.functionCall(method, args, gas, deposit);
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

async function viewMeter(contractId, id) {
  return provider.callFunction({ contractId, method: "get", args: { id }, blockQuery: { finality: "final" } });
}

async function tokenBalance(tokenId, accountId) {
  const value = await provider.callFunction({
    contractId: tokenId, method: "ft_balance_of", args: { account_id: accountId }, blockQuery: { finality: "final" },
  });
  return String(value).replaceAll('"', "");
}

async function main() {
  const { saved, keys, vendorId } = loadRelease();
  const buyerId = keys.buyer.accountId;
  const tokenId = `token.${buyerId}`;
  const buyer = account(buyerId, keys.buyer.secretKey);
  const vendor = account(vendorId, keys.vendorSecretKey);
  build();
  const code = readFileSync(join(root, "contract-tee/target/wasm32-unknown-unknown/release/meter_tee.wasm"));
  const endow = BigInt(code.length) * STORAGE_BYTE + 500_000_000_000_000_000_000_000n;
  await sponsor(buyerId, endow + 200_000_000_000_000_000_000_000n);
  const have = await balance(buyerId);
  if (have < endow + 200_000_000_000_000_000_000_000n) {
    throw new Error(`Buyer has ${have} yoctoNEAR and this deploy needs ${endow} plus gas`);
  }
  if (BigInt(await tokenBalance(tokenId, buyerId)) < BigInt(AMOUNT)) {
    throw new Error("Buyer does not have 48.00 test token");
  }

  const meterId = `m${randomBytes(3).toString("hex")}.${buyerId}`;
  console.log(`  contract          ${meterId}`);
  const deployed = await send(buyer, meterId, [
    actions.createAccount(),
    actions.transfer(endow),
    actions.deployContract(new Uint8Array(code)),
    call("new", { token: tokenId, model: saved.model, tee_signer_hex: saved.signer }, 40n * TGAS),
  ], "deploy");
  if (deployed.failure) throw new Error(deployed.failure);

  const keysOnAccount = await provider.query({ request_type: "view_access_key_list", account_id: meterId, finality: "final" });
  if ((keysOnAccount.keys ?? []).length !== 0) throw new Error("New contract has an access key");

  const registered = await send(buyer, tokenId, [
    call("register", { account_id: meterId }, 20n * TGAS),
  ], "register");
  if (registered.failure) throw new Error(registered.failure);

  const deadline = (await blockTime()) + 3_600_000_000_000n;
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
  if (Number(opened.value) !== 1) throw new Error(`Opened meter ${opened.value}, signature is for meter 1`);

  for (const [actor, label] of [[buyer, "sign buyer"], [vendor, "sign vendor"]]) {
    const signed = await send(actor, meterId, [call("sign", { id: 1 }, 20n * TGAS)], label);
    if (signed.failure) throw new Error(signed.failure);
  }
  const locked = await send(buyer, tokenId, [
    call("ft_transfer_call", { receiver_id: meterId, amount: AMOUNT, memo: "lock", msg: "1" }, 150n * TGAS, 1n),
  ], "lock");
  if (locked.failure) throw new Error(locked.failure);

  const agentKey = KeyPairEd25519.fromRandom();
  const agentPublic = agentKey.getPublicKey().toString();
  const installed = await send(buyer, meterId, [
    call("install_agent", { id: 1, public_key: agentPublic }, 40n * TGAS, 1n),
  ], "install agent");
  if (installed.failure) throw new Error(installed.failure);

  const agent = account(meterId, agentKey.toString());
  const refused = await send(agent, meterId, [
    call("release", {
      id: 1,
      recipient: vendorId,
      amount: AMOUNT,
      evidence_hex: EVIDENCE,
      request_body: "{\"ok\":true}",
      response_body: "{\"ok\":true}",
      signature_hex: "00",
    }, 80n * TGAS),
  ], "unsigned line");
  if (refused.failure) throw new Error(refused.failure);
  const refusedView = await viewMeter(meterId, 1);
  const refusedCode = refusedView.attempts.at(-1)?.code;
  if (refusedCode !== "ERR_ATTEST_LINE" || String(refusedView.paid) !== "0") {
    throw new Error(`Unsigned line stored ${refusedCode} paid ${refusedView.paid}`);
  }

  const beforeVendor = await tokenBalance(tokenId, vendorId);
  const paid = await send(agent, meterId, [
    call("release", {
      id: 1,
      recipient: vendorId,
      amount: AMOUNT,
      evidence_hex: EVIDENCE,
      request_body: saved.request,
      response_body: saved.response,
      signature_hex: saved.signature,
    }, 200n * TGAS),
  ], "pay");
  if (paid.failure) throw new Error(paid.failure);
  const paidView = await viewMeter(meterId, 1);
  if (String(paidView.paid) !== AMOUNT) throw new Error(`Paid ${paidView.paid}`);
  const afterVendor = await tokenBalance(tokenId, vendorId);
  if (BigInt(afterVendor) - BigInt(beforeVendor) !== BigInt(AMOUNT)) {
    throw new Error(`Vendor balance moved ${afterVendor} from ${beforeVendor}`);
  }

  const revoked = await send(buyer, meterId, [
    call("revoke_agent", { id: 1 }, 30n * TGAS, 1n),
  ], "revoke");
  if (revoked.failure) throw new Error(revoked.failure);

  const receipt = {
    network: "testnet",
    contract: meterId,
    recordedContract: "m028a47.mtrfc658fd1.testnet",
    token: tokenId,
    buyer: buyerId,
    vendor: vendorId,
    model: saved.model,
    signer: saved.signer,
    quote: "not checked",
    meterId: 1,
    amount: AMOUNT,
    evidence: EVIDENCE_TEXT,
    completionId: saved.completionId,
    steps: [
      { label: "Body without the line refused", code: "ERR_ATTEST_LINE", hash: refused.hash, moved: "0" },
      { label: `Paid ${vendorId}`, code: "OK", hash: paid.hash, moved: AMOUNT },
      { label: "Buyer deleted the agent key", code: "OK", hash: revoked.hash, moved: "0" },
    ],
    at: new Date().toISOString(),
  };
  writeFileSync(join(root, "chain/tee-receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
  console.log(`  receipt           chain/tee-receipt.json`);
  console.log(`  paid              https://testnet.nearblocks.io/txns/${paid.hash}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
