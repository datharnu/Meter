import assert from "node:assert/strict";
import test from "node:test";
import { RATE_LIMIT_LABEL, fetchTx, judgeReceipt, rpcCall } from "./receipt-decode.mjs";

process.env.METER_RPC_GAP_MS = "0";
process.env.METER_RPC_BACKOFF_MS = "0";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("rate limit retries five times, then labels the row", async () => {
  const original = globalThis.fetch;
  try {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return json({ jsonrpc: "2.0", error: { code: -429, message: "Rate limits exceeded" } });
    };
    await assert.rejects(rpcCall("https://rpc.test", "tx", {}), (error) => {
      assert.equal(error.rateLimited, true);
      assert.equal(error.message, RATE_LIMIT_LABEL);
      assert.equal(error.message, "not decoded: rate limited (429)");
      return true;
    });
    assert.equal(calls, 5);

    calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response("", { status: 429 });
    };
    await assert.rejects(rpcCall("https://rpc.test", "tx", {}), (error) => error.rateLimited === true);
    assert.equal(calls, 5);

    calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      if (calls < 3) return json({ jsonrpc: "2.0", error: { code: -429, message: "Rate limits exceeded" } });
      return json({ jsonrpc: "2.0", result: { ok: true } });
    };
    assert.deepEqual(await rpcCall("https://rpc.test", "tx", {}), { ok: true });
    assert.equal(calls, 3);

    calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return json({ jsonrpc: "2.0", error: { code: -32000, message: "Server error" } });
    };
    await assert.rejects(rpcCall("https://rpc.test", "tx", {}), (error) => error.rateLimited !== true);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test("a pruned tx stays pruned, and a mismatch still throws", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "UNKNOWN_TRANSACTION" },
    });
    assert.equal(await fetchTx(["https://archival.test", "https://live.test"], "abc", ["signer.test"]), null);

    let calls = 0;
    globalThis.fetch = async (url) => {
      calls += 1;
      if (String(url).includes("archival")) {
        return json({ jsonrpc: "2.0", error: { code: -429, message: "Rate limits exceeded" } });
      }
      return json({ jsonrpc: "2.0", result: { tx: 1 } });
    };
    assert.deepEqual(await fetchTx(["https://archival.test", "https://live.test"], "abc", ["signer.test"]), { tx: 1 });
    assert.equal(calls, 6);

    await assert.rejects(
      fetchTx(["https://archival.test"], "abc", ["signer.test"]),
      (error) => error.rateLimited === true && error.message === "not decoded: rate limited (429)",
    );
  } finally {
    globalThis.fetch = original;
  }

  assert.throws(
    () => judgeReceipt({ hash: "h", expected: "ERR_RECIPIENT", file: "inject.json", label: "attack 1" }, "ERR_AMOUNT", null),
    /expected ERR_RECIPIENT, decoded ERR_AMOUNT/,
  );
  assert.equal(
    judgeReceipt({ hash: "h", expected: "ERR_RECIPIENT", file: "inject.json", label: "attack 1" }, "ERR_RECIPIENT", null).status,
    "match",
  );
  assert.equal(
    judgeReceipt({ hash: "h", expected: "OK", file: "inject.json", label: "pay" }, null, RATE_LIMIT_LABEL).status,
    "not decoded",
  );
});
