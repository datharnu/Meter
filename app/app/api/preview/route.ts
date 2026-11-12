import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

const ARCHIVAL = "https://archival-rpc.testnet.fastnear.com";
const LIVE = "https://test.rpc.fastnear.com";

async function rpc(url: string, method: string, params: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "preview", method, params }),
    next: { revalidate: 0 },
  });
  const body = await response.json();
  if (body.error) throw new Error(JSON.stringify(body.error).slice(0, 200));
  return body.result;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const meter = sp.get("meter");
  const id = sp.get("id");
  const recipient = sp.get("recipient");
  const amount = sp.get("amount");
  const sentence = sp.get("sentence");
  if (!meter || !id || !recipient || !amount || !sentence) {
    return NextResponse.json({ error: "meter, id, recipient, amount, sentence required" }, { status: 400 });
  }
  const evidence_hex = createHash("sha256").update(Buffer.from(sentence.normalize("NFC"), "utf8")).digest("hex");
  const args = { id: Number(id), recipient, amount, evidence_hex };
  for (const url of [ARCHIVAL, LIVE]) {
    try {
      const view = await rpc(url, "query", {
        request_type: "call_function",
        account_id: meter,
        method_name: "preview",
        args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
        finality: "final",
      });
      const code = JSON.parse(Buffer.from(view.result).toString("utf8")) as string;
      const wouldMove = code === "OK" ? "stored amount if release were signed" : "0.00";
      return NextResponse.json({
        code,
        wouldMove,
        viewOnly: true,
        note: "preview does not count toward the five-refusal tripwire",
        meter,
        id: Number(id),
      });
    } catch {
      /* try next rpc */
    }
  }
  return NextResponse.json({ error: "RPC query failed" }, { status: 502 });
}
