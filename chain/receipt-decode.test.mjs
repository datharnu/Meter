import assert from "node:assert/strict";
import test from "node:test";
import { RATE_LIMIT_LABEL, dualEventNote, fetchTx, judgeReceipt, printReceiptReport, receiptCategory, rpcCall } from "./receipt-decode.mjs";

process.env.METER_RPC_GAP_MS = "0";
process.env.METER_RPC_BACKOFF_MS = "0";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("rate limit retries six times, then labels the row", async () => {
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
    assert.equal(calls, 6);

    calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response("", { status: 429 });
    };
    await assert.rejects(rpcCall("https://rpc.test", "tx", {}), (error) => error.rateLimited === true);
    assert.equal(calls, 6);

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
    assert.equal(calls, 7);

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

test("legacy receipt report summarizes by category unless --verbose", () => {
  assert.equal(receiptCategory({ status: "match", reason: null }), "decoded");
  assert.equal(receiptCategory({ status: "not decoded", reason: RATE_LIMIT_LABEL }), "rate limited (429)");
  assert.equal(receiptCategory({ status: "not decoded", reason: "not decoded: pruned" }), "pruned");
  assert.equal(
    receiptCategory({ status: "not decoded", reason: "no SuccessValue or ERR_* on contract receipts" }),
    "no return value to decode",
  );
  assert.equal(
    receiptCategory({
      status: "not decoded",
      expected: "ERR_TOO_LATE",
      label: "Late deposit",
      reason: "ft_transfer_call fund path; ERR_TOO_LATE is from the recorded run, not a release return",
    }),
    "recorded from the run script",
  );
  assert.equal(
    receiptCategory({ status: "not decoded", expected: "WINDOW_WAIT", reason: RATE_LIMIT_LABEL }),
    "rate limited (429)",
  );
  assert.equal(
    dualEventNote([{ code: "ERR_NOT_YET" }, { code: "BURNED" }]),
    "one transaction yields two events: ERR_NOT_YET and BURNED",
  );
  assert.equal(dualEventNote([{ code: "ERR_NOT_YET" }]), null);

  const report = {
    matched: 1,
    total: 2,
    notDecoded: [{}],
    rows: [
      { hash: "abc", expected: "OK", status: "match", decoded: "OK", reason: null },
      { hash: "def", expected: "OK", status: "not decoded", decoded: null, reason: "not decoded: pruned" },
    ],
  };
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(String(line));
  try {
    printReceiptReport(report);
    assert.deepEqual(lines, [
      "decoded 1",
      "rate limited (429) 0",
      "pruned 1",
      "no return value to decode 0",
      "recorded from the run script 0",
    ]);
    lines.length = 0;
    printReceiptReport(report, { verbose: true });
    assert.equal(lines.some((line) => line.includes("def")), true);
    assert.equal(lines[0], "decoded 1");
  } finally {
    console.log = original;
  }
});
