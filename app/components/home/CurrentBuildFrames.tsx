"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatUnits, type Receipt, type Step } from "@/lib/useReceipt";

type LoadState = "loading" | "empty" | "error" | "ready";

function addressUrl(contract: string) {
  return `https://testnet.nearblocks.io/address/${contract}`;
}

type UsdcReceipt = Receipt & { pokeMeterId?: number; amount?: string };
type V3Receipt = Receipt & { cap?: string; domain?: string };
type TripwireReceipt = { contract?: string; meterId?: number; steps?: Step[] };

function StatRows({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="receipt-mini-stats">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ReceiptCard({
  tag,
  contract,
  loading,
  error,
  stats,
  jsonHref,
}: {
  tag: string;
  contract: string | undefined;
  loading: boolean;
  error: boolean;
  stats: { label: string; value: string }[] | null;
  jsonHref: string;
}) {
  return (
    <article className="receipt-card action-card">
      <span className="receipt-tag">{tag}</span>
      {loading && <p className="note">Reading the receipt.</p>}
      {error && <p className="note" role="alert">The receipt did not load.</p>}
      {!loading && !error && contract ? (
        <>
          <a className="mono receipt-account" href={addressUrl(contract)}>{contract}</a>
          {stats ? <StatRows rows={stats} /> : null}
          <p className="receipt-links">
            <Link className="mono" href={jsonHref}>receipt JSON</Link>
            <span aria-hidden="true"> · </span>
            <a className="mono" href={addressUrl(contract)}>NearBlocks</a>
          </p>
        </>
      ) : null}
    </article>
  );
}

export function CurrentBuildFrames({
  v3,
  usdc,
}: {
  v3: { state: LoadState; receipt: Receipt | null };
  usdc: { state: LoadState; receipt: UsdcReceipt | null };
}) {
  const [tripwire, setTripwire] = useState<TripwireReceipt | null>(null);
  const [tripwireState, setTripwireState] = useState<"loading" | "ready" | "error">("loading");

  const v3Body = v3.receipt as V3Receipt | null;
  const v3Steps = v3.state === "ready" && v3Body?.steps ? v3Body.steps.filter((step) => step.hash).length : null;
  useEffect(() => {
    const controller = new AbortController();
    fetch("/v3-tripwire.json", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<TripwireReceipt>;
      })
      .then((body) => {
        setTripwire(body);
        setTripwireState("ready");
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setTripwire(null);
        setTripwireState("error");
      });
    return () => controller.abort();
  }, []);

  const burned = tripwire?.steps?.some((step) => step.code === "BURNED");
  const tripwireMeter = tripwire?.meterId;

  const tripwireLabel = tripwireState === "loading"
    ? "Reading tripwire receipt."
    : tripwireState === "error"
      ? "Tripwire receipt did not load."
      : burned
        ? `BURNED recorded${tripwireMeter != null ? ` (meter ${tripwireMeter})` : ""}`
        : "BURNED not in tripwire receipt";

  const v3Stats =
    v3.state === "ready" && v3Steps != null && v3Body?.cap != null
      ? [
          { label: "Steps", value: `${v3Steps} decoded from events` },
          { label: "Tripwire", value: tripwireLabel },
          { label: "Cap", value: `${formatUnits(v3Body.cap)} USDC` },
        ]
      : null;

  const heroMeter = usdc.receipt?.meterId;
  const refundMeter = usdc.receipt?.refundMeter;
  const pokeMeter = usdc.receipt?.pokeMeterId;
  const perMeter = usdc.receipt?.amount;

  const usdcStats =
    usdc.state === "ready" && heroMeter != null && refundMeter != null && pokeMeter != null && perMeter != null
      ? [
          { label: "Hero", value: `meter ${heroMeter}` },
          { label: "Refund", value: `meter ${refundMeter}` },
          { label: "Poke", value: `meter ${pokeMeter} · ${formatUnits(perMeter)} USDC per meter` },
        ]
      : null;

  return (
    <div className="current-builds">
      <header className="current-builds-head">
        <p className="craft-eyebrow">Current builds</p>
        <h3 className="current-builds-title">Recorded on the current build.</h3>
      </header>
      <div className="current-build-grid">
        <ReceiptCard
          tag="v3 · current build"
          contract={v3Body?.contract}
          loading={v3.state === "loading"}
          error={v3.state === "error"}
          stats={v3Stats}
          jsonHref="/v3.json"
        />
        <ReceiptCard
          tag="Circle testnet USDC"
          contract={usdc.receipt?.contract}
          loading={usdc.state === "loading"}
          error={usdc.state === "error"}
          stats={usdcStats}
          jsonHref="/real-token.json"
        />
      </div>
    </div>
  );
}
