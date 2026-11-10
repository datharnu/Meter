import assert from "node:assert/strict";
import test from "node:test";
import { decide, fund, refund, release, sign, slip } from "./rule.mjs";

const amount = 48_000_000;

function deal() {
  return {
    buyer: "marlow.testnet",
    vendor: "sable.testnet",
    recipient: "sable.testnet",
    amount,
    evidence: "field-report-04",
    deadline: 1_000,
    buyerSigned: false,
    vendorSigned: false,
    funded: 0,
    paid: 0,
    refunded: 0,
  };
}

function ready() {
  const d = deal();
  sign(d, "buyer");
  sign(d, "vendor");
  fund(d, amount);
  return d;
}

test("slip keeps only the overlap", () => {
  const agreed = slip(
    { account: "marlow.testnet", max: 60_000_000, evidence: "field-report-04", recipient: "sable.testnet", deadline: 1_000 },
    { account: "sable.testnet", min: 48_000_000, evidence: "field-report-04", recipient: "sable.testnet" },
  );
  assert.equal(agreed.amount, 48_000_000);
  assert.equal(agreed.max, undefined);
  assert.equal(slip(
    { account: "a", max: 10, evidence: "x", recipient: "r", deadline: 1 },
    { account: "b", min: 11, evidence: "x", recipient: "r" },
  ), null);
});

test("pays once and refuses a different recipient", () => {
  const d = ready();
  const wrong = release(d, "other.testnet", amount, "field-report-04", 500);
  assert.equal(wrong.code, "ERR_RECIPIENT");
  assert.equal(wrong.moved, 0);
  assert.equal(d.paid, 0);
  const ok = release(d, "sable.testnet", amount, "field-report-04", 500);
  assert.equal(ok.moved, amount);
  assert.equal(decide(d, "sable.testnet", amount, "field-report-04", 500), "ERR_ALREADY_PAID");
});

test("deadline returns the balance", () => {
  const d = ready();
  assert.equal(refund(d, 999).code, "ERR_TOO_EARLY");
  assert.equal(decide(d, "sable.testnet", amount, "field-report-04", 1_000), "ERR_TOO_LATE");
  assert.equal(refund(d, 1_000).moved, amount);
  assert.equal(d.paid, 0);
});
