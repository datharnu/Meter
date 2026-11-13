// View-only preview. Same arguments as release. Never sends a transaction.

const ARCHIVAL = "https://archival-rpc.testnet.fastnear.com";
const LIVE = process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com";

async function rpc(url, params) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "bench", method: "query", params }),
  });
  const body = await response.json();
  if (body.error) {
    const message = typeof body.error === "string" ? body.error : JSON.stringify(body.error);
    throw new Error(message.slice(0, 300));
  }
  return body.result;
}

export async function previewView(contract, args) {
  const params = {
    request_type: "call_function",
    account_id: contract,
    method_name: "preview",
    args_base64: Buffer.from(JSON.stringify({
      id: args.id,
      recipient: args.recipient,
      amount: args.amount,
      evidence_hex: args.evidenceHex,
    })).toString("base64"),
    finality: "final",
  };
  let last = null;
  for (const url of [ARCHIVAL, LIVE]) {
    try {
      const view = await rpc(url, params);
      const code = JSON.parse(Buffer.from(view.result).toString("utf8"));
      return { code: String(code), at: new Date().toISOString(), rpc: url === ARCHIVAL ? "archival" : "live", error: null };
    } catch (error) {
      last = error;
    }
  }
  return { code: null, at: new Date().toISOString(), rpc: null, error: String(last?.message ?? last).slice(0, 300) };
}
