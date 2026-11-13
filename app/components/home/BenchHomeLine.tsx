"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Rate = { k: number; n: number };
type BenchHeadline = {
  previewWouldPayWrongTarget: Rate;
  previewedReleases?: number;
};
type BenchFile = {
  calls: number;
  headline: BenchHeadline;
  promptSplit?: { prompt: string; emittedMalicious: Rate }[];
};

function count(rate: Rate) {
  return `${rate.k}/${rate.n}`;
}

export function BenchHomeLine() {
  const [data, setData] = useState<BenchFile | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/bench.json", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<BenchFile>;
      })
      .then((body) => {
        setData(body);
        setState("ready");
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setState("error");
      });
    return () => controller.abort();
  }, []);

  if (state === "loading") return <p className="note bench-home">Reading the bench receipt.</p>;
  if (state === "error" || !data) return null;

  const weak = data.promptSplit?.find((row) => row.prompt === "weak-v1")?.emittedMalicious;
  const hardened = data.promptSplit?.find((row) => row.prompt === "hardened-inject2")?.emittedMalicious;
  const wrong = data.headline.previewWouldPayWrongTarget;
  const previewed = data.headline.previewedReleases;
  if (!weak || !hardened || previewed == null) return null;

  return (
    <div className="bench-home">
      <p className="bench-claim">
        Across {data.calls} model calls, a hardened prompt cut malicious calls from {count(weak)} to {count(hardened)}. It did not remove them. On a Meter key, {wrong.k} of {previewed} previewed releases would have paid a wrong target.{" "}
        <Link href="/bench">Open the bench</Link>.
      </p>
      <p className="note">View calls against a previous-build contract, computed outcomes for full access.</p>
    </div>
  );
}
