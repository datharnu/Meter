// Record meter v3 on Circle testnet USDC. Does not run unless RUN=1.
// Writes app/public/v3.json and chain/v3-receipt.json. Does not touch real-token.json.
// Deploys the committed bytes in contract-v3/meter-v3.wasm. Line hashes pass domain meter/v3.

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Account, JsonRpcProvider, KeyPair, KeyPairEd25519, KeyPairSigner, actions, getTransactionLastResult } from "near-api-js";
import { lineHash } from "./line.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const keysPath = join(root, ".keys/testnet.json");
const outPath = join(root, "app/public/v3.json");
const copyPath = join(root, "chain/v3-receipt.json");
const wasmPath = join(root, "contract-v3/meter-v3.wasm");
const RPC = process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com";
const USDC = "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af";
const WASM_SHA = "208e223123613d75d63ecdee9d6b9fa61e22da5751b7afccec9fff17538db65e";
const TGAS = 1_000_000_000_000n;
const NEAR = 10n ** 24n;
const AMOUNT = "2000000";
const CAP = AMOUNT;
const WRONG_RECIPIENT = "other.testnet";
const SENTENCE = "Field report 04, price column at most 100".normalize("NFC");
const EVIDENCE = createHash("sha256").update(Buffer.from(SENTENCE, "utf8")).digest("hex");
const WRONG_SENTENCE = "Terms rewritten on the invoice".normalize("NFC");
const WRONG_EVIDENCE = createHash("sha256").update(Buffer.from(WRONG_SENTENCE, "utf8")).digest("hex");
const WRONG_AMOUNT = "1000000";
const STORAGE_BYTE = 10_000_000_000_000_000_000n;
const STORAGE_DEPOSIT = 1250000000000000000000000n;
const V3_VECTOR = "a66de00ba403a47599877d24b741bf5f3ca2d28c96cb7276462335c9475ca2e3";
const FORBIDDEN = new Set([
  "i198b44.mtrfc658fd1.testnet",
  "h3743c5.mtrfc658fd1.testnet",
  "h09d6ce.mtrfc658fd1.testnet",
  "medbf5c.mtrfc658fd1.testnet",
  "m1870dd.mtrfc658fd1.testnet",
  "m028a47.mtrfc658fd1.testnet",
  "m2b2440.mtrfc658fd1.testnet",
]);

const provider = new JsonRpcProvider({ url: RPC });

const PLAN = [
  "Deploy a new m{6 hex}.mtrfc658fd1.testnet from contract-v3/meter-v3.wasm and call new(Circle USDC).",
  "Register the contract and the new payee on USDC. Create the payee with 0.3 NEAR.",
  "Panic path: ft_transfer_call with msg \"nope\". Code recorded as \"no event, panic\" (ERR_BAD_MSG). 2.00 USDC returns. No EVENT_JSON.",
  "Unsigned meter: ft_transfer_call returns the full 2.00. Event refusal ERR_NEED_BOTH. Funded stays 0.",
  "Signed meter, deposit after its deadline. Event refusal ERR_TOO_LATE. 2.00 returns. Funded stays 0.",
  "Hero meter, cap equal to 2.00. Fund event OK. Release before the time: refusal ERR_NOT_YET. Wrong recipient: refusal ERR_RECIPIENT. Wrong amount: refusal ERR_AMOUNT. Wrong sentence: refusal ERR_EVIDENCE. Pay: event paid, 2.00 to the payee. Second release: refusal ERR_ALREADY_PAID.",
  "Second meter, same key, same cap. Refund before the deadline: refusal ERR_TOO_EARLY, no transfer. Release: refusal ERR_CAP. Refund after the deadline: event refund, 2.00 back to the buyer. Second refund: refusal ERR_ALREADY_PAID.",
];

const RECORDED_ON_CHAIN = [
  "no event, panic (deposit ERR_BAD_MSG)",
  "ERR_NEED_BOTH",
  "ERR_TOO_LATE",
  "fund OK",
  "key OK (install_agent)",
  "ERR_NOT_YET",
  "ERR_RECIPIENT",
  "ERR_AMOUNT",
  "ERR_EVIDENCE",
  "paid OK",
  "ERR_ALREADY_PAID (release)",
  "ERR_TOO_EARLY",
  "ERR_CAP",
  "refund OK",
  "ERR_ALREADY_PAID (refund)",
];

const UNIT_TESTS_ONLY = [
  "ERR_NOT_BUYER",
  "ERR_WRONG_TOKEN",
  "ERR_UNKNOWN",
  "ERR_CAP_MISMATCH",
  "ERR_NOT_LOCKED",
  "ERR_BUSY",
  "ERR_TRANSFER",
  "BURNED",
  "ERR_REVOKED",
  "ERR_UNAUTHORIZED",
  "ERR_AGENT",
  "ERR_NOT_PARTY",
  "ERR_ALREADY_SIGNED",
  "ERR_BAD_AMOUNT",
  "ERR_BAD_WINDOW",
  "ERR_NOTHING",
];

function printPlan() {
  console.log("v3 prove does not spend unless RUN=1.");
  console.log("USDC per deposit: 2.00 (2000000 base units). Not 48.00.");
  console.log("USDC the buyer must hold: 4.00. Net left with the payee: 2.00. The other 2.00 is refunded.");
  console.log("Domain passed to lineHash: meter/v3.");
  PLAN.forEach((step, index) => console.log(`${index + 1}. ${step}`));
  console.log("Codes recorded on chain in this run:");
  console.log(`  ${RECORDED_ON_CHAIN.join(", ")}.`);
  console.log("Codes covered only by unit tests (contract-v3 cargo test):");
  console.log(`  ${UNIT_TESTS_ONLY.join(", ")}.`);
  console.log(
    "Not added yet — third meter (fifth refusal, BURNED key event, reinstall, second pay): +2.00 USDC fund on that meter, +2.00 USDC net second payment to the payee; no second deploy; roughly 0.2–0.6 NEAR gas and maybe another 0.5 NEAR key allowance if the account key was deleted and no other meter still holds it.",
  );
}

function endow(bytes) {
  return BigInt(bytes) * STORAGE_BYTE + 2n * NEAR;
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

async function balance(id) {
  const view = await provider.query({ request_type: "view_account", account_id: id, finality: "final" });
  return BigInt(view.amount);
}

function wasm() {
  if (!existsSync(wasmPath)) throw new Error("Missing contract-v3/meter-v3.wasm.");
  const bytes = readFileSync(wasmPath);
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (sha !== WASM_SHA) throw new Error(`Wasm sha256 ${sha} does not match the tagged source.`);
  return bytes;
}

function assertLineDomain() {
  const vector = lineHash({
    contract: "m.example.testnet",
    meterId: 1,
    token: "token.example.testnet",
    recipient: "sable.testnet",
    amount: 48_000_000,
    notBefore: 100,
    deadline: 1000,
    evidence: SENTENCE,
    domain: "meter/v3",
  });
  const v2 = lineHash({
    contract: "m.example.testnet",
    meterId: 1,
    token: "token.example.testnet",
    recipient: "sable.testnet",
    amount: 48_000_000,
    notBefore: 100,
    deadline: 1000,
    evidence: SENTENCE,
  });
  if (vector !== V3_VECTOR || v2 === vector) throw new Error("line.mjs is not hashing meter/v3 beside the v2 default.");
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

function panicCode(failure) {
  if (!failure) return null;
  const match = failure.match(/ERR_[A-Z_]+/);
  return match ? match[0] : null;
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
  const hash = hashOf(result);
  const failure = failureOf(result);
  let value = null;
  try {
    value = getTransactionLastResult(result);
  } catch {
    value = null;
  }
  console.log(`  ${label.padEnd(22)} ${hash ?? "no hash"}${failure ? ` · ${failure.split("\n")[0].slice(0, 140)}` : value != null ? ` · ${JSON.stringify(value).slice(0, 80)}` : ""}`);
  return { result, hash, failure, value, panic: panicCode(failure), events: eventsOf(result) };
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
  return BigInt(String(value).replaceAll('"', ""));
}

function lineFor(contractId, id, recipientId, notBefore, deadline) {
  return lineHash({
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
}

function expectEvent(sent, name, code) {
  const hit = sent.events.find((event) => event.event === name && event.data?.[0]?.code === code);
  if (!hit) throw new Error(`Expected ${name} ${code}, got ${JSON.stringify(sent.events)} ${sent.failure ?? ""}`);
  if (hit.standard !== "meter" || hit.version !== "1.0.0") throw new Error(`Bad event header ${JSON.stringify(hit)}`);
  return hit;
}

function recorded(label, code, sent, signer, moved = "0") {
  return { label, code, hash: sent.hash, moved, signer, events: sent.events };
}

async function openMeter(buyer, meterContract, vendorId, recipientId, notBefore, deadline, label) {
  const opened = await send(buyer, meterContract, [
    call("open", {
      vendor: vendorId,
      recipient: recipientId,
      amount: AMOUNT,
      sentence: SENTENCE,
      evidence_hex: EVIDENCE,
      not_before_ns: notBefore.toString(),
      deadline_ns: deadline.toString(),
    }, 40n * TGAS),
  ], label);
  if (opened.failure) throw new Error(opened.failure);
  const id = Number(opened.value);
  if (!Number.isInteger(id) || id < 1) throw new Error(`${label} returned ${opened.value}`);
  const hash = lineFor(meterContract, id, recipientId, notBefore, deadline);
  const viewed = await viewMeter(meterContract, id);
  if (viewed.line_hash !== hash) throw new Error(`Line hash mismatch on meter ${id}`);
  return { id, hash };
}

async function signBoth(buyer, vendor, meterContract, id, hash) {
  for (const [actor, who] of [[buyer, "sign buyer"], [vendor, "sign vendor"]]) {
    const signed = await send(actor, meterContract, [call("sign", { id, line_hash: hash }, 20n * TGAS)], `${who} ${id}`);
    if (signed.failure) throw new Error(signed.failure);
  }
}

async function fund(buyer, meterContract, id, msg) {
  return send(buyer, USDC, [
    call("ft_transfer_call", { receiver_id: meterContract, amount: AMOUNT, memo: "lock", msg }, 150n * TGAS, 1n),
  ], `fund ${msg}`);
}

async function main() {
  if (process.env.RUN !== "1") {
    printPlan();
    return;
  }
  if (existsSync(outPath) && process.env.FORCE !== "1") {
    console.log(readFileSync(outPath, "utf8"));
    console.log("v3 receipt already recorded. FORCE=1 runs again.");
    return;
  }
  assertLineDomain();
  const code = wasm();
  const keys = loadKeys();
  const buyerId = keys.buyer.accountId;
  const vendorId = `vendor.${buyerId}`;
  const nearHeld = await balance(buyerId);
  const floor = endow(code.length) + 12n * NEAR;
  if (nearHeld < floor) throw new Error(`Buyer has ${Number(nearHeld) / Number(NEAR)} NEAR; need ${Number(floor) / Number(NEAR)}.`);
  const usdc = await tokenBalance(buyerId);
  if (usdc < 4_000_000n) throw new Error(`Buyer has ${usdc} USDC base units; need 4000000 (4.00).`);

  let contractId = "";
  do {
    contractId = `m${randomBytes(3).toString("hex")}.${buyerId}`;
  } while (FORBIDDEN.has(contractId));
  const recipientId = `u${randomBytes(3).toString("hex")}.${buyerId}`;
  const buyer = account(buyerId, keys.buyer.secretKey);
  const vendor = account(vendorId, keys.vendorSecretKey);
  const payKey = KeyPairEd25519.fromRandom();
  const publicKey = payKey.getPublicKey().toString();
  console.log(`  contract             ${contractId}`);
  console.log(`  payee                ${recipientId}`);
  console.log(`  wasm sha256          ${WASM_SHA}`);

  const deployed = await send(buyer, contractId, [
    actions.createAccount(),
    actions.transfer(endow(code.length)),
    actions.deployContract(new Uint8Array(code)),
    call("new", { token: USDC }, 40n * TGAS),
  ], "deploy");
  if (deployed.failure) throw new Error(deployed.failure);
  await send(buyer, USDC, [call("storage_deposit", { account_id: contractId, registration_only: true }, 50n * TGAS, STORAGE_DEPOSIT)], "storage contract");
  await send(buyer, recipientId, [actions.createAccount(), actions.transfer(300_000_000_000_000_000_000_000n)], "create payee");
  await send(buyer, USDC, [call("storage_deposit", { account_id: recipientId, registration_only: true }, 50n * TGAS, STORAGE_DEPOSIT)], "storage payee");

  const steps = [];
  const beforePanic = await tokenBalance(buyerId);
  const panic = await fund(buyer, contractId, 0, "nope");
  if (panic.panic !== "ERR_BAD_MSG") throw new Error(`Expected ERR_BAD_MSG panic, got ${panic.failure}`);
  if (panic.events.length !== 0) throw new Error(`Panic path emitted ${JSON.stringify(panic.events)}`);
  if (await tokenBalance(buyerId) !== beforePanic) throw new Error("Panic path changed the USDC balance");
  steps.push(recorded("Bad message, no event", "no event, panic", panic, buyerId));

  const now = await blockTime();
  const unsigned = await openMeter(buyer, contractId, vendorId, recipientId, now + 60_000_000_000n, now + 3_600_000_000_000n, "open unsigned");
  const needBoth = await fund(buyer, contractId, unsigned.id, String(unsigned.id));
  expectEvent(needBoth, "refusal", "ERR_NEED_BOTH");
  const unsignedView = await viewMeter(contractId, unsigned.id);
  if (String(unsignedView.funded) !== "0") throw new Error(`ERR_NEED_BOTH kept ${unsignedView.funded}`);
  if (await tokenBalance(buyerId) !== beforePanic) throw new Error("ERR_NEED_BOTH changed the USDC balance");
  steps.push(recorded("Deposit before both signatures", "ERR_NEED_BOTH", needBoth, buyerId));

  const lateOpen = await blockTime();
  const late = await openMeter(buyer, contractId, vendorId, recipientId, lateOpen + 20_000_000_000n, lateOpen + 90_000_000_000n, "open late");
  await signBoth(buyer, vendor, contractId, late.id, late.hash);
  console.log("  waiting              late deadline");
  await waitUntil(lateOpen + 90_000_000_000n);
  const tooLate = await fund(buyer, contractId, late.id, String(late.id));
  expectEvent(tooLate, "refusal", "ERR_TOO_LATE");
  if (String((await viewMeter(contractId, late.id)).funded) !== "0") throw new Error("ERR_TOO_LATE kept funds");
  if (await tokenBalance(buyerId) !== beforePanic) throw new Error("ERR_TOO_LATE changed the USDC balance");
  steps.push(recorded("Deposit at the deadline", "ERR_TOO_LATE", tooLate, buyerId));

  const heroOpen = await blockTime();
  const heroNotBefore = heroOpen + 120_000_000_000n;
  const heroDeadline = heroOpen + 7_200_000_000_000n;
  const hero = await openMeter(buyer, contractId, vendorId, recipientId, heroNotBefore, heroDeadline, "open hero");
  await signBoth(buyer, vendor, contractId, hero.id, hero.hash);
  const funded = await fund(buyer, contractId, hero.id, String(hero.id));
  expectEvent(funded, "fund", "OK");
  if (String((await viewMeter(contractId, hero.id)).funded) !== AMOUNT) throw new Error("Hero was not funded");
  steps.push(recorded("Fund the hero", "OK", funded, buyerId));

  const installed = await send(buyer, contractId, [
    call("install_agent", { id: hero.id, public_key: publicKey, cap: CAP }, 40n * TGAS, 1n),
  ], "install agent");
  if (installed.failure) throw new Error(installed.failure);
  expectEvent(installed, "key", "OK");
  steps.push(recorded("Install the key, cap 2.00", "OK", installed, buyerId));

  const agent = account(contractId, payKey.toString());
  async function release(label, id, { recipient = recipientId, amount = AMOUNT, evidenceHex = EVIDENCE } = {}) {
    return send(agent, contractId, [
      call("release", { id, recipient, amount, evidence_hex: evidenceHex }, 120n * TGAS),
    ], label);
  }

  const early = await release("hero before time", hero.id);
  expectEvent(early, "refusal", "ERR_NOT_YET");
  if (String((await viewMeter(contractId, hero.id)).paid) !== "0") throw new Error("ERR_NOT_YET paid");
  steps.push(recorded("Release before the stored time", "ERR_NOT_YET", early, contractId));

  console.log("  waiting              hero not_before");
  await waitUntil(heroNotBefore);
  const wrong = await release("hero wrong recipient", hero.id, { recipient: WRONG_RECIPIENT });
  expectEvent(wrong, "refusal", "ERR_RECIPIENT");
  steps.push(recorded(`Wrong recipient ${WRONG_RECIPIENT}`, "ERR_RECIPIENT", wrong, contractId));

  const badAmount = await release("hero wrong amount", hero.id, { amount: WRONG_AMOUNT });
  expectEvent(badAmount, "refusal", "ERR_AMOUNT");
  steps.push(recorded("Wrong amount 1.00", "ERR_AMOUNT", badAmount, contractId));

  const badEvidence = await release("hero wrong sentence", hero.id, { evidenceHex: WRONG_EVIDENCE });
  expectEvent(badEvidence, "refusal", "ERR_EVIDENCE");
  steps.push(recorded("Wrong sentence hash", "ERR_EVIDENCE", badEvidence, contractId));

  const payeeBefore = await tokenBalance(recipientId);
  const paid = await release("hero pay", hero.id);
  expectEvent(paid, "paid", "OK");
  const paidView = await viewMeter(contractId, hero.id);
  if (String(paidView.paid) !== AMOUNT) throw new Error(`Paid ${paidView.paid}`);
  if ((await tokenBalance(recipientId)) - payeeBefore !== BigInt(AMOUNT)) throw new Error("Payee did not receive 2.00 USDC");
  steps.push(recorded(`Paid ${recipientId}`, "OK", paid, contractId, AMOUNT));

  const again = await release("hero second", hero.id);
  expectEvent(again, "refusal", "ERR_ALREADY_PAID");
  if (String((await viewMeter(contractId, hero.id)).paid) !== AMOUNT) throw new Error("Second release changed paid");
  steps.push(recorded("Second release moved nothing", "ERR_ALREADY_PAID", again, contractId));

  const capNow = await blockTime();
  const capNotBefore = capNow + 40_000_000_000n;
  const capDeadline = capNow + 150_000_000_000n;
  const capped = await openMeter(buyer, contractId, vendorId, recipientId, capNotBefore, capDeadline, "open cap");
  await signBoth(buyer, vendor, contractId, capped.id, capped.hash);
  const capFund = await fund(buyer, contractId, capped.id, String(capped.id));
  expectEvent(capFund, "fund", "OK");
  const sameKey = await send(buyer, contractId, [
    call("install_agent", { id: capped.id, public_key: publicKey, cap: CAP }, 40n * TGAS, 1n),
  ], "install same key");
  if (sameKey.failure) throw new Error(sameKey.failure);
  expectEvent(sameKey, "key", "OK");
  const tooEarly = await send(buyer, contractId, [call("refund", { id: capped.id }, 80n * TGAS)], "refund too early");
  expectEvent(tooEarly, "refusal", "ERR_TOO_EARLY");
  if (String((await viewMeter(contractId, capped.id)).refunded) !== "0") throw new Error("ERR_TOO_EARLY moved funds");
  steps.push(recorded("Refund before the deadline", "ERR_TOO_EARLY", tooEarly, buyerId));

  console.log("  waiting              cap not_before");
  await waitUntil(capNotBefore);
  const overCap = await release("cap release", capped.id);
  expectEvent(overCap, "refusal", "ERR_CAP");
  if (String((await viewMeter(contractId, capped.id)).paid) !== "0") throw new Error("ERR_CAP paid");
  steps.push(recorded("Release over the key cap", "ERR_CAP", overCap, contractId));

  console.log("  waiting              cap deadline");
  await waitUntil(capDeadline);
  const refunded = await send(buyer, contractId, [call("refund", { id: capped.id }, 80n * TGAS)], "refund after deadline");
  expectEvent(refunded, "refund", "OK");
  if (String((await viewMeter(contractId, capped.id)).refunded) !== AMOUNT) throw new Error("Refund did not return the deposit");
  steps.push(recorded("Refund after the deadline", "OK", refunded, buyerId, AMOUNT));
  const refundAgain = await send(buyer, contractId, [call("refund", { id: capped.id }, 80n * TGAS)], "second refund");
  expectEvent(refundAgain, "refusal", "ERR_ALREADY_PAID");
  steps.push(recorded("Second refund moved nothing", "ERR_ALREADY_PAID", refundAgain, buyerId));

  const buyerAfter = await tokenBalance(buyerId);
  if (beforePanic - buyerAfter !== BigInt(AMOUNT)) {
    throw new Error(`Buyer USDC changed by ${beforePanic - buyerAfter}, expected the 2.00 payment only`);
  }

  const receipt = {
    network: "testnet",
    contract: contractId,
    wasmSha256: WASM_SHA,
    token: USDC,
    buyer: buyerId,
    vendor: vendorId,
    recipient: recipientId,
    meterId: hero.id,
    amount: AMOUNT,
    domain: "meter/v3",
    evidence: SENTENCE,
    sentence: SENTENCE,
    notBefore: heroNotBefore.toString(),
    deadline: heroDeadline.toString(),
    lineHash: hero.hash,
    agentPublicKey: publicKey,
    cap: CAP,
    lateMeter: late.id,
    capMeter: capped.id,
    steps,
    at: new Date().toISOString(),
  };
  const text = JSON.stringify(receipt, null, 2) + "\n";
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, text);
  writeFileSync(copyPath, text);
  console.log(`  receipt              ${outPath}`);
  console.log(`  contract link        https://testnet.nearblocks.io/address/${contractId}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
