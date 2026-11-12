"use client";


import Link from "next/link";
import { FaqSection } from "@/components/FaqSection";
import { FailureMap } from "@/components/home/FailureMap";
import { FramePreview } from "@/components/home/FramePreview";
import { HijackScene } from "@/components/home/HijackScene";
import { SourceDeck } from "@/components/home/SourceDeck";
import { StepRail } from "@/components/home/StepRail";
import { Tripwire } from "@/components/home/Tripwire";
import { LinePreview } from "@/components/LinePreview";
import { NearMark } from "@/components/NearMark";
import { ReceiptGate } from "@/components/ReceiptGate";
import { SiteFooter } from "@/components/SiteFooter";
import { SectionHead } from "@/components/SectionHead";
import { SiteNav } from "@/components/SiteNav";
import { attackById } from "@/lib/hijack";
import { useInject } from "@/lib/useInject";
import { formatUnits, txUrl, useReceipt, type Step } from "@/lib/useReceipt";

function recordedAt(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

function shortHash(hash: string) {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

function kindOf(step: Step) {
  if (step.code.startsWith("ERR_") || step.code === "AccessKeyDoesNotExist") return "refused";
  if (/return/i.test(step.label)) return "back";
  if (step.code === "OK" && Number(step.moved) > 0) return "paid";
  return "neutral";
}

function Ledger({ steps }: { steps: Step[] }) {
  return (
    <ol className="ledger">
      {steps.map((step) => (
        <li key={`${step.code}-${step.hash ?? step.label}`}>
          <b>{step.label}</b>
          <span className="tag" data-kind={kindOf(step)}>{step.code}</span>
          <span className="mono">{formatUnits(step.moved ?? "0")}</span>
          {step.hash ? <a className="mono" href={txUrl(step.hash)} title={step.hash}>{shortHash(step.hash)}</a> : <span className="muted">No transaction</span>}
        </li>
      ))}
    </ol>
  );
}

const HEADLINE = ["One", "sealed", "price.", "The", "contract", "pays", "that", "line,", "or", "it", "pays", "nothing."];

function Headline() {
  return (
    <h1 className="hero-title">
      <span className="sr-only">One sealed price. The contract pays that line, or it pays nothing.</span>
      <span aria-hidden="true">
        {HEADLINE.map((word, index) => (
          <span key={`${word}-${index}`}>
            <span className="word" style={{ ["--i" as string]: index }}>{word}</span>
            {word === "price." ? <br /> : index < HEADLINE.length - 1 ? " " : null}
          </span>
        ))}
      </span>
    </h1>
  );
}

export default function HomePage() {
  const { state, receipt, reload } = useReceipt();
  const inject = useInject();
  const meterOne = inject.receipt ? attackById(inject.receipt, 1) : null;
  const signed = useReceipt("/tee.json");
  const timed = useReceipt("/v2.json");
  const signedSteps = signed.receipt?.steps ?? [];
  const signedWhen = signed.receipt ? recordedAt(signed.receipt.at) : "the signed release";
  const steps = receipt?.steps ?? [];
  const when = receipt ? recordedAt(receipt.at) : "the recorded run";
  const timedSteps = timed.receipt?.steps ?? [];
  const tooEarly = timedSteps.find((step) => step.code === "ERR_NOT_YET");
  const unregistered = timedSteps.find((step) => step.code === "ERR_TRANSFER");
  const timedPaid = timedSteps.find((step) => step.code === "OK" && /paid/i.test(step.label));
  const timedWhen = timed.receipt ? recordedAt(timed.receipt.at) : "the time gate";

  return (
    <div className="market">
      <SiteNav />
      <main id="content" className="market-main pitch">
        <p className="eyebrow"><span className="lamp" aria-hidden="true" />Built on <NearMark variant="lockup" /></p>
        <Headline />
        <p className="thesis">Meter enforces the stored line. It does not judge the work.</p>
        <p className="market-lead">
          The parties choose the time, and the contract enforces stored time ≤ block time &lt; deadline. The token is testnet, not Circle USDC.
        </p>
        <div className="market-actions">
          <a className="btn" href="#hijack">See the hijack</a>
          <a className="ghost" href="#try">Try the refusal</a>
        </div>
        <ReceiptGate state={inject.state} onRetry={inject.reload} empty="No hijack receipt on this build.">
          {inject.receipt?.baseline && meterOne ? (
            <div className="stats" aria-label="Hijack result">
              <div className="stat">
                <span>Agent obeyed</span>
                <b>{inject.receipt.baseline.obeyed}/{inject.receipt.baseline.runs}</b>
                <small>Same poisoned invoice</small>
              </div>
              <div className="stat">
                <span>Naive key lost</span>
                <b>{formatUnits(inject.receipt.baseline.moneyMoved ?? "0")}</b>
                <small>PAID to {inject.receipt.attacker}</small>
              </div>
              <div className="stat">
                <span>Meter moved</span>
                <b>{formatUnits(meterOne.moneyMoved ?? "0")}</b>
                <small>STOPPED · {meterOne.expected || "refusal"}</small>
              </div>
            </div>
          ) : null}
        </ReceiptGate>
        <section id="hijack" className="pitch-section">
          <ReceiptGate state={inject.state} onRetry={inject.reload} empty="No hijack receipt on this build. node chain/inject.mjs records one.">
            {inject.receipt ? <HijackScene receipt={inject.receipt} /> : null}
          </ReceiptGate>
        </section>
        <StepRail />
        {inject.receipt ? <Tripwire receipt={inject.receipt} /> : null}
        <section className="pitch-section pitch-try" id="try">
          <SectionHead hue="orange" icon="line" eyebrow="Same rule, this browser" title="Try the refusal" />
          <p className="hero-note">The sealed line is 48.00 to sable.testnet. This clock pays only while 400 ≤ time &lt; 1000. Tap <strong>Before the time</strong>. The answer comes from <span className="mono">app/lib/rule.mjs</span>. Nothing on this page is a transaction.</p>
          <LinePreview />
        </section>
        <FailureMap />
        <section className="craft-tape" id="run">
          <header className="craft-intro">
            <p className="craft-eyebrow">Receipts</p>
            <h2>The older runs, each on its own.</h2>
            <p className="craft-lead">The hijack record is <Link href="/attack">the list of calls</Link>.</p>
          </header>
          <FramePreview state={state} receipt={receipt} onRetry={reload} />
          <header className="craft-intro">
            <p className="craft-eyebrow">Previous build · Payment record</p>
            <h2>Every line of the recorded run.</h2>
            {state === "ready" && receipt ? <p className="mono craft-lead">{receipt.contract} · {when}</p> : null}
          </header>
          {state === "ready" && steps.length > 0 ? <Ledger steps={steps} /> : (
            <p className="note">{state === "error" ? "The run stays hidden until the receipt loads." : state === "empty" ? "No payment record in this build." : "Reading the lines from the receipt."}</p>
          )}
          {state === "error" && <button className="text-btn" type="button" onClick={reload}>Try again</button>}
        </section>
        <section className="craft-time" id="time">
          <header className="craft-intro">
            <p className="craft-eyebrow">Previous build · Stored time</p>
            <h2>The clock is not the work.</h2>
            <p className="craft-lead">On this build, install_agent rejects a revoked meter. The hijack account clears the counter and installs a new key.</p>
            {timed.state === "ready" && timed.receipt ? <p className="craft-lead">{timed.receipt.contract} · {timedWhen}. One nanosecond before the deadline still clears.</p> : null}
          </header>
          {timed.state === "loading" && <p className="note">Reading the time gate.</p>}
          {timed.state === "empty" && <p className="note">No time gate in this build.</p>}
          {timed.state === "error" && (
            <p className="alert" role="alert">The time gate did not load. <button className="text-btn" type="button" onClick={timed.reload}>Try again</button></p>
          )}
          {timed.state === "ready" && (
            <ol className="craft-spine">
              {[tooEarly, unregistered, timedPaid].filter(Boolean).map((step) => step && (
                <li key={step.code + (step.hash ?? "")}>
                  <b>{step.label}</b>
                  <span className="mono">{formatUnits(step.moved ?? "0")} · {step.code}</span>
                  {step.hash ? <a className="mono" href={txUrl(step.hash)}>{shortHash(step.hash)}</a> : <span>No transaction</span>}
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="xfer" id="compare">
          <header className="craft-intro">
            <p className="craft-eyebrow">Against a transfer</p>
            <h2>A transfer, and this run.</h2>
            {state === "ready" ? <p className="craft-lead">A normal transfer pays the account named at send time. Recorded {when}.</p> : null}
          </header>
          <ol>
            <li>
              <b>other.testnet, 48.00</b>
              <div>
                <span><small>A transfer</small>Pays the account named then</span>
                <span><small>This run</small><em>0.00</em> <span className="mono">ERR_RECIPIENT</span>. Which means the wrong account was paid nothing.</span>
              </div>
            </li>
            <li>
              <b>47.00 instead of 48.00</b>
              <div>
                <span><small>A transfer</small>The caller picks a new figure</span>
                <span><small>This run</small><em>0.00</em> <span className="mono">ERR_AMOUNT</span>. Which means 47.00 did not replace 48.00.</span>
              </div>
            </li>
            <li>
              <b>The terms line changed</b>
              <div>
                <span><small>A transfer</small>A memo does not hold the money</span>
                <span><small>This run</small><em>0.00</em> <span className="mono">ERR_EVIDENCE</span>. Which means the rewritten sentence was paid nothing.</span>
              </div>
            </li>
            <li>
              <b>Same key after delete</b>
              <div>
                <span><small>A transfer</small>A live key can sign again</span>
                <span><small>This run</small>Rejected before a transaction. Which means a deleted key cannot spend.</span>
              </div>
            </li>
            <li>
              <b>After the deadline</b>
              <div>
                <span><small>A transfer</small>The balance sits</span>
                <span><small>This run</small><em>48.00</em> back to the buyer. Which means the lock ended.</span>
              </div>
            </li>
          </ol>
        </section>
        <blockquote className="craft-quote" id="signed">
          <p>Previous build. The Intel quote was not checked. A matching signature pays as soon as the meter is funded. Deleting the key loses if that payment lands first.</p>
          <footer>
            <span className="mono">{signed.state === "ready" ? signed.receipt?.model : "Reading the signed release."}</span>
            {signed.receipt?.contract ? <span className="mono break">{signed.receipt.contract}</span> : null}
            {signed.state === "ready" ? <span>{signedWhen}</span> : null}
          </footer>
          {signed.state === "ready" && signedSteps.length > 0 ? <Ledger steps={signedSteps} /> : (
            <p className="note">{signed.state === "error" ? "The signed release stays hidden until that receipt loads." : signed.state === "empty" ? "No signed release in this build." : "Reading the signed release."}</p>
          )}
          {signed.state === "error" && <button className="text-btn" type="button" onClick={signed.reload}>Try again</button>}
        </blockquote>
        <section id="audience" className="craft-who">
          <header className="craft-intro">
            <p className="craft-eyebrow">Who it is for</p>
            <h2>Two companies. One stored line.</h2>
          </header>
          <ol>
            <li><b>The buyer</b><span>Marlow Studio will not pay a different account. other.testnet moved 0.00.</span></li>
            <li><b>The vendor</b><span>Sable Field is paid 48.00, or nothing. 47.00 does not replace the line.</span></li>
            <li><b>The person with the key</b><span>They can repeat the public line immediately. They cannot edit it.</span></li>
          </ol>
        </section>
        <section className="proof-stage" id="proof">
          <header className="craft-intro">
            <p className="craft-eyebrow">On testnet</p>
            <h2>Proof</h2>
          </header>
          <div>
            <div className="proof-panel">
              {receipt?.contract ? (
                <a href={`https://testnet.nearblocks.io/address/${receipt.contract}`}>
                  <span>Payment record</span>
                  <b className="mono break">{receipt.contract}</b>
                </a>
              ) : <p><span>Payment record</span><b>Reading the receipt.</b></p>}
              {signed.receipt?.contract ? (
                <a href={`https://testnet.nearblocks.io/address/${signed.receipt.contract}`}>
                  <span>Signed release</span>
                  <b className="mono break">{signed.receipt.contract}</b>
                </a>
              ) : <p><span>Signed release</span><b>{signed.state === "error" ? "The receipt did not load." : "Reading the receipt."}</b></p>}
              {timed.receipt?.contract ? (
                <a href={`https://testnet.nearblocks.io/address/${timed.receipt.contract}`}>
                  <span>Time gate</span>
                  <b className="mono break">{timed.receipt.contract}</b>
                </a>
              ) : <p><span>Time gate</span><b>{timed.state === "error" ? "The receipt did not load." : "Reading the receipt."}</b></p>}
            </div>
            <div className="proof-panel proof-panel-alt">
              <Link href="/book"><span>The book</span><b>All three, and a CSV</b></Link>
              <Link href="/clause"><span>The preview</span><b>Try a refusal</b></Link>
              <p><span className="mono">node chain/verify.mjs</span> re-reads the recorded contracts, including the hijack. No key. The figures above are those files.</p>
            </div>
          </div>
        </section>

        <section className="limit-band" id="not">
          <header className="craft-intro">
            <p className="craft-eyebrow">Limits</p>
            <h2>What this is not</h2>
          </header>
          <dl className="not-list">
            <div>
              <dt>This is just a dashboard.</dt>
              <dd>The 0.00 row is a testnet transaction. The hash is on the run above.</dd>
            </div>
            <div>
              <dt>The page decides the payment.</dt>
              <dd>A Clears mark has no hash and moves nothing. A Paid figure is a receipt step with a hash. Editing browser storage cannot create one.</dd>
            </div>
            <div>
              <dt>The key can pay anyone.</dt>
              <dd>It can call <span className="mono">release</span> only. 0.50 NEAR, for gas. Five refusals delete it. Once the stored time has arrived, a delete loses if the payment lands first.</dd>
            </div>
            <div>
              <dt>The time proves the work.</dt>
              <dd>The stored time is a clock, not the field report. A deposit at or after the deadline is rejected. m718aa2 still keeps a late deposit.</dd>
            </div>
            <div>
              <dt>The signature checks the work.</dt>
              <dd>The model repeated a line this repo wrote. The Intel quote was not checked. A matching signature pays as soon as the meter is funded.</dd>
            </div>
            <div>
              <dt>This is Circle USDC on mainnet.</dt>
              <dd>The token is <span className="mono">token.mtrfc658fd1.testnet</span>. Mainnet waits on an audit. The contract has no owner withdraw.</dd>
            </div>
            <div>
              <dt>A server holds the key.</dt>
              <dd>No Meter server holds a signer. The function-call key was deleted. The name in the sidebar is a tab id. The agent can be hijacked. Meter&apos;s claim is that a hijack does not move money.</dd>
            </div>
          </dl>
        </section>

        <SourceDeck />

        <section className="file-strip" id="sources">
          <header className="craft-intro">
            <p className="craft-eyebrow">Files</p>
            <h2>Sources</h2>
          </header>
          <ul className="source-list">
            <li><span className="mono">app/public/chain.json</span> · {when}</li>
            <li><span className="mono">app/public/tee.json</span> · {signedWhen} · the Intel quote was not checked</li>
            <li><span className="mono">app/public/v2.json</span> · {timedWhen} · the time is not the work</li>
            <li>Marlow and Sable, ceiling 60.00 and floor 48.00, are example copy. They are not the chain balance.</li>
          </ul>
        </section>

        <FaqSection />
        <SiteFooter />
      </main>
    </div>
  );
}
