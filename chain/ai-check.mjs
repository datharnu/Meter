// One NEAR AI completion. Prints the signature result, never the key.
// A meter is not opened here. provider_tee with matching hashes is the only pass.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://cloud-api.near.ai/v1";
const MODEL = "z-ai/glm-5.3-flash";

function apiKey() {
  const line = readFileSync(join(root, ".env"), "utf8")
    .split(/\r?\n/)
    .find((item) => item.startsWith("NEARAI_API_KEY="));
  const value = line?.slice("NEARAI_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
  if (!value) throw new Error("NEARAI_API_KEY is missing");
  return value;
}

const key = apiKey();

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

function sha(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const request = Buffer.from(JSON.stringify({
  model: MODEL,
  messages: [
    { role: "system", content: "Reply with one JSON object and nothing else." },
    { role: "user", content: 'Reply with {"ok":true}.' },
  ],
  stream: false,
  temperature: 0,
  max_tokens: 40,
}));

const completion = await call("/chat/completions", { method: "POST", body: request });
if (completion.status !== 200) {
  let kind = "";
  try {
    kind = String(JSON.parse(completion.bytes.toString("utf8"))?.error?.type ?? "");
  } catch {
    kind = "";
  }
  console.log(`completion: HTTP ${completion.status}${kind ? ` ${kind}` : ""}`);
  console.log("signature: not checked");
  console.log("meter: not opened");
  process.exit(1);
}

const body = JSON.parse(completion.bytes.toString("utf8"));
const content = String(body.choices?.[0]?.message?.content ?? "").trim();
console.log(`completion: ${body.id} model ${body.model ?? MODEL}`);
console.log(`content: ${content.slice(0, 120)}`);

let signature = {};
for (let i = 0; i < 5; i++) {
  const fetched = await call(`/signature/${encodeURIComponent(body.id)}?signing_algo=ecdsa`);
  if (fetched.status === 200) {
    signature = JSON.parse(fetched.bytes.toString("utf8"));
    if (signature.text && signature.signature) break;
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

const expected = `${MODEL}:${sha(request)}:${sha(completion.bytes)}`;
const kind = String(signature.signature_kind ?? "absent");
const bound = signature.text === expected;
console.log(`signature_kind: ${kind}`);
console.log(`hashes: ${bound ? "match" : "differ"}`);
console.log(`signing_address: ${signature.signing_address ?? "absent"}`);
const pass = bound && kind === "provider_tee" && signature.signing_algo === "ecdsa";
console.log(pass ? "signature: verified provider_tee" : "signature: failed");
console.log("quote: not checked");
console.log("meter: not opened");
process.exit(pass ? 0 : 1);
