# Threat model (what Meter actually bounds)

This describes **deployed testnet behavior** in this repo, not a production security review. Token: `token.mtrfc658fd1.testnet` on hijack/time-gate fixtures unless `real-token.json` says otherwise.

## In scope

- **Payment redirection at release:** Wrong recipient, amount, or sentence on `release` → 0.00 + code (`ERR_RECIPIENT`, `ERR_AMOUNT`, `ERR_EVIDENCE`, `ERR_NOT_YET`, …). Evidence: `app/public/chain.json`, `inject.json`.
- **Hijacked paying key:** Key may only call `release` (function-call, no deposit). Wrong args refuse; fifth counted refusal deletes the key (`i198b44`). Hijacked key cannot call `install_agent`, `open`, or `refund` without 1 yoctoNEAR from the buyer.
- **Storage as source of truth:** Line fields are fixed at `open`; `release` reads storage, not client labels.
- **Paid means transfer succeeded:** On `contract-v2`, `paid` updates in `on_released` after `ft_transfer` succeeds (`m1870dd` unregistered recipient → `ERR_TRANSFER`).

## Out of scope / explicit non-goals

| Boundary | Meaning |
| --- | --- |
| Work quality | Time is a clock; sentence hash is integrity of text, not field-work verification. |
| Line before open | If parties seal a wrong account, the contract enforces that wrong account until deadline/refund. |
| Collusion | Buyer and vendor can open any line they both fund. |
| Token issuer | Balances and registration are whatever the NEP-141 contract implements; Meter does not audit the token. |
| Fair price | No oracle or “reasonable amount” check. |
| Hijack burn | Agent can exhaust its own key with refusals; it cannot pull buyer escrow to an arbitrary account if the line forbids it. |
| Mainnet / audit | Documented testnet only; no Circle mainnet claim on toy token runs. |
| Prompts | System prompts are not enforced on chain (see hijack baseline vs Meter key). |

## Not modeled here

No payment relay, no owner withdraw path, no off-chain audit log product. Verification is **receipt JSON + `node chain/verify.mjs`**, optionally `chain/check.mjs` for a view-only `preview`.

See also README [Claims and their limits](../README.md#claims-and-their-limits).
