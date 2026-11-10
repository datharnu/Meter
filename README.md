# Meter

Two companies write a ceiling and a floor. The sheet shows only the price, the recipient, the evidence, and the deadline. Both sign that sheet. A NEAR contract holds the USDC and pays it only when the recipient, the amount, and the evidence match. Anything else is rejected. A missed deadline sends the balance back to the buyer.

This is a second project beside Accord. The payment rule is the same kind of deal. The screen is one invoice, not a room with tabs.

## Do this, see this

The chain payment is already on testnet. The desk in `app/` still runs the same rule in the browser and does not move tokens.

1. `cd app && npm install && npm test && npm run dev`
2. Open http://localhost:3000. The first card shows 48.00 tUSDC, the refused hash, and the paid hash.
3. Open http://localhost:3000/new
4. Choose Seal. See a meter for 48.00 USDC. Marlow's ceiling of 60.00 is not on the sheet.
5. Sign as Marlow Studio, then as Sable Field, then lock 48.00 USDC.
6. Choose Pay a different recipient. See `ERR_RECIPIENT` and `0.00 USDC`.
7. Choose Pay 48.00 USDC. See `OK` and `48.00 USDC`.
8. Start another meter, lock it, move the desk clock past the deadline, and return the balance. See the money on the buyer's side and the vendor unpaid.

To run the chain payment again: `node chain/pay.mjs`. That prints the receipt. `FORCE=1 node chain/pay.mjs` pays a new one. The account keys stay in `.keys/`, which is not committed.

## The contract

`contract/src/rule.rs` is the rule `release` and `preview` both call.

| Call | Result |
|---|---|
| Matching recipient, amount, and evidence, before the deadline | Pays that recipient once |
| Any other recipient, amount, or evidence | Reverts. Balance unchanged |
| The same payment again | `ERR_ALREADY_PAID` |
| Refund before the deadline | `ERR_TOO_EARLY` |
| Refund at or after the deadline, if nothing was paid | The funded balance returns to the buyer |

There is no method that changes the recipient, the amount, or the evidence after the meter is opened.

```bash
cd contract && cargo test
```

Deployed on testnet as `meter3.mtrfc658fd1.testnet`. That account was created with no access key, so the code cannot be replaced. Mainnet waits on an audit. The contract has no owner withdraw.

The payment that moved tokens:

- Refused a different recipient: `DWHDfaWGb31oF1oVgk3QXhqc6U6REy42KqCcoa69jPSD` (`ERR_RECIPIENT`)
- Paid the vendor 48.00 tUSDC: `3TfyC78Qmn9jhFHhjJSDV8Q5rFb9oFgJudijdJ9c215L`

The token is `token.mtrfc658fd1.testnet`. `mint` is public and capped. It is not Circle USDC.

## Limits

- The overlap of the two mandates is computed in the browser. It is not an attested enclave. A failed overlap creates no meter.
- The desk clock is not NEAR block time.
- A green Paid mark on a desk meter is the rule's answer. It is a chain payment only on the testnet card, where the transaction hash is shown.
- The token is testnet tUSDC from this repo, not Circle dollars on mainnet.

## Licence

MIT. See `LICENSE`.
