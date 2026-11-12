# FAQ

Answers refer to the **time-gate** build in `contract-v2` (`chain/meter-v2.wasm`) and the recorded runs in `app/public/*.json`. Toy runs use `token.mtrfc658fd1.testnet`, not Circle USDC.

## Why not a plain escrow or timelock?

An escrow or timelock typically releases to whoever the payer names at release time, or unlocks a lump sum when time passes. Meter stores **recipient, amount, sentence, and window at `open`**. `release` recomputes checks from that storage; a changed recipient or amount returns `ERR_*` and moves 0.00. The time gate adds `ERR_NOT_YET` / `ERR_TOO_LATE` on top of that line, not instead of it. See `app/public/v2.json` and `contract-v2/src/rule.rs`.

## Why not a function-call key allowance alone?

NEAR can scope a key to `release` only, but allowance does not seal **which** recipient, amount, or sentence may pass. The agent can still call `release` with wrong arguments until the contract refuses. Meter stores the line on chain and checks every argument against it. The key also carries **0.50 NEAR** for gas (not the invoice), cannot attach a deposit, and is deleted after **five** counted refusals (or the buyer revokes). Recorded on `i198b44`: five refusals, then `DeleteKey` in [`FSbNMWJthR6DTgK6ptGazRXeGDHFn8mwf2zCFNHnSM8e`](https://testnet.nearblocks.io/txns/FSbNMWJthR6DTgK6ptGazRXeGDHFn8mwf2zCFNHnSM8e).

## What does the agent decide versus the contract?

The agent (or a person at the desk) chooses **what to put in the transaction**: recipient string, amount, evidence hex, and when to call `release`. The contract decides **whether value moves**, using only storage written at `open` and block time. The browser preview uses the same rule via `decide()` in `app/lib/rule.mjs`; it never sends a transaction. A Clears mark has no hash.

## What if the amount must change?

Open a **new meter** with a new line. No method edits recipient, amount, sentence, or window after `open`. If the parties agree a new figure, they fund a new line; the old deposit can be refunded after its deadline if unpaid (`refund` on the time-gate build).

## What if an honest agent polls early?

Call **`preview`** on chain (same arguments as `release`) or use the homepage **Try the refusal** / `decide()` locally. `preview` is a view: it does **not** count toward the five-refusal tripwire (`contract-v2/src/rule.rs`, test `preview_leaves_the_refusal_counter_unchanged`). `ERR_NOT_YET` on a real `release` does count, as recorded on `m1870dd`.
