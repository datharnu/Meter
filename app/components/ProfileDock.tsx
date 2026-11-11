"use client";

import { useEffect, useId, useState } from "react";
import { Logo } from "@/components/Logo";
import { useDesk } from "@/lib/store";

const TAB = "meter-tab";

export function readTab() {
  try {
    return sessionStorage.getItem(TAB);
  } catch {
    return null;
  }
}

export function writeTab() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  sessionStorage.setItem(TAB, hex);
  return hex;
}

function short(id: string) {
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export function ProfileDock({ place }: { place: "side" | "top" }) {
  const panelId = useId();
  const clear = useDesk((s) => s.clear);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<string | null>(null);
  const [contract, setContract] = useState("m028a47.mtrfc658fd1.testnet");
  const [signed, setSigned] = useState("m2b2440.mtrfc658fd1.testnet");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    setTab(readTab());
    fetch("/chain.json")
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (body?.contract) setContract(body.contract);
      })
      .catch(() => undefined);
    fetch("/tee.json")
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (body?.contract) setSigned(body.contract);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
    } catch {
      setCopied("");
    }
  }

  function reset() {
    clear();
    try {
      localStorage.removeItem("meter-desk");
      sessionStorage.removeItem(TAB);
    } catch {
      /* this tab only */
    }
    window.location.href = "/";
  }

  return (
    <div className={place === "top" ? "who who-top" : "who"}>
      <button className="who-btn" type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)}>
        <Logo word={false} />
        <span>
          <b>{tab ? short(tab) : "This browser"}</b>
          <small>{tab ? "Tab name" : "No chain key"}</small>
        </span>
      </button>
      {open && (
        <div className="who-panel" id={panelId} role="region" aria-label="This browser">
          <p className="kicker"><span>This browser</span><button className="text-btn" type="button" onClick={() => setOpen(false)}>Close</button></p>
          <p className="who-id mono">{tab ? short(tab) : "Not named"}</p>
          <p className="note">A name for this tab. It cannot sign, and it is not a NEAR account.</p>
          {tab && (
            <button className="ghost" type="button" onClick={() => copy(tab)}>{copied === tab ? "Copied" : "Copy tab name"}</button>
          )}
          <dl className="who-facts">
            <div>
              <dt>Network</dt>
              <dd>testnet</dd>
            </div>
            <div>
              <dt>Payment record</dt>
              <dd className="mono" title={contract}>
                {contract.split(".").map((part, index, parts) => (
                  <span key={`${part}-${index}`}>{part}{index < parts.length - 1 ? <>.<wbr /></> : null}</span>
                ))}
              </dd>
            </div>
            <div>
              <dt>Signed release</dt>
              <dd className="mono" title={signed}>
                {signed.split(".").map((part, index, parts) => (
                  <span key={`${part}-${index}`}>{part}{index < parts.length - 1 ? <>.<wbr /></> : null}</span>
                ))}
              </dd>
            </div>
          </dl>
          <p className="who-links">
            <button className="text-btn" type="button" onClick={() => copy(contract)}>{copied === contract ? "Copied" : "Copy record"}</button>
            <a href={`https://testnet.nearblocks.io/address/${contract}`}>Record</a>
          </p>
          <p className="who-links">
            <button className="text-btn" type="button" onClick={() => copy(signed)}>{copied === signed ? "Copied" : "Copy release"}</button>
            <a href={`https://testnet.nearblocks.io/address/${signed}`}>Release</a>
          </p>
          <p className="note">Slips in this browser stay on this machine. The paying key on each contract was deleted. Nothing here is sent to a Meter server.</p>
          <button className="ghost" type="button" onClick={reset}>Clear this browser</button>
        </div>
      )}
    </div>
  );
}
