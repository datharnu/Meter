"use client";

import { LinePreview } from "@/components/LinePreview";

export default function ClausePage() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">The line</h1>
          <p className="lede">The slip is 48.00 to sable.testnet. This preview clock pays only while 400 ≤ time &lt; 1000. This page does not send a transaction. After open, the recipient, the amount, the sentence, and the time cannot be edited.</p>
        </div>
      </div>
      <LinePreview />
    </>
  );
}
