// Tripwire meter on an existing v3 contract: fifth refusal, BURNED key event, reinstall, second pay.
// Does not run unless RUN=1. Does not deploy. Reads app/public/v3.json for the contract id.
// Writes app/public/v3-tripwire.json. Does not edit v3.json.

import { createHash } from "node:crypto";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Account, JsonRpcProvider, KeyPair, KeyPairEd25519, KeyPairSigner, actions, getTransactionLastResult } from "near-api-js";
import { lineHash } from "./line.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const v3Path = join(root, "app/public/v3.json");
const outPath = join(root, "app/public/v3-tripwire.json");
const keysPath = join(root, ".keys/testnet.json");
const RPC = process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com";
const USDC = "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af";
const TGAS = 1_000_000_000_000n;
const NEAR = 10n ** 24n;
const AMOUNT = "2000000";
const SENTENCE = "Field report 04, price column at most 100".normalize("NFC");
const EVIDENCE = createHash("sha256").update(Buffer.from(SENTENCE, "utf8")).digest("hex");
const WINDOW_NS = 12n * 60n * 1_000_000_000n;
const NEED_NS = 6n * 60n * 1_000_000_000n;
const STORAGE_BYTE = 10n ** 19n;

const provider = new JsonRpcProvider({ url: RPC });

function printPlan(v3) {
  console.log("v3-tripwire does not spend unless RUN=1.");
  console.log(`Contract: ${v3.contract} from app/public/v3.json`);
  console.log("Steps: open tripwire meter · sign · fund 2.00 · install agent (cap 2.00)");
  console.log("Before the five releases: read the access-key list and every meter's agent. Stop if another meter holds this key.");
  console.log("Window is 12 minutes, so five refusals finish before not_before.");
  console.log("Five releases before not_before. The refusal code is ERR_NOT_YET. The fifth also emits key event BURNED and deletes the key.");
  console.log("Record the access-key list before and after that call. The next call with the deleted key is AccessKeyDoesNotExist.");
  console.log("Then reinstall, wait for not_before, and pay 2.00.");
  console.log("USDC: +2.00 fund (refundable after deadline) +2.00 net pay; NEAR: gas only, maybe +0.5 allowance if the key is added again");
  console.log(`Receipt: ${outPath}`);
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

function failureOf(result) {
  const texts = [];
  if (result?.status?.Failure) texts.push(JSON.stringify(result.status.Failure));
  for (const receipt of result?.receipts_outcome ?? []) {
    if (receipt.outcome?.status?.Failure) texts.push(JSON.stringify(receipt.outcome.status.Failure));
  }
  return texts.length ? texts.join(" ") : null;
}

function eventCode(events, name) {
  const hit = (events ?? []).find((row) => row.event === name);
  return hit?.data?.[0]?.code ?? null;
}

function permissionOf(key) {
  const permission = key.access_key?.permission;
  if (permission === "FullAccess" || permission?.FullAccess !== undefined) return "full-access";
  if (permission?.FunctionCall) return "function-call";
  return "other";
}

async function send(actor, receiverId, txActions, label) {
  try {
    const result = await actor.signAndSendTransaction({
      receiverId,
      actions: txActions,
      waitUntil: "FINAL",
      throwOnFailure: false,
    });
    const hash = result?.transaction_outcome?.id || null;
    const failure = failureOf(result);
    let value = null;
    try {
      value = getTransactionLastResult(result);
    } catch {
      value = null;
    }
    console.log(`  ${label.padEnd(22)} ${hash ?? "no hash"}${failure ? ` · ${failure.slice(0, 160)}` : ""}`);
    return { hash, failure, value, events: eventsOf(result), threw: false };
  } catch (error) {
    const failure = error?.message ?? String(error);
    const hash = error?.txHash || error?.transaction_outcome?.id || null;
    console.log(`  ${label.padEnd(22)} ${hash ?? "no hash"} · ${failure.slice(0, 180)}`);
    return { hash, failure, value: null, events: [], threw: true };
  }
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
  for (let i = 0; i < 500; i++) {
    const now = await blockTime();
    if (now >= target) return now;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error("Timed out waiting for chain time");
}

async function viewMeter(contractId, id) {
  try {
    const row = await provider.callFunction({ contractId, method: "get", args: { id }, blockQuery: { finality: "final" } });
    return row ?? null;
  } catch (error) {
    const text = error?.message ?? String(error);
    if (/null|None|empty|Option/i.test(text)) return null;
    throw error;
  }
}

function agentOf(row) {
  if (!row || row.agent == null) return null;
  return typeof row.agent === "string" ? row.agent : String(row.agent);
}

async function meterAgents(contractId) {
  const rows = [];
  for (let id = 1; id <= 32; id++) {
    const row = await viewMeter(contractId, id);
    if (!row) break;
    rows.push({
      id,
      agent: agentOf(row),
      revoked: Boolean(row.revoked),
      refusals: row.refusals ?? 0,
      paid: String(row.paid ?? "0"),
    });
  }
  return rows;
}

async function keyList(contractId) {
  const listed = await provider.query({ request_type: "view_access_key_list", account_id: contractId, finality: "final" });
  return (listed.keys ?? []).map((key) => ({ publicKey: key.public_key, permission: permissionOf(key) }));
}

async function liquid(id) {
  const view = await provider.query({ request_type: "view_account", account_id: id, finality: "final" });
  const amount = BigInt(view.amount);
  const storage = BigInt(view.storage_usage) * STORAGE_BYTE;
  return amount > storage ? amount - storage : 0n;
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

function permissionCode(failure) {
  const text = failure ?? "";
  if (/AccessKeyDoesNotExist|AccessKeyNotFound|UNKNOWN_ACCESS_KEY|does not exist/i.test(text)) return "AccessKeyDoesNotExist";
  return null;
}

async function main() {
  if (!existsSync(v3Path)) throw new Error("Run chain/v3-prove.mjs first.");
  const v3 = JSON.parse(readFileSync(v3Path, "utf8"));
  if (outPath.endsWith("/v3.json")) throw new Error("Refusing to write v3.json.");
  if (process.env.RUN !== "1") {
    printPlan(v3);
    return;
  }
  const resume = process.env.RESUME === "1" && existsSync(outPath);
  if (existsSync(outPath) && !resume && process.env.FORCE !== "1") {
    console.log("v3-tripwire.json already recorded. FORCE=1 runs again. RESUME=1 continues an unfunded meter whose result fetch failed.");
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
  let body = resume ? JSON.parse(readFileSync(outPath, "utf8")) : null;
  if (!resume) body = {
    network: "testnet",
    contract: contractId,
    token: USDC,
    buyer: v3.buyer,
    vendor: v3.vendor,
    recipient: recipientId,
    amount: AMOUNT,
    domain: "meter/v3",
    sentence: SENTENCE,
    meterId: null,
    notBefore: null,
    deadline: null,
    lineHash: null,
    agentPublicKey: publicKey,
    cap: AMOUNT,
    metersBeforeReleases: null,
    keysBeforeFifth: null,
    keysAfterFifth: null,
    steps: [],
    ok: false,
    stopped: null,
    at: new Date().toISOString(),
  };
  if (resume) {
    const live = await viewMeter(contractId, body.meterId);
    if (!live?.buyer_signed || !live?.vendor_signed || String(live.funded) !== "0" || live.agent) {
      throw new Error(`Meter ${body.meterId} is not an unfunded signed meter. Not resuming.`);
    }
    const vendorStep = body.steps.find((step) => step.label === "Sign vendor");
    if (vendorStep && !vendorStep.hash) {
      vendorStep.note = "The result fetch failed. Storage shows vendor_signed, so the signature landed. The vendor_signed transaction hash was not captured.";
    }
    body.unusedPublicKey = body.agentPublicKey;
    body.agentPublicKey = publicKey;
    body.stopped = null;
  }
  const persist = () => writeFileSync(outPath, `${JSON.stringify(body, null, 2)}\n`);
  const halt = (reason) => {
    body.stopped = reason;
    body.ok = false;
    persist();
    console.error(reason);
    process.exitCode = 1;
  };
  const push = (step) => {
    body.steps.push(step);
    persist();
    return step;
  };

  const usdc = await tokenBalance(v3.buyer);
  if (usdc < 2_000_000n) {
    halt(`Buyer has ${usdc} USDC base units. This run needs 2000000 (2.00). Nothing was sent.`);
    return;
  }
  const free = await liquid(contractId);
  if (free < (NEAR * 6n) / 10n) {
    halt(`Contract has ${free} yoctoNEAR liquid. Installing the key needs about 0.50 NEAR of allowance. Nothing was sent.`);
    return;
  }

  let notBefore;
  let id;
  let hash;
  if (resume) {
    id = body.meterId;
    notBefore = BigInt(body.notBefore);
    hash = body.lineHash;
    persist();
    console.log(`  resume                meter ${id}, ${Number(notBefore - await blockTime()) / 1e9}s before not_before`);
  } else {
  const open = await blockTime();
  notBefore = open + WINDOW_NS;
  const deadline = notBefore + 7_200_000_000_000n;
  body.notBefore = notBefore.toString();
  body.deadline = deadline.toString();
  persist();

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
  id = Number(opened.value);
  push({
    label: "Open tripwire",
    code: Number.isInteger(id) && id > 0 ? "included" : (opened.failure ?? "none"),
    hash: opened.hash,
    moved: "0",
    signer: v3.buyer,
    events: opened.events,
    ...(opened.failure ? { failure: opened.failure } : {}),
  });
  if (!Number.isInteger(id) || id < 1) {
    halt(`Open did not return a meter id. Got ${opened.value ?? opened.failure ?? "nothing"}.`);
    return;
  }
  body.meterId = id;
  hash = lineHash({
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
  body.lineHash = hash;
  persist();

  for (const [actor, who, signer] of [[buyer, "buyer", v3.buyer], [vendor, "vendor", v3.vendor]]) {
    const signed = await send(actor, contractId, [call("sign", { id, line_hash: hash }, 20n * TGAS)], `sign ${who}`);
    const bad = signed.failure || signed.threw;
    push({
      label: `Sign ${who}`,
      code: bad ? (signed.failure ?? "failed") : "included",
      hash: signed.hash,
      moved: "0",
      signer,
      events: signed.events,
      ...(signed.failure ? { failure: signed.failure } : {}),
    });
    if (bad) {
      halt(`Sign ${who} failed: ${signed.failure ?? "no result"}`);
      return;
    }
  }
  }

  const funded = await send(buyer, USDC, [
    call("ft_transfer_call", { receiver_id: contractId, amount: AMOUNT, memo: "lock", msg: String(id) }, 150n * TGAS, 1n),
  ], "fund tripwire");
  const fundCode = eventCode(funded.events, "fund");
  push({
    label: "Fund tripwire",
    code: fundCode ?? (funded.failure ?? "none"),
    hash: funded.hash,
    moved: "0",
    signer: v3.buyer,
    events: funded.events,
    ...(funded.failure ? { failure: funded.failure } : {}),
  });
  if (fundCode !== "OK") {
    halt(`Fund returned ${fundCode ?? funded.failure ?? "no fund event"}, expected OK.`);
    return;
  }

  const installed = await send(buyer, contractId, [
    call("install_agent", { id, public_key: publicKey, cap: AMOUNT }, 40n * TGAS, 1n),
  ], "install agent");
  const installCode = eventCode(installed.events, "key");
  push({
    label: "Install agent",
    code: installCode ?? (installed.failure ?? "none"),
    hash: installed.hash,
    moved: "0",
    signer: v3.buyer,
    events: installed.events,
    ...(installed.failure ? { failure: installed.failure } : {}),
  });
  if (installCode !== "OK") {
    halt(`Install returned ${installCode ?? installed.failure ?? "no key event"}, expected OK.`);
    return;
  }

  const meters = await meterAgents(contractId);
  body.metersBeforeReleases = meters;
  const holders = meters.filter((row) => row.agent === publicKey && row.id !== id);
  persist();
  if (holders.length) {
    halt(`Another meter still holds ${publicKey}: ${holders.map((row) => row.id).join(", ")}. Stopped before the five releases.`);
    return;
  }
  const own = meters.find((row) => row.id === id);
  if (own?.agent !== publicKey) {
    halt(`Tripwire meter ${id} does not hold ${publicKey}. Agent is ${own?.agent ?? "empty"}. Stopped before the five releases.`);
    return;
  }
  console.log(`  key check             meter ${id} holds the new key. No other meter does.`);

  const now = await blockTime();
  const need = resume ? 3n * 60n * 1_000_000_000n : NEED_NS;
  if (notBefore - now < need) {
    halt(`Window leaves ${notBefore - now} ns before not_before. Five refusals need at least ${need} ns. Stopped before the five releases.`);
    return;
  }

  for (let n = 1; n <= 5; n++) {
    if (n === 5) {
      body.keysBeforeFifth = await keyList(contractId);
      persist();
      if (!body.keysBeforeFifth.some((key) => key.publicKey === publicKey)) {
        halt(`Access-key list before the fifth refusal does not contain ${publicKey}.`);
        return;
      }
    }
    const rel = await send(agent, contractId, [
      call("release", { id, recipient: recipientId, amount: AMOUNT, evidence_hex: EVIDENCE }, 120n * TGAS),
    ], `refusal ${n}`);
    const refusal = eventCode(rel.events, "refusal");
    const burned = eventCode(rel.events, "key");
    push({
      label: `Release ${n} before time`,
      code: refusal ?? (rel.failure ?? "none"),
      hash: rel.hash,
      moved: "0",
      signer: contractId,
      events: rel.events,
      ...(rel.failure ? { failure: rel.failure } : {}),
    });
    if (refusal !== "ERR_NOT_YET") {
      halt(`Release ${n} returned ${refusal ?? rel.failure ?? "no refusal event"}, expected ERR_NOT_YET.`);
      return;
    }
    if (n < 5 && burned) {
      halt(`Release ${n} emitted key ${burned} before the fifth refusal.`);
      return;
    }
    if (n === 5) {
      push({
        label: "Key burned",
        code: burned ?? "none",
        event: "key",
        hash: rel.hash,
        moved: "0",
        signer: contractId,
        events: rel.events.filter((row) => row.event === "key"),
      });
      if (burned !== "BURNED") {
        halt(`Fifth refusal key event was ${burned ?? "missing"}, expected BURNED.`);
        return;
      }
    }
  }

  body.keysAfterFifth = await keyList(contractId);
  persist();
  if (body.keysAfterFifth.some((key) => key.publicKey === publicKey)) {
    halt(`Access-key list after the fifth refusal still contains ${publicKey}.`);
    return;
  }
  console.log("  key removed           the tripwire key is off the account");

  const dead = await send(agent, contractId, [
    call("release", { id, recipient: recipientId, amount: AMOUNT, evidence_hex: EVIDENCE }, 40n * TGAS),
  ], "after delete");
  const deadCode = permissionCode(dead.failure) ?? (dead.failure ? "unexpected" : "none");
  push({
    label: "Same key after delete",
    code: deadCode === "AccessKeyDoesNotExist" ? "AccessKeyDoesNotExist" : (dead.failure ?? "none"),
    hash: dead.hash,
    moved: "0",
    signer: contractId,
    events: dead.events,
    ...(dead.failure ? { failure: dead.failure, detail: dead.failure } : {}),
    ...(!dead.hash && deadCode === "AccessKeyDoesNotExist"
      ? { note: "No transaction. Rejected before inclusion. Not a contract refusal." }
      : {}),
  });
  if (deadCode !== "AccessKeyDoesNotExist") {
    halt(`Next call with the deleted key returned ${dead.failure ?? "no failure"}, expected AccessKeyDoesNotExist.`);
    return;
  }

  const again = await send(buyer, contractId, [
    call("install_agent", { id, public_key: publicKey, cap: AMOUNT }, 40n * TGAS, 1n),
  ], "reinstall agent");
  const againCode = eventCode(again.events, "key");
  push({
    label: "Reinstall agent",
    code: againCode ?? (again.failure ?? "none"),
    hash: again.hash,
    moved: "0",
    signer: v3.buyer,
    events: again.events,
    ...(again.failure ? { failure: again.failure } : {}),
  });
  if (againCode !== "OK") {
    halt(`Reinstall returned ${againCode ?? again.failure ?? "no key event"}, expected OK.`);
    return;
  }

  await waitUntil(notBefore);
  const paid = await send(agent, contractId, [
    call("release", { id, recipient: recipientId, amount: AMOUNT, evidence_hex: EVIDENCE }, 120n * TGAS),
  ], "second pay");
  const paidCode = eventCode(paid.events, "paid");
  push({
    label: "Second pay on tripwire meter",
    code: paidCode ?? (paid.failure ?? "none"),
    hash: paid.hash,
    moved: AMOUNT,
    signer: contractId,
    events: paid.events,
    ...(paid.failure ? { failure: paid.failure } : {}),
  });
  if (paidCode !== "OK") {
    halt(`Second pay returned ${paidCode ?? paid.failure ?? "no paid event"}, expected OK.`);
    return;
  }

  body.ok = true;
  body.stopped = null;
  body.at = new Date().toISOString();
  persist();
  console.log(`  receipt              ${outPath}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
