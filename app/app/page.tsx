"use client";


import Link from "next/link";
import { LinePreview } from "@/components/LinePreview";
import { SectionHead } from "@/components/SectionHead";
import { SiteNav } from "@/components/SiteNav";
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

function ProofCell({ label, amount, code, hash }: { label: string; amount?: string; code: string; hash?: string | null }) {
  const moved = Number(amount ?? "0");
  const tone = code.startsWith("ERR_") || code === "AccessKeyDoesNotExist" ? "refused" : code === "OK" && moved > 0 ? "paid" : "neutral";
  return (
    <div data-tone={tone}>
      <span>{label}</span>
      <b>{formatUnits(amount ?? "0")}<small> tUSDC</small></b>
      <a className="mono proof-link" href={hash ? txUrl(hash) : "/book"}>
        {code}
        {hash ? <small className="proof-hash">{shortHash(hash)}</small> : null}
      </a>
    </div>
  );
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
  const signed = useReceipt("/tee.json");
  const timed = useReceipt("/v2.json");
  const signedSteps = signed.receipt?.steps ?? [];
  const signedWhen = signed.receipt ? recordedAt(signed.receipt.at) : "the signed release";
  const steps = receipt?.steps ?? [];
  const refused = steps.find((step) => step.code === "ERR_RECIPIENT");
  const paid = steps.find((step) => step.code === "OK" && /paid/i.test(step.label));
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
        <p className="eyebrow"><i data-hue="teal" />NEAR testnet</p>
        <Headline />
        <p className="thesis">Meter enforces the stored line. It does not judge the work.</p>
        <p className="market-lead">
          The parties choose the time, and the contract enforces stored time ≤ block time &lt; deadline. The token is testnet, not Circle USDC.
        </p>
        <div className="market-actions">
          <Link className="btn" href="/sign-in">Open the desk</Link>
          <Link className="ghost" href="/book">See the proof</Link>
        </div>
        <figure className="stage preview">
          <div className="stage-chrome">
            <b>Time gate</b>
            <span className="mono break" title={timed.receipt?.contract ?? "m1870dd.mtrfc658fd1.testnet"}>{timed.receipt?.contract ?? "m1870dd.mtrfc658fd1.testnet"}</span>
            <span className="tag" data-kind="neutral">NEAR testnet</span>
          </div>
          {timed.state === "loading" && <p className="note preview-state">Reading the time gate.</p>}
          {timed.state === "error" && (
            <p className="alert preview-state" role="alert">
              The time gate did not load. The desk can still open.
              <button className="text-btn" type="button" onClick={timed.reload}>Try again</button>
            </p>
          )}
          {timed.state === "empty" && <p className="note preview-state">No time gate in this build. The desk can still open.</p>}
          {timed.state === "ready" && tooEarly && unregistered && timedPaid && (
            <div className="market-proof">
              <ProofCell label="Before the time" amount={tooEarly.moved} code={tooEarly.code} hash={tooEarly.hash} />
              <ProofCell label="Unregistered" amount={unregistered.moved} code={unregistered.code} hash={unregistered.hash} />
              <ProofCell label="After the time" amount={timedPaid.moved} code={timedPaid.code} hash={timedPaid.hash} />
            </div>
          )}
          <figcaption>The time gate on NEAR testnet. Before the stored time, 0.00 moved. After it, the same line paid 48.00.</figcaption>
        </figure>
        <section className="pitch-section" id="try">
          <SectionHead hue="orange" eyebrow="Same rule, this browser" title="Try the refusal" />
          <p className="hero-note">The sealed line is 48.00 to sable.testnet. This clock pays only while 400 ≤ time &lt; 1000. Choose Before the time. The answer comes from <span className="mono">app/lib/rule.mjs</span>. Nothing on this page is a transaction.</p>
          <LinePreview />
        </section>
        {state === "loading" && <p className="note">Reading the payment record.</p>}
        {state === "error" && (
          <p className="alert" role="alert">
            The payment record did not load. The desk can still open.
            <button className="text-btn" type="button" onClick={reload}>Try again</button>
          </p>
        )}
        {state === "empty" && <p className="note">No payment record in this build. The desk can still open.</p>}
        {state === "ready" && receipt && refused && paid && (
          <div className="market-follow">
            <div className="stage">
              <p className="proof-caption">The older contracts prove the same rule with different guards: a wrong recipient moved 0.00, and the sealed line paid 48.00.</p>
              <div className="market-proof">
                <ProofCell label="Wrong account" amount={refused.moved} code={refused.code} hash={refused.hash} />
                <ProofCell label="Sealed line" amount={paid.moved} code={paid.code} hash={paid.hash} />
                <div data-tone="neutral">
                  <span>Recorded</span>
                  <b className="market-when">{when}</b>
                  <span>One receipt, not a clock on each line</span>
                </div>
              </div>
            </div>
          </div>
        )}
        {state === "ready" && <p className="pitch-consequence">A different account was named. 0.00 moved. The sealed line paid 48.00.</p>}

        <section className="pitch-section" id="problem">
          <SectionHead hue="teal" eyebrow="Example slip" title="The sheet" />
          <div className="split">
            <article className="panel">
              <p className="kicker"><span>Example slip</span><span>Moves nothing</span></p>
              <p className="amount">48.00<span>USDC</span></p>
              <div className="parties">
                <div className="party"><small>Buyer</small><b>Marlow Studio</b></div>
                <div className="party"><small>Vendor</small><b>Sable Field</b></div>
              </div>
              <div className="line">
                <div>
                  <b>Field report 04</b>
                  <small>Price column at most 100</small>
                </div>
                <code className="ellipsis">sable.testnet</code>
                <b className="mono">48.00</b>
              </div>
              <p className="note">Ceiling 60.00 and floor 48.00 stay off this sheet. That overlap is computed in this browser and moves no tokens.</p>
            </article>
            <aside className="panel">
              <h3>The account stays sealed</h3>
              <p>No method can swap the recipient after the meter opens. If the sealed account is wrong, the buyer waits for the deadline and the balance comes back.</p>
              <p className="note">On {when}, the run named <span className="mono">other.testnet</span>. The contract recorded <span className="mono">ERR_RECIPIENT</span> and moved 0.00.</p>
            </aside>
          </div>
        </section>

        <section className="pitch-section" id="rule">
          <SectionHead hue="orange" eyebrow="Four checks" title="The rule" />
          <div className="stage">
            <div className="market-proof checks">
              <div data-tone="neutral" data-hue="teal"><span>Recipient</span><b>Sealed</b><small>Another account moves 0.00</small></div>
              <div data-tone="neutral" data-hue="orange"><span>Amount</span><b>48.00</b><small>47.00 does not replace it</small></div>
              <div data-tone="neutral" data-hue="purple"><span>Evidence</span><b>The sentence</b><small>A rewrite moves 0.00</small></div>
              <div data-tone="neutral" data-hue="cyan"><span>Time</span><b>The window</b><small>stored time ≤ block time &lt; deadline</small></div>
            </div>
          </div>
          <p className="hero-note">One nanosecond before the deadline still clears. At the deadline the call is <span className="mono">ERR_TOO_LATE</span>. The unit test is <span className="mono break">one_nanosecond_before_the_deadline_clears_and_the_deadline_does_not</span>. <span className="mono">release</span> can call nothing else. There is no method that edits the line after open.</p>
        </section>

        <section className="pitch-section" id="run">
          <SectionHead hue="cyan" eyebrow="Payment record" title="The run" />
          <div className="stage">
            <div className="stage-chrome">
              <b>Payment record</b>
              <span className="mono break">{receipt?.contract ?? "m028a47.mtrfc658fd1.testnet"}</span>
              <span className="tag" data-kind="neutral">{when}</span>
            </div>
            {state === "ready" && steps.length > 0 ? <Ledger steps={steps} /> : (
              <p className="note">{state === "error" ? "The run stays hidden until the receipt loads." : "Reading the lines from the receipt."}</p>
            )}
          </div>
        </section>

        <section className="pitch-section" id="signed">
          <SectionHead hue="purple" eyebrow="Not the run above" title="The signed release" />
          <div className="stage">
            <div className="stage-chrome">
              <b>{signed.receipt?.model ?? "z-ai/glm-5.3-flash"}</b>
              <span className="mono break">{signed.receipt?.contract ?? "m2b2440.mtrfc658fd1.testnet"}</span>
              <span className="tag" data-kind="neutral">{signedWhen}</span>
            </div>
            {signed.state === "ready" && signedSteps.length > 0 ? <Ledger steps={signedSteps} /> : (
              <p className="note">{signed.state === "error" ? "The signed release stays hidden until that receipt loads." : "Reading the signed release."}</p>
            )}
          </div>
          <p className="hero-note">The Intel quote was not checked. A matching signature pays as soon as the meter is funded. Deleting the key loses if that payment lands first. This is not the run above.</p>
          {signed.state === "error" && <button className="text-btn" type="button" onClick={signed.reload}>Try again</button>}
        </section>

        <section className="pitch-section" id="time">
          <SectionHead hue="teal" eyebrow="Stored time" title="The time gate" />
          <div className="facts">
            <div><span>The window</span><b>One nanosecond</b><small>Before the deadline still clears</small></div>
            <div><span>Refund</span><b>Two records</b><small>On chain for the older meter. Unit-tested here.</small></div>
            <div><span>Earlier account</span><b>m718aa2</b><small>That one still keeps a late deposit</small></div>
            <div><span>The clock</span><b>Not the work</b><small>Accept is not a method</small></div>
          </div>
          <div className="stage">
            <div className="stage-chrome">
              <b>Every step</b>
              <span className="mono break">{timed.receipt?.contract ?? "m1870dd.mtrfc658fd1.testnet"}</span>
              <span className="tag" data-kind="neutral">{timedWhen}</span>
            </div>
            {timed.state === "ready" && timedSteps.length > 0 ? <Ledger steps={timedSteps} /> : (
              <p className="note">{timed.state === "error" ? "The time gate stays hidden until that receipt loads." : "Reading the time gate."}</p>
            )}
          </div>
          <p className="hero-note">Paid is set only after the token transfer succeeds. The recipient was unregistered, so the first release after the time moved 0.00. Once the stored time has arrived, the key can pay immediately, and a delete loses if that payment lands first.</p>
          {timed.state === "error" && <button className="text-btn" type="button" onClick={timed.reload}>Try again</button>}
        </section>

        <section className="pitch-section" id="compare">
          <SectionHead hue="yellow" eyebrow="Against a transfer" title="A transfer, and this run" wide />
          <div className="pitch-scroll">
            <table className="pitch-table">
              <caption>A normal transfer pays the account named at send time. Recorded {when}.</caption>
              <thead>
                <tr>
                  <th>What was attempted</th>
                  <th>A transfer</th>
                  <th>This run</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>other.testnet, 48.00</th>
                  <td>Pays the account named then</td>
                  <td><span className="mono">0.00</span> <span className="mono">ERR_RECIPIENT</span>. Which means the wrong account was paid nothing.</td>
                </tr>
                <tr>
                  <th>47.00 instead of 48.00</th>
                  <td>The caller picks a new figure</td>
                  <td><span className="mono">0.00</span> <span className="mono">ERR_AMOUNT</span>. Which means 47.00 did not replace 48.00.</td>
                </tr>
                <tr>
                  <th>Evidence hash changed</th>
                  <td>A memo does not hold the money</td>
                  <td><span className="mono">0.00</span> <span className="mono">ERR_EVIDENCE</span>. Which means the rewritten sentence was paid nothing.</td>
                </tr>
                <tr>
                  <th>Same key after delete</th>
                  <td>A live key can sign again</td>
                  <td>Rejected before a transaction. Which means a deleted key cannot spend.</td>
                </tr>
                <tr>
                  <th>After the deadline</th>
                  <td>The balance sits</td>
                  <td><span className="mono">48.00</span> back to the buyer. Which means the lock ended.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="pitch-section" id="proof">
          <SectionHead hue="green" eyebrow="On testnet" title="Proof" />
          <div className="proof-links">
            <a href={receipt ? `https://testnet.nearblocks.io/address/${receipt.contract}` : "https://testnet.nearblocks.io/address/m028a47.mtrfc658fd1.testnet"}>
              <span>Payment record</span>
              <b className="mono break">{receipt?.contract ?? "m028a47.mtrfc658fd1.testnet"}</b>
            </a>
            <a href={signed.receipt ? `https://testnet.nearblocks.io/address/${signed.receipt.contract}` : "https://testnet.nearblocks.io/address/m2b2440.mtrfc658fd1.testnet"}>
              <span>Signed release</span>
              <b className="mono break">{signed.receipt?.contract ?? "m2b2440.mtrfc658fd1.testnet"}</b>
            </a>
            <a href={timed.receipt ? `https://testnet.nearblocks.io/address/${timed.receipt.contract}` : "https://testnet.nearblocks.io/address/m1870dd.mtrfc658fd1.testnet"}>
              <span>Time gate</span>
              <b className="mono break">{timed.receipt?.contract ?? "m1870dd.mtrfc658fd1.testnet"}</b>
            </a>
            <Link href="/book"><span>The book</span><b>All three, and a CSV</b></Link>
            <Link href="/clause"><span>The preview</span><b>Try a refusal</b></Link>
          </div>
          <p className="hero-note"><span className="mono">node chain/verify.mjs</span> re-reads all three. No key. The figures above are those files.</p>
        </section>

        <section className="pitch-section" id="not">
          <SectionHead hue="yellow" eyebrow="Limits" title="What this is not" />
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
              <dd>No Meter server holds a signer. The function-call key was deleted. The name in the sidebar is a tab id.</dd>
            </div>
          </dl>
        </section>

        <section className="pitch-section" id="sources">
          <SectionHead hue="teal" eyebrow="Files" title="Sources" />
          <ul className="source-list">
            <li><span className="mono">app/public/chain.json</span> · {when}</li>
            <li><span className="mono">app/public/tee.json</span> · {signedWhen} · the Intel quote was not checked</li>
            <li><span className="mono">app/public/v2.json</span> · {timedWhen} · the time is not the work</li>
            <li>Marlow and Sable, ceiling 60.00 and floor 48.00, are example copy. They are not the chain balance.</li>
          </ul>
        </section>

        <p className="pitch-close">A transfer pays whoever is named when it is sent. The sealed line is paid, or nothing moves. On the time gate, that payment also waits for the stored time.</p>
      </main>
    </div>
  );
}
