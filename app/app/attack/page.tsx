"use client";

import { Suspense } from "react";
import { AttackRecord } from "@/components/AttackRecord";
import { ReceiptGate } from "@/components/ReceiptGate";
import { useInject } from "@/lib/useInject";

function AttackBody() {
  const { state, receipt, reload } = useInject();
  return (
    <ReceiptGate state={state} onRetry={reload} empty="No hijack receipt on this build. node chain/inject.mjs records one.">
      {receipt ? <AttackRecord receipt={receipt} /> : null}
    </ReceiptGate>
  );
}

export default function AttackPage() {
  return (
    <Suspense fallback={<p className="note">Reading the hijack receipt.</p>}>
      <AttackBody />
    </Suspense>
  );
}
