# Meter

Two companies write a ceiling and a floor. The sheet shows only the price, the recipient, the evidence, and the deadline. Both sign that sheet. A NEAR contract holds the USDC and pays it only when the recipient, the amount, and the evidence match. Anything else is rejected. A missed deadline sends the balance back to the buyer.

This is a second project beside Accord. The payment rule is the same kind of deal. The screen is one invoice, not a room with tabs.

## Do this, see this

The chain proof is already on testnet. The desk in `app/` still runs the same rule in the browser and does not move tokens.

1. `cd app && npm install && npm test && npm run dev`
2. Open http://localhost:3000. The first screen is the pitch: the sentence, a wrong account at 0.00, and the sealed line at 48.00. Further down are the payment-record run, the signed release, the limits, and what this is not. Choose Open the desk. Continue in this browser. That names the tab. It does not create a key.
3. On the desk, the payment record shows 48.00 tUSDC cleared, 48.00 sent back, and 4 stopped lines. The signed release shows 48.00 cleared, 0.00 sent back, and 1 stopped line. Open `/clause` and choose Another account. See `ERR_RECIPIENT` and `0.00`. That page does not send a transaction. `/book` lists both receipts, with one CSV. `/key` names both function-call keys, each scoped to `release`, and shows both deleted.
4. From the repo root, `node chain/verify.mjs`. It re-reads both live contracts. No key. It prints `verify: ok`.
5. Open http://localhost:3000/new
6. Choose Seal. See a meter for 48.00 USDC. Marlow's ceiling of 60.00 is not on the sheet.
7. Sign as Marlow Studio, then as Sable Field, then lock 48.00 USDC.
8. Choose Pay a different recipient. See `ERR_RECIPIENT` and `0.00 USDC`.
9. Choose Pay 48.00 USDC. See `OK` and `48.00 USDC`.
10. Start another meter, lock it, move the desk clock past the deadline, and return the balance. See the money on the buyer's side and the vendor unpaid.

To run the full chain proof again: `node chain/prove.mjs`. That deploys a fresh contract and prints the receipt. `FORCE=1 node chain/prove.mjs` runs another one. The account keys stay in `.keys/`, which is not committed.

## The contract

`contract/src/rule.rs` is the rule `release` and `preview` both call.

| Call | Result |
|---|---|
| Matching recipient, amount, and evidence, before the deadline | Pays that recipient once |
| Any other recipient, amount, or evidence | Recorded. Balance unchanged |
| The same payment again | `ERR_ALREADY_PAID` |
| Refund before the deadline | `ERR_TOO_EARLY` |
| Refund at or after the deadline, if nothing was paid | The funded balance returns to the buyer |

There is no method that changes the recipient, the amount, or the evidence after the meter is opened.

```bash
cd contract && cargo test
```

The payment record is `m028a47.mtrfc658fd1.testnet`. It was created with no full-access key. The buyer installed one function-call key that can call `release` and nothing else. After the payment the buyer deleted that key. The account now has no access key, so the code cannot be replaced and the agent cannot sign again. Mainnet waits on an audit. The contract has no owner withdraw.

| Step | Result | Transaction |
|---|---|---|
| Wrong recipient | `ERR_RECIPIENT`, nothing moved | [`DrPqTQnW…`](https://testnet.nearblocks.io/txns/DrPqTQnWZSF94vfG8dyg1cPe1vgDxPuW1C7Yh5rjHdVX) |
| Wrong amount | `ERR_AMOUNT`, nothing moved | [`CLJXCAbM…`](https://testnet.nearblocks.io/txns/CLJXCAbMm4qs37Wp7sKCYFz6ezS7F6f1kKMC2L2CYQG2) |
| Wrong evidence | `ERR_EVIDENCE`, nothing moved | [`HxBaTriU…`](https://testnet.nearblocks.io/txns/HxBaTriUzgt81fpVQ9moJvuMqUdYJwzF4oajZqWqKdAj) |
| Paid the vendor 48.00 tUSDC | `OK` | [`BGX34Gq1…`](https://testnet.nearblocks.io/txns/BGX34Gq1NRv17qNtdBy2pcFqszP5V1AzBfpxy7bwveSt) |
| Buyer deleted the agent key | key removed | [`HL7KXwCN…`](https://testnet.nearblocks.io/txns/HL7KXwCNYgdeMkg5oJ3ttkjUFPFgJ6Lx9YxeKxMhkRfg) |
| Same key called `release` again | rejected, the key does not exist | no transaction was accepted |
| Payment after the deadline | `ERR_TOO_LATE`, nothing moved | [`GZvzNMQg…`](https://testnet.nearblocks.io/txns/GZvzNMQgNzSM69BDQXzch8RB34ip8fFcKysQAuFVAEQq) |
| Balance returned to the buyer | 48.00 tUSDC | [`3MuQnuUx…`](https://testnet.nearblocks.io/txns/3MuQnuUxot9ZxNqvrfeFTRVW753JjBHfzUPzsu3RBsmj) |
| Buyer deleted the deadline key | account left with no key | [`2pJ1s5Lm…`](https://testnet.nearblocks.io/txns/2pJ1s5Lm8tk9eacrxQ8cSSXJDDYYQJ1z3iPy5JZBbF78) |

The vendor account's token balance is 144.00. An earlier run paid 48.00, the payment record added 48.00, and the signed release added 48.00. The token is `token.mtrfc658fd1.testnet`. `mint` is public and capped. It is not Circle USDC. Five refusals from one key delete that key. The payment record deleted the key by the buyer's call after three refusals, rather than waiting for the fifth.

The signed release is a second contract, `m2b2440.mtrfc658fd1.testnet`, in `contract-tee/`. `release` on that contract also requires a `provider_tee` signature. The request and the response must both contain the release line. The signer is pinned when the contract is created. The Intel quote is not checked. The account was created with no full-access key, and the agent key was deleted after payment.

A body that does not contain the line is refused and moves nothing. A matching signature pays 48.00 as soon as the meter is funded. Deleting the key loses if that payment lands first. The model repeated a line this repo already wrote. The contract does not read the field report.

| Step | Result | Transaction |
|---|---|---|
| Body without the line | `ERR_ATTEST_LINE`, nothing moved | [`EQzQ5NRz…`](https://testnet.nearblocks.io/txns/EQzQ5NRzoxLdBSjgk6cjJD5eJCenrEW5rc6hTs1YnR4u) |
| Paid the vendor 48.00 tUSDC | `OK` | [`FjVb3vTX…`](https://testnet.nearblocks.io/txns/FjVb3vTXkQHYSbiWMEwkTzdDxY1o72sTq7cmbtpitCP) |
| Buyer deleted the agent key | key removed | [`HVVXnFMz…`](https://testnet.nearblocks.io/txns/HVVXnFMz8sqnYxrcGDy6voyX3gjX6ng85No9WZrTyDFS) |

The receipt is `app/public/tee.json`. The model is `z-ai/glm-5.3-flash`. The pinned signer is `0x3b753b4406613c5e70ae640508632b600424fa0c`. `node chain/verify.mjs` re-reads this contract as well as the payment record.

```bash
cd contract-tee && cargo test
```

## Limits

- The overlap of the two mandates is computed in the browser. It is not an attested enclave. A failed overlap creates no meter. There is no domain proof and no market-making observer in this repo.
- On the signed release, a matching `provider_tee` signature pays as soon as the meter is funded. Deleting the key loses if that payment lands first. The Intel quote is not checked. The contract does not read the field report.
- The desk clock is not NEAR block time. The deadline refund above used the contract's block time.
- A green Paid mark on a desk meter is the rule's answer in the browser. The testnet card is the chain payment, and each hash is a transaction except the deleted key, which the network rejected before a transaction existed.
- The token is testnet tUSDC from this repo, not Circle dollars on mainnet.
- Continue in this browser writes a tab name into `sessionStorage`. That name cannot sign. The page does not connect a NEAR wallet.

## Licence

MIT. See `LICENSE`.
