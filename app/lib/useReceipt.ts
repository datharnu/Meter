"use client";

import { useEffect, useState } from "react";

export type Step = {
  label: string;
  code: string;
  hash?: string | null;
  moved?: string;
  detail?: string;
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
  vendorBalance: string;
  at: string;
};

export function useReceipt() {
  const [state, setState] = useState<"loading" | "empty" | "error" | "ready">("loading");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let gone = false;
    setState("loading");
    fetch("/chain.json")
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
  }, [attempt]);

  return { state, receipt, reload: () => setAttempt((n) => n + 1) };
}

export function txUrl(hash: string) {
  return `https://testnet.nearblocks.io/txns/${hash}`;
}

export function formatMoved(amount: string) {
  return `${(Number(amount) / 1_000_000).toFixed(2)} tUSDC`;
}

export function meterFor(receipt: Receipt, step: Step) {
  if (/deadline|return/i.test(step.label)) return receipt.refundMeter ?? receipt.meterId;
  return receipt.meterId;
}
