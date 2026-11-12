"use client";

import { use } from "react";
import { AttackDetail } from "@/components/AttackDetail";
import { ReceiptGate } from "@/components/ReceiptGate";
import { useInject } from "@/lib/useInject";

export default function AttackDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { state, receipt, reload } = useInject();
  return (
    <ReceiptGate state={state} onRetry={reload} empty="No hijack receipt on this build. node chain/inject.mjs records one.">
      {receipt ? <AttackDetail receipt={receipt} id={decodeURIComponent(id)} /> : null}
    </ReceiptGate>
  );
}
