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
  evidence: "Field report 04, price column at most 100",
};

test("the line hash matches the contract vector", () => {
  assert.equal(lineHash(sample), "1b1cb8f6af3e2644bfacb7c21d6a6273e51beb87807b0b65e1a5cb6d3ebb9965");
  assert.equal(
    lineHash({ ...sample, evidence: "e\u0301" }),
    lineHash({ ...sample, evidence: "\u00e9" }),
  );
});

test("the meter/v2 default and the meter/v3 argument both match their vectors", () => {
  assert.equal(lineHash(sample), "1b1cb8f6af3e2644bfacb7c21d6a6273e51beb87807b0b65e1a5cb6d3ebb9965");
  assert.equal(
    lineHash({ ...sample, domain: "meter/v3" }),
    "a66de00ba403a47599877d24b741bf5f3ca2d28c96cb7276462335c9475ca2e3",
  );
});

test("48.00 is not an amount the line can hash", () => {
  assert.throws(() => lineHash({ ...sample, amount: "48.00" }));
});
