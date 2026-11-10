# Meter

Two companies write a ceiling and a floor. The sheet shows only the price, the recipient, the evidence, and the deadline. Both sign that sheet. A NEAR contract holds the USDC and pays it only when the recipient, the amount, and the evidence match. Anything else is rejected. A missed deadline sends the balance back to the buyer.

This is a second project beside Accord. The payment rule is the same kind of deal. The screen is one invoice, not a room with tabs.

## Do this, see this

The desk in `app/` runs the rule in the browser. It does not move tokens. The contract in `contract/` is what moves them, after it is deployed.

1. `cd app && npm install && npm test && npm run dev`
2. Open http://localhost:3000/new
3. Choose Seal. See a meter for 48.00 USDC. Marlow's ceiling of 60.00 is not on the sheet.
4. Sign as Marlow Studio, then as Sable Field, then lock 48.00 USDC.
5. Choose Pay a different recipient. See `ERR_RECIPIENT` and `0.00 USDC`.
6. Choose Pay 48.00 USDC. See `OK` and `48.00 USDC`.
7. Start another meter, lock it, move the desk clock past the deadline, and return the balance. See the money on the buyer's side and the vendor unpaid.

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

Deploy is not done in this repo yet. Mainnet waits on an audit. Until the deploy key is removed, whoever holds it can replace the code. The contract has no owner withdraw.

## Limits

- The overlap of the two mandates is computed in the browser. It is not an attested enclave. A failed overlap creates no meter.
- The desk clock is not NEAR block time.
- A green Paid mark on the desk is the rule's answer. It is a chain payment only when a transaction hash is shown. None are shown yet.
- The token is testnet USDC once deployed, not a promise of Circle dollars on mainnet.

## Licence

MIT. See `LICENSE`.
