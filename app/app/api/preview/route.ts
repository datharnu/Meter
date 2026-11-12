import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

const ARCHIVAL = "https://archival-rpc.testnet.fastnear.com";
const LIVE = "https://test.rpc.fastnear.com";
const MAX_SENTENCE = 500;
const MAX_AMOUNT_LEN = 32;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 40;
const CACHE_TTL_MS = 45_000;
const CACHE_MAX = 128;

type CacheEntry = { at: number; body: object };
type RateEntry = { count: number; reset: number };

const cache = new Map<string, CacheEntry>();
const rates = new Map<string, RateEntry>();

function clientKey(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
  return ip;
}

function rateLimit(key: string): boolean {
  const now = Date.now();
  const row = rates.get(key);
  if (!row || now > row.reset) {
    rates.set(key, { count: 1, reset: now + RATE_WINDOW_MS });
    return true;
  }
  if (row.count >= RATE_MAX) return false;
  row.count += 1;
  return true;
}

function isAccountId(value: string) {
  if (value.length < 2 || value.length > 64) return false;
  if (/^[0-9a-f]{64}$/.test(value)) return true;
  return /^[a-z0-9._-]+(\.[a-z0-9._-]+)*$/.test(value);
}

function validAmount(value: string) {
  if (!/^[0-9]{1,32}$/.test(value)) return false;
  try {
    return BigInt(value) > 0n;
  } catch {
    return false;
  }
}

function validId(value: string) {
  if (!/^[0-9]+$/.test(value)) return false;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 && n <= 1_000_000;
}

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
  const rl = clientKey(request);
  if (!rateLimit(rl)) {
    return NextResponse.json({ error: "rate limited; try again in a minute" }, { status: 429 });
  }

  const sp = request.nextUrl.searchParams;
  const meter = sp.get("meter")?.trim() ?? "";
  const id = sp.get("id")?.trim() ?? "";
  const recipient = sp.get("recipient")?.trim() ?? "";
  const amount = sp.get("amount")?.trim() ?? "";
  const sentence = sp.get("sentence") ?? "";

  if (!meter || !id || !recipient || !amount || !sentence.trim()) {
    return NextResponse.json({ error: "meter, id, recipient, amount, and sentence are required" }, { status: 400 });
  }
  if (!isAccountId(meter) || !isAccountId(recipient)) {
    return NextResponse.json({ error: "meter and recipient must be valid NEAR account ids" }, { status: 400 });
  }
  if (!validId(id)) {
    return NextResponse.json({ error: "id must be a non-negative integer" }, { status: 400 });
  }
  if (!validAmount(amount)) {
    return NextResponse.json({ error: "amount must be base units as digits (1–32 chars, not zero)" }, { status: 400 });
  }
  if (sentence.length > MAX_SENTENCE) {
    return NextResponse.json({ error: `sentence must be at most ${MAX_SENTENCE} characters` }, { status: 400 });
  }

  const evidence_hex = createHash("sha256").update(Buffer.from(sentence.normalize("NFC"), "utf8")).digest("hex");
  const args = { id: Number(id), recipient, amount, evidence_hex };
  const cacheKey = `${meter}:${id}:${recipient}:${amount}:${evidence_hex}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json(hit.body);
  }

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
      const body = {
        code,
        wouldMove,
        viewOnly: true,
        note: "preview does not count toward the five-refusal tripwire",
        meter,
        id: Number(id),
      };
      if (cache.size >= CACHE_MAX) {
        const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (oldest) cache.delete(oldest[0]);
      }
      cache.set(cacheKey, { at: Date.now(), body });
      return NextResponse.json(body);
    } catch {
      /* try next rpc */
    }
  }
  return NextResponse.json({ error: "RPC query failed" }, { status: 502 });
}
