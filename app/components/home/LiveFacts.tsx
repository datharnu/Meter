import { NearMark } from "@/components/NearMark";
import { txUrl } from "@/lib/useReceipt";

type State = "loading" | "empty" | "error" | "ready";

function shortHash(hash: string) {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

export function LiveFacts({ state, hash }: { state: State; hash?: string | null }) {
  const receipt = hash
    ? { title: "Receipts are real", detail: shortHash(hash), href: txUrl(hash) }
    : {
        title: "Receipts are real",
        detail: state === "error" ? "The receipt did not load." : state === "empty" ? "No receipt in this build." : "Reading the receipt.",
      };

  return (
    <ul className="live-facts" aria-label="What this page is showing">
      <li>
        <NearMark variant="tile" />
        <span>
          <b>NEAR testnet</b>
          <small className="mono">token.mtrfc658fd1.testnet</small>
        </span>
      </li>
      <li>
        {receipt.href ? (
          <a href={receipt.href}>
            <b>{receipt.title}</b>
            <small className="mono">{receipt.detail}</small>
          </a>
        ) : (
          <span>
            <b>{receipt.title}</b>
            <small>{receipt.detail}</small>
          </span>
        )}
      </li>
      <li>
        <span className="live-zero" aria-hidden="true">0</span>
        <span>
          <b>No hash on this preview</b>
          <small>The browser does not send a transaction.</small>
        </span>
      </li>
    </ul>
  );
}
