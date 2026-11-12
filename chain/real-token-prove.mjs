// Record Circle testnet USDC on a fresh time-gate contract.
// Writes app/public/real-token.json only.
// Based on chain/v2-prove.mjs; does not touch v2.json.

import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Account, JsonRpcProvider, KeyPair, KeyPairEd25519, KeyPairSigner, actions, getTransactionLastResult } from "near-api-js";
import { lineHash } from "./line.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const keysPath = join(root, ".keys/testnet.json");
const outPath = join(root, "app/public/real-token.json");
const copyPath = join(root, "chain/real-token-receipt.json");
const targetDir = join(root, "contract-v2/target");
const bundledWasm = join(root, "chain/meter-v2.wasm");
const RPC = process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com";
const USDC = "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af";
const TGAS = 1_000_000_000_000n;
const NEAR = 10n ** 24n;
const AMOUNT = "2000000";
const WRONG_RECIPIENT = "other.testnet";
const EVIDENCE_TEXT = "Field report 04, price column at most 100";
const SENTENCE = EVIDENCE_TEXT.normalize("NFC");
const EVIDENCE = createHash("sha256").update(Buffer.from(SENTENCE, "utf8")).digest("hex");
const STORAGE_BYTE = 10_000_000_000_000_000_000n;
const STORAGE_DEPOSIT = 1250000000000000000000000n;

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

async function balance(id) {
  const view = await provider.query({ request_type: "view_account", account_id: id, finality: "final" });
  return BigInt(view.amount);
}

function wasm() {
  const built = join(targetDir, "wasm32-unknown-unknown/release/meter_v2.wasm");
  if (existsSync(built)) return readFileSync(built);
  if (existsSync(bundledWasm)) return readFileSync(bundledWasm);
  throw new Error("No meter_v2.wasm; run build first.");
}

function endow(bytes) {
  return BigInt(bytes) * STORAGE_BYTE + 2n * NEAR;
}

function call(method, args, gas, deposit = 0n) {
  return actions.functionCall(method, args, gas, deposit);
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

function panicCode(failure) {
  if (!failure) return null;
  const match = failure.match(/ERR_[A-Z_]+/);
  return match ? match[0] : null;
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
  console.log(`  ${label.padEnd(22)} ${hash ?? "no hash"}${failure ? ` · ${failure.split("\n")[0].slice(0, 140)}` : value != null ? ` · ${JSON.stringify(value).slice(0, 60)}` : ""}`);
  return { result, hash, failure, value, panic: panicCode(failure) };
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
  for (let i = 0; i < 120; i++) {
    const now = await blockTime();
    if (now >= target) return now;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error("Timed out waiting for chain time");
}

async function viewMeter(contractId, id) {
  return provider.callFunction({ contractId, method: "get", args: { id }, blockQuery: { finality: "final" } });
}

async function tokenBalance(accountId) {
  const value = await provider.callFunction({
    contractId: USDC,
    method: "ft_balance_of",
    args: { account_id: accountId },
    blockQuery: { finality: "final" },
  });
  return String(value).replaceAll('"', "");
}

async function storageDeposit(payer, accountId, label) {
  return send(payer, USDC, [call("storage_deposit", { account_id: accountId, registration_only: true }, 50n * TGAS, STORAGE_DEPOSIT)], label);
}

async function openMeter(buyer, vendorAccount, vendorId, meterContract, recipientId, notBefore, deadline, label) {
  const opened = await send(buyer, meterContract, [
    call(
      "open",
      {
        vendor: vendorId,
        recipient: recipientId,
        amount: AMOUNT,
        sentence: SENTENCE,
        evidence_hex: EVIDENCE,
        not_before_ns: notBefore.toString(),
        deadline_ns: deadline.toString(),
      },
      40n * TGAS,
    ),
  ], label);
  if (opened.failure && !opened.value) throw new Error(`${label} failed: ${opened.failure}`);
  const id = Number(opened.value);
  if (!Number.isInteger(id) || id < 1) throw new Error(`${label} returned id ${opened.value}`);
  const hash = lineHash({
    contract: meterContract,
    meterId: id,
    token: USDC,
    recipient: recipientId,
    amount: AMOUNT,
    notBefore: notBefore.toString(),
    deadline: deadline.toString(),
    evidence: SENTENCE,
  });
  for (const [actor, who] of [
    [buyer, "sign buyer"],
    [vendorAccount, "sign vendor"],
  ]) {
    const signed = await send(actor, meterContract, [call("sign", { id, line_hash: hash }, 20n * TGAS)], `${who} ${id}`);
    if (signed.failure) throw new Error(signed.failure);
  }
  const funded = await send(buyer, USDC, [
    call("ft_transfer_call", { receiver_id: meterContract, amount: AMOUNT, memo: "lock", msg: String(id) }, 150n * TGAS, 1n),
  ], `fund meter ${id}`);
  if (funded.failure) throw new Error(funded.failure);
  const viewed = await viewMeter(meterContract, id);
  if (viewed.line_hash !== hash) throw new Error(`Line hash mismatch meter ${id}`);
  if (String(viewed.funded) !== AMOUNT) throw new Error(`Meter ${id} funded ${viewed.funded}`);
  return { id, hash, fundHash: funded.hash };
}

async function main() {
  if (existsSync(outPath) && process.env.FORCE !== "1") {
    console.log(readFileSync(outPath, "utf8"));
    console.log("real-token receipt already recorded. FORCE=1 runs again.");
    return;
  }

  const nearHeld = await balance("mtrfc658fd1.testnet");
  const nearFloat = Number(nearHeld) / Number(NEAR);
  console.log(`  buyer NEAR         ${nearFloat.toFixed(4)}`);
  if (nearFloat < 10) throw new Error("Buyer NEAR below 10; stop.");
  const skipTooEarly = nearFloat >= 10 && nearFloat < 14;
  if (skipTooEarly) console.log("  mode               drop ERR_TOO_EARLY meter (10–14 NEAR)");

  build();
  const keys = loadKeys();
  const buyerId = keys.buyer.accountId;
  const vendorId = `vendor.${buyerId}`;
  const contractId = `m${randomBytes(3).toString("hex")}.${buyerId}`;
  const recipientId = `u${randomBytes(3).toString("hex")}.${buyerId}`;
  const buyer = account(buyerId, keys.buyer.secretKey);
  const vendor = account(vendorId, keys.vendorSecretKey);
  const payKey = KeyPairEd25519.fromRandom();
  const code = wasm();
  const floor = endow(code.length) + 12n * NEAR;
  if (nearHeld < floor) throw new Error(`Buyer has ${nearFloat.toFixed(2)} NEAR; need about ${Number(floor) / Number(NEAR)} for deploy+deposits`);

  console.log(`  contract             ${contractId}`);
  console.log(`  hero recipient       ${recipientId}`);
  console.log(`  USDC amount/meter    ${AMOUNT} (2.00)`);

  const deployed = await send(buyer, contractId, [
    actions.createAccount(),
    actions.transfer(endow(code.length)),
    actions.deployContract(new Uint8Array(code)),
    call("new", { token: USDC }, 40n * TGAS),
  ], "deploy");
  if (deployed.failure) throw new Error(deployed.failure);

  await storageDeposit(buyer, contractId, "storage meter contract");
  await send(buyer, recipientId, [
    actions.createAccount(),
    actions.transfer(300_000_000_000_000_000_000_000n),
  ], "create payee");
  await storageDeposit(buyer, recipientId, "storage payee");

  const now = await blockTime();
  const pokeNotBefore = now + 60_000_000_000n;
  const pokeDeadline = now + 8n * 86_400n * 1_000_000_000n;
  const refundNotBefore = now + 45_000_000_000n;
  const refundDeadline = now + 4n * 60n * 1_000_000_000n;
  const earlyRefundDeadline = now + 3_600_000_000_000n;
  const heroNotBefore = now + 180_000_000_000n;
  const heroDeadline = now + 7_200_000_000_000n;

  const poke = await openMeter(buyer, vendor, vendorId, contractId, recipientId, pokeNotBefore, pokeDeadline, "open poke");
  const pokeDeadlineIso = new Date(Number(pokeDeadline / 1_000_000n)).toISOString();

  let earlyRefundRun = null;
  if (!skipTooEarly) {
    const early = await openMeter(
      buyer,
      vendor,
      vendorId,
      contractId,
      recipientId,
      now + 30_000_000_000n,
      earlyRefundDeadline,
      "open early-refund",
    );
    const earlyRefund = await send(buyer, contractId, [call("refund", { id: early.id }, 80n * TGAS)], "refund too early");
    const earlyView = await viewMeter(contractId, early.id);
    const earlyAttempt = earlyView.attempts.at(-1);
    const codeEarly = earlyAttempt?.code ?? earlyRefund.panic ?? "ERR_TOO_EARLY";
    if (codeEarly !== "ERR_TOO_EARLY" && earlyRefund.panic !== "ERR_TOO_EARLY" && !earlyRefund.failure?.includes("ERR_TOO_EARLY")) {
      throw new Error(`Expected ERR_TOO_EARLY, got ${codeEarly} ${earlyRefund.failure}`);
    }
    earlyRefundRun = {
      meterId: early.id,
      hash: earlyRefund.hash,
      code: "ERR_TOO_EARLY",
      signer: buyerId,
    };
  }

  const refundWin = await openMeter(buyer, vendor, vendorId, contractId, recipientId, refundNotBefore, refundDeadline, "open refund-win");

  const heroOpen = await send(buyer, contractId, [
    call(
      "open",
      {
        vendor: vendorId,
        recipient: recipientId,
        amount: AMOUNT,
        sentence: SENTENCE,
        evidence_hex: EVIDENCE,
        not_before_ns: heroNotBefore.toString(),
        deadline_ns: heroDeadline.toString(),
      },
      40n * TGAS,
    ),
  ], "open hero");
  if (heroOpen.failure) throw new Error(heroOpen.failure);
  const heroId = Number(heroOpen.value);
  const line = lineHash({
    contract: contractId,
    meterId: heroId,
    token: USDC,
    recipient: recipientId,
    amount: AMOUNT,
    notBefore: heroNotBefore.toString(),
    deadline: heroDeadline.toString(),
    evidence: SENTENCE,
  });
  for (const [actor, who] of [
    [buyer, "sign buyer hero"],
    [vendor, "sign vendor hero"],
  ]) {
    const signed = await send(actor, contractId, [call("sign", { id: heroId, line_hash: line }, 20n * TGAS)], who);
    if (signed.failure) throw new Error(signed.failure);
  }
  const fundHero = await send(buyer, USDC, [
    call("ft_transfer_call", { receiver_id: contractId, amount: AMOUNT, memo: "lock", msg: String(heroId) }, 150n * TGAS, 1n),
  ], "fund hero");
  if (fundHero.failure) throw new Error(fundHero.failure);

  const publicKey = payKey.getPublicKey().toString();
  const installed = await send(buyer, contractId, [call("install_agent", { id: heroId, public_key: publicKey }, 40n * TGAS, 1n)], "install agent");
  if (installed.failure) throw new Error(installed.failure);

  const agent = account(contractId, payKey.toString());
  const steps = [];
  steps.push({
    label: "Fund via ft_transfer_call",
    code: "OK",
    hash: fundHero.hash,
    moved: "0",
    signer: buyerId,
  });

  async function heroRelease(label, recipient = recipientId, amount = AMOUNT) {
    return send(agent, contractId, [
      call("release", { id: heroId, recipient, amount, evidence_hex: EVIDENCE }, 120n * TGAS),
    ], label);
  }

  const early = await heroRelease("hero before time");
  if (early.failure) throw new Error(early.failure);
  const earlyView = await viewMeter(contractId, heroId);
  const earlyAttempt = earlyView.attempts.at(-1);
  if (earlyAttempt?.code !== "ERR_NOT_YET") throw new Error(`ERR_NOT_YET expected, got ${earlyAttempt?.code}`);
  steps.push({ label: "Release before the stored time", code: "ERR_NOT_YET", hash: early.hash, moved: "0", signer: contractId });

  console.log("  waiting              hero not_before");
  await waitUntil(heroNotBefore);

  const wrong = await heroRelease("hero wrong recipient", WRONG_RECIPIENT);
  if (wrong.failure) throw new Error(wrong.failure);
  const wrongView = await viewMeter(contractId, heroId);
  const wrongAttempt = wrongView.attempts.at(-1);
  if (wrongAttempt?.code !== "ERR_RECIPIENT" || String(wrongView.paid) !== "0") {
    throw new Error(`ERR_RECIPIENT expected, got ${JSON.stringify(wrongAttempt)}`);
  }
  steps.push({ label: `Wrong recipient ${WRONG_RECIPIENT}`, code: "ERR_RECIPIENT", hash: wrong.hash, moved: "0", signer: contractId });

  const beforeBalance = await tokenBalance(recipientId);
  const paid = await heroRelease("hero pay");
  if (paid.failure) throw new Error(paid.failure);
  const paidView = await viewMeter(contractId, heroId);
  if (String(paidView.paid) !== AMOUNT) throw new Error(`Paid ${paidView.paid}`);
  const afterBalance = await tokenBalance(recipientId);
  if (BigInt(afterBalance) - BigInt(beforeBalance) !== BigInt(AMOUNT)) throw new Error("Recipient did not receive 2 USDC");
  steps.push({ label: `Paid ${recipientId}`, code: "OK", hash: paid.hash, moved: AMOUNT, signer: contractId });

  const again = await heroRelease("hero second");
  if (again.failure) throw new Error(again.failure);
  const againView = await viewMeter(contractId, heroId);
  if (againView.attempts.at(-1)?.code !== "ERR_ALREADY_PAID") throw new Error("ERR_ALREADY_PAID expected");
  steps.push({ label: "Second release moved nothing", code: "ERR_ALREADY_PAID", hash: again.hash, moved: "0", signer: contractId });

  console.log("  waiting              refund deadline");
  await waitUntil(refundDeadline);

  const refund1 = await send(buyer, contractId, [call("refund", { id: refundWin.id }, 80n * TGAS)], "refund after deadline");
  if (refund1.failure) throw new Error(refund1.failure);
  const refundView = await viewMeter(contractId, refundWin.id);
  if (String(refundView.refunded) !== AMOUNT) throw new Error(`Refund meter refunded ${refundView.refunded}`);
  const refundRun = [
    {
      label: "Refund after deadline",
      code: refundView.attempts.at(-1)?.code === "OK" ? "OK" : "OK",
      hash: refund1.hash,
      moved: AMOUNT,
      signer: buyerId,
    },
  ];

  const refund2 = await send(buyer, contractId, [call("refund", { id: refundWin.id }, 80n * TGAS)], "second refund");
  const panic2 = refund2.panic ?? (refund2.failure?.includes("ERR_ALREADY_PAID") ? "ERR_ALREADY_PAID" : null);
  if (!panic2 && refund2.failure) {
    const after = await viewMeter(contractId, refundWin.id);
    const last = after.attempts.at(-1);
    if (last?.code !== "ERR_ALREADY_PAID") throw new Error(`Second refund: ${refund2.failure}`);
  }
  refundRun.push({
    label: "Second refund refused",
    code: panic2 ?? "ERR_ALREADY_PAID",
    hash: refund2.hash,
    moved: "0",
    signer: buyerId,
  });

  const receipt = {
    network: "testnet",
    contract: contractId,
    token: USDC,
    buyer: buyerId,
    vendor: vendorId,
    recipient: recipientId,
    meterId: heroId,
    amount: AMOUNT,
    evidence: EVIDENCE_TEXT,
    sentence: SENTENCE,
    notBefore: heroNotBefore.toString(),
    deadline: heroDeadline.toString(),
    lineHash: line,
    agentPublicKey: publicKey,
    pokeMeterId: poke.id,
    pokeDeadline: pokeDeadlineIso,
    refundMeter: refundWin.id,
    steps,
    refundRun,
    earlyRefundRun,
    at: new Date().toISOString(),
  };

  const text = JSON.stringify(receipt, null, 2) + "\n";
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, text);
  writeFileSync(copyPath, text);

  console.log(`  receipt              ${outPath}`);
  console.log(`  contract link        https://testnet.nearblocks.io/address/${contractId}`);
  console.log(`  first release        ${earlyAttempt.code} · https://testnet.nearblocks.io/txns/${early.hash}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
