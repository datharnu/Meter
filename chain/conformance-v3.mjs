// Re-read app/public/v3.json steps against NEP-297 meter events. No keys.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ARCHIVAL, RATE_LIMIT_LABEL, decodeV3StepFromTx, fetchTx, matchesV3Step } from "./receipt-decode.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = ["app/public/v3.json", "app/public/v3-tripwire.json"].map((name) => join(root, name));
const LIVE = process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com";
const RPC_TRY = [...new Set([ARCHIVAL, LIVE])];

async function checkFile(path) {
  const file = JSON.parse(readFileSync(path, "utf8"));
  let ok = 0;
  let skipped = 0;
  let failed = 0;
  for (const step of file.steps ?? []) {
    if (step.code === "AccessKeyDoesNotExist" && !step.hash) {
      const text = `${step.failure ?? ""} ${step.detail ?? ""}`;
      if (!/AccessKeyDoesNotExist|UNKNOWN_ACCESS_KEY|does not exist/i.test(text)) {
        console.error(`mismatch no-hash label=${JSON.stringify(step.label)} expected=AccessKeyDoesNotExist`);
        failed += 1;
      } else {
        console.log(`ok no-hash AccessKeyDoesNotExist status`);
        ok += 1;
      }
      continue;
    }
    if (!step.hash) continue;
    const signers = [step.signer, file.buyer, file.vendor, file.contract, file.token].filter(Boolean);
    let report;
    try {
      const tx = await fetchTx(RPC_TRY, step.hash, signers);
      if (!tx) {
        console.log(`skip ${step.hash} ${step.code} pruned`);
        skipped += 1;
        continue;
      }
      report = decodeV3StepFromTx(tx, file.contract, step.code);
    } catch (error) {
      if (error.rateLimited) {
        console.log(`skip ${step.hash} ${step.code} ${RATE_LIMIT_LABEL}`);
        skipped += 1;
        continue;
      }
      throw error;
    }
    if (!matchesV3Step(step.code, report)) {
      console.error(
        `mismatch ${step.hash} label=${JSON.stringify(step.label)} expected=${step.code} decoded=${report.decoded} source=${report.source}`,
      );
      failed += 1;
      continue;
    }
    console.log(`ok ${step.hash} ${step.code} ${report.source}`);
    ok += 1;
  }
  return { ok, skipped, failed };
}

async function main() {
  let ok = 0;
  let skipped = 0;
  let failed = 0;
  let seen = 0;
  for (const path of files) {
    if (!existsSync(path)) continue;
    seen += 1;
    const result = await checkFile(path);
    ok += result.ok;
    skipped += result.skipped;
    failed += result.failed;
  }
  if (!seen) {
    console.error("Missing app/public/v3.json.");
    process.exit(1);
  }
  console.log(`conformance-v3: ${ok} ok, ${skipped} skipped, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
