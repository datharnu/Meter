// Ask NEAR AI to sign one release line. Does not open a meter and does not deploy.
// The request and the response must both contain the line. The Intel quote is not checked.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak_256 } from "@noble/hashes/sha3";
import { secp256k1 } from "@noble/curves/secp256k1";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://cloud-api.near.ai/v1";
const MODEL = "z-ai/glm-5.3-flash";
const AMOUNT = "48000000";
const EVIDENCE_TEXT = "Field report 04, price column at most 100";
const EVIDENCE = createHash("sha256").update(EVIDENCE_TEXT).digest("hex");
const outPath = join(root, "chain/tee-release.json");

function apiKey() {
  const line = readFileSync(join(root, ".env"), "utf8")
    .split(/\r?\n/)
    .find((item) => item.startsWith("NEARAI_API_KEY="));
  const value = line?.slice("NEARAI_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
  if (!value) throw new Error("NEARAI_API_KEY is missing");
  return value;
}

const key = apiKey();
const keys = JSON.parse(readFileSync(join(root, ".keys/testnet.json"), "utf8"));
const vendorId = `vendor.${keys.buyer.accountId}`;
const line = `meter:1 recipient:${vendorId} amount:${AMOUNT} evidence:${EVIDENCE}`;

function sha(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function recover(text, signatureHex) {
  const sig = Buffer.from(signatureHex.replace(/^0x/i, ""), "hex");
  if (sig.length !== 65) throw new Error(`signature is ${sig.length} bytes`);
  const message = Buffer.from(text, "utf8");
  const digest = keccak_256(Buffer.concat([Buffer.from(`\x19Ethereum Signed Message:\n${message.length}`), message]));
  let v = sig[64];
  if (v >= 27) v -= 27;
  const signature = secp256k1.Signature.fromCompact(sig.subarray(0, 64)).addRecoveryBit(v);
  const pub = signature.recoverPublicKey(digest).toRawBytes(false);
  return `0x${Buffer.from(keccak_256(pub.subarray(1))).subarray(12).toString("hex")}`;
}

async function call(path, { method = "GET", body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    body,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Accept-Encoding": "identity",
      "x-no-aliasing": "true",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  return { status: response.status, bytes };
}

const request = Buffer.from(JSON.stringify({
  model: MODEL,
  messages: [
    { role: "system", content: "Repeat the user's release line exactly. Output only that line." },
    { role: "user", content: line },
  ],
  stream: false,
  temperature: 0,
  max_tokens: 120,
}));

if (!request.toString("utf8").includes(line)) throw new Error("request does not contain the release line");

const completion = await call("/chat/completions", { method: "POST", body: request });
if (completion.status !== 200) {
  let kind = "";
  try {
    kind = String(JSON.parse(completion.bytes.toString("utf8"))?.error?.type ?? "");
  } catch {
    kind = "";
  }
  console.log(`completion: HTTP ${completion.status}${kind ? ` ${kind}` : ""}`);
  process.exit(1);
}

const body = JSON.parse(completion.bytes.toString("utf8"));
const content = String(body.choices?.[0]?.message?.content ?? "").trim();
const responseText = completion.bytes.toString("utf8");
console.log(`completion: ${body.id} model ${body.model ?? MODEL}`);
console.log(`content has line: ${responseText.includes(line)}`);
console.log(`request bytes: ${request.length} response bytes: ${completion.bytes.length}`);

let signature = {};
for (let i = 0; i < 5; i++) {
  const fetched = await call(`/signature/${encodeURIComponent(body.id)}?signing_algo=ecdsa`);
  if (fetched.status === 200) {
    signature = JSON.parse(fetched.bytes.toString("utf8"));
    if (signature.text && signature.signature) break;
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

const expected = `${body.model ?? MODEL}:${sha(request)}:${sha(completion.bytes)}`;
const kind = String(signature.signature_kind ?? "absent");
const bound = signature.text === expected;
let signer = "absent";
try {
  signer = recover(expected, String(signature.signature ?? ""));
} catch (error) {
  signer = `unrecovered ${error.message}`;
}
const claimed = String(signature.signing_address ?? "").toLowerCase();
const pass = bound
  && kind === "provider_tee"
  && signature.signing_algo === "ecdsa"
  && responseText.includes(line)
  && signer.toLowerCase() === claimed
  && request.length <= 16384
  && completion.bytes.length <= 16384;

console.log(`signature_kind: ${kind}`);
console.log(`hashes: ${bound ? "match" : "differ"}`);
console.log(`signing_address: ${claimed || "absent"}`);
console.log(`recovered: ${signer}`);
console.log(pass ? "signature: verified provider_tee" : "signature: failed");
console.log("quote: not checked");
console.log("meter: not opened");

if (!pass) process.exit(1);

writeFileSync(outPath, JSON.stringify({
  model: body.model ?? MODEL,
  line,
  evidence: EVIDENCE,
  evidenceText: EVIDENCE_TEXT,
  amount: AMOUNT,
  vendor: vendorId,
  buyer: keys.buyer.accountId,
  completionId: body.id,
  signer,
  signature: String(signature.signature),
  request: request.toString("utf8"),
  response: responseText,
}, null, 2) + "\n");
console.log(`saved: ${outPath}`);
