# `app/public/real-token.json` shape (Task D — review before recording)

**Do not write this file until a new contract account is deployed.** Existing `chain.json`, `tee.json`, `v2.json`, `inject.json`, and `inject2.json` stay unchanged.

## Token (verified read-only, 2026-11-12)

Account `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af` on NEAR testnet returns `ft_metadata` with **name/symbol USDC, decimals 6**. **Buyer `mtrfc658fd1.testnet` held 20 USDC** from faucet.circle.com at record time.

**Recorded contract:** [`medbf5c.mtrfc658fd1.testnet`](https://testnet.nearblocks.io/address/medbf5c.mtrfc658fd1.testnet) (`app/public/real-token.json`). **Hero meter 4**, **refund meter 3**, **poke meter 1** (funded **2.00 USDC** each, `2000000` base units). Poke deadline **2026-11-20T09:53:42.339Z** — **never** `release` or `refund` poke meter 1. Early refund tx panicked **`ERR_TOO_EARLY`**; second refund panicked **`ERR_ALREADY_PAID`**. Aborted first deploy **`mbec276.mtrfc658fd1.testnet`** still holds about **8 USDC** in meters from a failed hero pass.

## Top-level fields (same family as `v2.json`)

| Field | Purpose |
| --- | --- |
| `network` | `"testnet"` |
| `contract` | **New** `*.mtrfc658fd1.testnet` with wasm hash `3cjYWgNvXqotkSDwSTz7vM6TzKSNi2iwkSqoTtDpRtKy` |
| `token` | `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af` |
| `buyer`, `vendor`, `recipient` | Testnet accounts used in the run |
| `meterId`, `amount` | Base units (**`2000000`** = 2.00 USDC per meter in the recorded run) |
| `sentence`, `evidence`, `lineHash` | Sentence text in JSON (like `v2.json`); **`evidence_hex` on chain** is sha256(NFC sentence) |
| `notBefore`, `deadline` | Nanoseconds from chain (hero meter) |
| `agentPublicKey` | Paying key used for releases (not used by `verify` decode) |
| `pokeMeterId` | Funded, unpaid meter with deadline ≥ two weeks out (Task E) |
| `pokeDeadline` | ISO instant for judges |
| `refundMeter` | Meter id used for post-deadline refund + second refund refused |
| `at` | Recording time UTC |
| `steps` | Array of `{ label, code, hash, moved, signer }` on the **hero** meter path |
| `refundRun` | Refund-window meter steps (`refund` OK, second `refund` refused) |
| `earlyRefundRun` | Optional: `ERR_TOO_EARLY` on a separate funded meter |

## Required `steps` labels (minimum, hero meter)

1. `open` / fund via `ft_transfer_call`
2. `release` before window → `ERR_NOT_YET`
3. **Wrong-recipient `release` → `ERR_RECIPIENT` by design** (not the v2 `ERR_TRANSFER` unregistered path)
4. Sealed `release` in window → `OK` (with balance delta in `moved`)
5. Second `release` → `ERR_ALREADY_PAID`
6. Refund after deadline → `OK` (separate refund-window meter; short deadline)
7. Second `refund` → refused (`ERR_ALREADY_PAID` on chain)
8. Refund before deadline → `ERR_TOO_EARLY` (separate meter; omit if NEAR budget forces minimal run)

**Poke meter:** funded, deadline ≥ 7 days out; **never** `release` or `refund`.

`verify.mjs` will gain a `checkRealToken()` when the file exists (not yet wired until hashes are real).

## Recording

Uses `.keys/testnet.json`, Circle USDC on the buyer, and enough testnet NEAR for deploy + `storage_deposit`. Run: `node chain/real-token-prove.mjs` (writes **only** `app/public/real-token.json`).
