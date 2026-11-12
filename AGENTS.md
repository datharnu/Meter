# Meter — agent quick reference

Meter enforces one **sealed line** on NEAR testnet (recipient, amount, sentence, time). `release` pays that line or moves **0.00** with a reason code. The UI and desk do not move money; only chained receipts with hashes do.

## Commands (no keys)

```bash
node chain/verify.mjs          # re-read contracts + decode receipt hashes
node --test app/lib/rule.test.mjs chain/line.test.mjs
cd app && npm install && npm run dev   # http://localhost:3000
```

From `contract-v2/` and `contract-tee/`: `cargo test`. (`contract/` payment-record source does not build standalone; proofs are on chain at `m028a47`.)

## Receipt files (do not edit for proofs)

| File | Contract / role |
| --- | --- |
| `app/public/chain.json` | `m028a47` payment record (toy token) |
| `app/public/tee.json` | `m2b2440` signed release |
| `app/public/v2.json` | `m1870dd` time gate (previous build) |
| `app/public/inject.json` | `i198b44` hijack (toy token) |
| `app/public/inject2.json` | `h3743c5`, `h09d6ce`, wasm provenance |
| `app/public/real-token.json` | TODO: Circle USDC run — only when present |

## Claim → evidence

| Claim | Where checked |
| --- | --- |
| Wrong field → 0.00 + code | Receipt `steps[].hash`, `verify.mjs` RPC decode |
| Line hash / storage | `verify.mjs` `get` + `lineHash` |
| Hijack baseline paid / Meter refused | `inject.json`, `verify.mjs` `checkInject` |
| Wasm on hijack accounts | `inject2.json`, `view_code` |
| Browser preview ≠ payment | `app/lib/rule.mjs` only; no tx hash |
| `preview` same args as `release` | `contract-v2/src/lib.rs`; `chain/check.mjs` view call |

## Limits

No work-quality judge, no mainnet USDC in toy runs, no Meter-held signer. See [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md) and README **Claims and their limits**.

## Judge poke (read-only)

```bash
node chain/check.mjs --meter <contract> --id <n> --recipient X --amount <base units> --sentence "..."
```

View call only; does not increment the five-refusal counter.
