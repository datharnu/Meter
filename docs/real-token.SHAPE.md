# `app/public/real-token.json` shape (Task D — review before recording)

**Do not write this file until a new contract account is deployed.** Existing `chain.json`, `tee.json`, `v2.json`, `inject.json`, and `inject2.json` stay unchanged.

## Token (verified read-only, 2026-11-12)

Account `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af` on NEAR testnet returns `ft_metadata` with **name/symbol USDC, decimals 6**. Not confirmed: Circle faucet balance for deployer; confirm before `open`/`fund`.

## Top-level fields (same family as `v2.json`)

| Field | Purpose |
| --- | --- |
| `network` | `"testnet"` |
| `contract` | **New** `*.mtrfc658fd1.testnet` with wasm hash `3cjYWgNvXqotkSDwSTz7vM6TzKSNi2iwkSqoTtDpRtKy` |
| `token` | `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af` |
| `buyer`, `vendor`, `recipient` | Testnet accounts used in the run |
| `meterId`, `amount` | Base units (e.g. `5000000` or `10000000` for 5.00 / 10.00 USDC) |
| `sentence`, `evidence`, `lineHash` | NFC sentence + sha256 hex + recomputed line hash |
| `notBefore`, `deadline` | Nanoseconds from chain |
| `agentPublicKey` | Paying key used for releases (not used by `verify` decode) |
| `pokeMeterId` | Funded, unpaid meter with deadline ≥ two weeks out (Task E) |
| `pokeDeadline` | ISO instant for judges |
| `at` | Recording time UTC |
| `steps` | Array of `{ label, code, hash, moved, signer }` |
| `refundRun` | Optional nested object for refund path txs |

## Required `steps` labels (minimum)

1. `open` / fund via `ft_transfer_call`
2. `release` before window → `ERR_NOT_YET`
3. Wrong recipient → `ERR_RECIPIENT`
4. Sealed `release` in window → `OK` (with balance delta in `moved`)
5. Second `release` → `ERR_ALREADY_PAID`
6. Refund after deadline → `OK`
7. Second `refund` → refused
8. Refund before deadline → `ERR_TOO_EARLY` (separate meter)

`verify.mjs` will gain a `checkRealToken()` when the file exists (not yet wired until hashes are real).

## Deploy stopped here

Recording requires `.keys/testnet.json` and faucet USDC on the buyer. **Confirm this shape, then run deployment locally or ask for Task D to continue.**
