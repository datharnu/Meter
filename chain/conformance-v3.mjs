// Re-read app/public/v3.json steps against NEP-297 meter events. No keys.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ARCHIVAL, RATE_LIMIT_LABEL, decodeV3StepFromTx, fetchTx } from "./receipt-decode.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const path = join(root, "app/public/v3.json");
const LIVE = process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com";
const RPC_TRY = [...new Set([ARCHIVAL, LIVE])];

function matches(expected, report) {
  const { decoded, source, events } = report;
  if (!decoded) return false;
  if (expected === decoded) return true;
  if (expected === "OK" && decoded === "OK") return true;
  if (expected === "no event, panic" && source === "panic" && decoded === "ERR_BAD_MSG" && !(events?.length)) return true;
  return false;
}

async function main() {
  if (!existsSync(path)) {
    console.error("Missing app/public/v3.json.");
    process.exit(1);
  }
  const v3 = JSON.parse(readFileSync(path, "utf8"));
  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const step of v3.steps ?? []) {
    if (!step.hash) continue;
    const signers = [step.signer, v3.buyer, v3.vendor, v3.contract, v3.token].filter(Boolean);
  let report;
    try {
      const tx = await fetchTx(RPC_TRY, step.hash, signers);
      if (!tx) {
        console.log(`skip ${step.hash} ${step.code} pruned`);
        skipped += 1;
        continue;
      }
      report = decodeV3StepFromTx(tx, v3.contract, step.code);
    } catch (error) {
      if (error.rateLimited) {
        console.log(`skip ${step.hash} ${step.code} ${RATE_LIMIT_LABEL}`);
        skipped += 1;
        continue;
      }
      throw error;
    }
    if (!matches(step.code, report)) {
      console.error(
        `mismatch ${step.hash} label=${JSON.stringify(step.label)} expected=${step.code} decoded=${report.decoded} source=${report.source}`,
      );
      failed += 1;
      continue;
    }
    console.log(`ok ${step.hash} ${step.code} ${report.source}`);
    ok += 1;
  }

  console.log(`conformance-v3: ${ok} ok, ${skipped} skipped, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
