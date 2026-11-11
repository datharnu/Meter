"use client";

import { useEffect, useState } from "react";
import { tallyUnits } from "./ledger.mjs";

export type Step = {
  label: string;
  code: string;
  hash?: string | null;
  moved?: string;
  detail?: string;
  meter?: number;
};

export type Receipt = {
  network: string;
  contract: string;
  token: string;
  buyer: string;
  vendor: string;
  meterId: number;
  refundMeter?: number;
  amount: string;
  evidence: string;
  agentPublicKey?: string;
  steps?: Step[];
  refused?: { hash: string; code: string };
  paid?: { hash: string; code: string };
  vendorBalance?: string;
  model?: string;
  signer?: string;
  quote?: string;
  recipient?: string;
  notBefore?: string;
  deadline?: string;
  lineHash?: string;
  at: string;
};

export function useReceipt(path = "/chain.json") {
  const [state, setState] = useState<"loading" | "empty" | "error" | "ready">("loading");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let gone = false;
    setState("loading");
    fetch(path)
      .then(async (response) => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<Receipt>;
      })
      .then((body) => {
        if (gone) return;
        if (!body?.paid?.hash && !body?.steps?.length) {
          setState("empty");
          return;
        }
        setReceipt(body);
        setState("ready");
      })
      .catch(() => {
        if (!gone) setState("error");
      });
    return () => {
      gone = true;
    };
  }, [attempt, path]);

  return { state, receipt, reload: () => setAttempt((n) => n + 1) };
}

export function txUrl(hash: string) {
  return `https://testnet.nearblocks.io/txns/${hash}`;
}

export function units(amount?: string) {
  try {
    return BigInt(amount && /^-?\d+$/.test(amount) ? amount : "0");
  } catch {
    return BigInt(0);
  }
}

const SCALE = BigInt(1000000);

export function formatUnits(amount: string | bigint) {
  const n = typeof amount === "bigint" ? amount : units(amount);
  const neg = n < BigInt(0);
  const v = neg ? -n : n;
  const whole = v / SCALE;
  const frac = (v % SCALE).toString().padStart(6, "0").slice(0, 2);
  return `${neg ? "-" : ""}${whole}.${frac}`;
}

export function formatMoved(amount: string) {
  return `${formatUnits(amount)} tUSDC`;
}

export function tally(steps: Step[]) {
  return tallyUnits(steps);
}

export function meterFor(receipt: Receipt, step: Step) {
  if (typeof step.meter === "number") return step.meter;
  if (/deadline|return/i.test(step.label)) return receipt.refundMeter ?? receipt.meterId;
  return receipt.meterId;
}
