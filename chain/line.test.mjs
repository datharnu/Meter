import assert from "node:assert/strict";
import test from "node:test";
import { lineHash } from "./line.mjs";

const sample = {
  contract: "m.example.testnet",
  meterId: 1,
  token: "token.example.testnet",
  recipient: "sable.testnet",
  amount: 48_000_000,
  notBefore: 100,
  deadline: 1000,
  evidence: "ab".repeat(32),
};

test("the line hash matches the contract vector", () => {
  assert.equal(lineHash(sample), "ef94b445cac1c1ab3b81d1c0cfac8e6017df89a1ce571540fc61cfb5ffc24d8d");
});

test("48.00 is not an amount the line can hash", () => {
  assert.throws(() => lineHash({ ...sample, amount: "48.00" }));
});
