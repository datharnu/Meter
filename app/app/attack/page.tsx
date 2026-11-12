"use client";

import { HijackSection } from "@/components/home/HijackSection";
import { ReceiptGate } from "@/components/ReceiptGate";
import { useInject } from "@/lib/useInject";

export default function AttackPage() {
  const { state, receipt, reload } = useInject();
  return (
    <>
      <header className="page-head">
        <p className="kicker">AI security</p>
        <h1>The hijack</h1>
      </header>
      <ReceiptGate state={state} onRetry={reload} empty="No hijack receipt on this build. node chain/inject.mjs records one.">
        {receipt ? <HijackSection receipt={receipt} variant="page" /> : null}
      </ReceiptGate>
    </>
  );
}
