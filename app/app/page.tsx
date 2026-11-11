"use client";

import Link from "next/link";
import { Logo } from "@/components/Logo";
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

function readOf(step: Step) {
  if (step.code === "ERR_RECIPIENT") return "Recipient other.testnet. Amount 48.00. The sealed sentence.";
  if (step.code === "ERR_AMOUNT") return "Recipient the sealed vendor. Amount 47.00. The sealed sentence.";
  if (step.code === "ERR_EVIDENCE") return "Recipient the sealed vendor. Amount 48.00. An evidence hash that does not match.";
  if (step.code === "ERR_TOO_LATE") return "The sealed vendor and 48.00, after the deadline.";
  if (step.code === "AccessKeyDoesNotExist") return "The same key and the same sealed line, after the delete.";
  if (/paid/i.test(step.label)) return "Recipient the sealed vendor. Amount 48.00. The sealed sentence. Before the deadline.";
  if (/return/i.test(step.label)) return "The second meter paid nothing. The deadline had passed.";
  if (/agent key/i.test(step.label)) return "The buyer removed the key that can call release.";
  if (/deadline key/i.test(step.label)) return "The buyer removed the key used on the refund meter.";
  return step.label;
}

function means(step: Step) {
  if (step.code === "ERR_RECIPIENT") return "Which means the wrong account was paid nothing.";
  if (step.code === "ERR_AMOUNT") return "Which means 47.00 did not replace the sealed 48.00.";
  if (step.code === "ERR_EVIDENCE") return "Which means a rewritten sentence was paid nothing.";
  if (step.code === "ERR_TOO_LATE") return "Which means the deadline closed the payment.";
  if (step.code === "AccessKeyDoesNotExist") return "Which means a deleted key cannot spend.";
  if (/paid/i.test(step.label) && step.code === "OK") return "Which means the sealed vendor received 48.00.";
  if (/return/i.test(step.label)) return "Which means the buyer got the locked 48.00 back.";
  if (/deleted/i.test(step.label)) return "Which means that key can no longer sign.";
  return "Which means this line is in the recorded run.";
}

function signedRead(step: Step) {
  if (step.code === "ERR_ATTEST_LINE") return "Recipient the sealed vendor. Amount 48.00. The sealed sentence. The request and the response were {\"ok\":true}.";
  if (/paid/i.test(step.label)) return "The same line, with the provider_tee signature over the request and response that contain it.";
  if (/deleted/i.test(step.label)) return "The buyer removed the key that can call release.";
  return step.label;
}

function signedMeans(step: Step) {
  if (step.code === "ERR_ATTEST_LINE") return "Which means a body that does not contain the release line was paid nothing.";
  if (/paid/i.test(step.label) && step.code === "OK") return "Which means the sealed vendor received 48.00.";
  if (/deleted/i.test(step.label)) return "Which means that key can no longer sign.";
  return "Which means this line is on the signed release.";
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
      <header className="market-bar">
        <Logo />
        <nav className="market-nav" aria-label="Argument">
          <a href="#problem">The problem</a>
          <a href="#rule">The rule</a>
          <a href="#run">The run</a>
          <a href="#signed">Signed release</a>
          <a href="#time">Time gate</a>
          <a href="#not">What this is not</a>
          <Link className="btn" href="/sign-in">Open the desk</Link>
        </nav>
      </header>
      <main className="market-main pitch">
        <p className="kicker"><span>NEAR testnet</span><span>Not Circle USDC</span></p>
        <h1>One sealed price. The contract pays that line, or it pays nothing.</h1>
        <p className="market-lead">
          A buyer locks testnet tUSDC against one recipient, one amount, and one sentence. The contract pays that line once. A different account, figure, or sentence moves 0.00. On the time-gate contract, a release before the stored time also moves 0.00.
        </p>
        <div className="market-actions">
          <Link className="btn" href="/sign-in">Open the desk</Link>
          <Link className="ghost" href="/book">See the proof</Link>
        </div>

        {state === "loading" && <p className="note">Reading the testnet receipt.</p>}
        {state === "error" && (
          <p className="alert" role="alert">
            The testnet receipt did not load. The desk can still open.
            <button className="text-btn" type="button" onClick={reload}>Try again</button>
          </p>
        )}
        {state === "empty" && <p className="note">No recorded run in this build. The desk can still open.</p>}
        {state === "ready" && receipt && refused && paid && (
          <div className="market-proof">
            <div>
              <span>Wrong account</span>
              <b>{formatUnits(refused.moved ?? "0")}<small> tUSDC</small></b>
              <a className="mono" href={refused.hash ? txUrl(refused.hash) : "/book"}>{refused.code}</a>
            </div>
            <div>
              <span>Sealed line</span>
              <b>{formatUnits(paid.moved ?? "0")}<small> tUSDC</small></b>
              <a className="mono" href={paid.hash ? txUrl(paid.hash) : "/book"}>{paid.code}</a>
            </div>
            <div>
              <span>Recorded</span>
              <b className="market-when">{when}</b>
              <span>One receipt, not a clock on each line</span>
            </div>
          </div>
        )}
        {state === "ready" && <p className="pitch-consequence">A different account was named. 0.00 moved. The sealed line paid 48.00.</p>}
        {timed.state === "ready" && timed.receipt && tooEarly && unregistered && timedPaid && (
          <>
            <div className="market-proof">
              <div>
                <span>Before the time</span>
                <b>{formatUnits(tooEarly.moved ?? "0")}<small> tUSDC</small></b>
                <a className="mono" href={tooEarly.hash ? txUrl(tooEarly.hash) : "/book"}>{tooEarly.code}</a>
              </div>
              <div>
                <span>Unregistered</span>
                <b>{formatUnits(unregistered.moved ?? "0")}<small> tUSDC</small></b>
                <a className="mono" href={unregistered.hash ? txUrl(unregistered.hash) : "/book"}>{unregistered.code}</a>
              </div>
              <div>
                <span>After the time</span>
                <b>{formatUnits(timedPaid.moved ?? "0")}<small> tUSDC</small></b>
                <a className="mono" href={timedPaid.hash ? txUrl(timedPaid.hash) : "/book"}>{timedPaid.code}</a>
              </div>
            </div>
            <p className="pitch-consequence">Before the stored time, 0.00 moved. The unregistered account stayed unpaid. The same line then paid 48.00.</p>
          </>
        )}

        <section className="pitch-section" id="problem">
          <h2>The problem</h2>
          <p>
            Marlow Studio and Sable Field are example names on the desk. Marlow will not pay more than 60.00. Sable will not accept less than 48.00. The sheet keeps 48.00. That overlap is computed in this browser, and it moves no tokens.
          </p>
          <p>
            The loss is the locked 48.00. On {when}, source <span className="mono">app/public/chain.json</span>, the run named <span className="mono">other.testnet</span> instead of the sealed vendor. The contract recorded <span className="mono">ERR_RECIPIENT</span> and moved 0.00.
          </p>
        </section>

        <section className="pitch-section" id="rule">
          <h2>The rule</h2>
          <p>
            <span className="mono">release</span> checks the recipient, the amount, the evidence hash, and the deadline. There is no method that edits those fields after the meter is opened. The paying key can call <span className="mono">release</span> and nothing else. Its allowance is 0.50 NEAR, for gas. A failed check is stored. The balance stays.
          </p>
          <div className="pitch-split">
            <div className="panel">
              <h3>Where the money is decided</h3>
              <p><span className="mono">contract/src/rule.rs</span> is what <span className="mono">release</span> calls. The screen does not choose the recipient at pay time.</p>
            </div>
            <div className="panel">
              <h3>Where the number on the desk comes from</h3>
              <p><span className="mono">app/lib/rule.mjs</span> repeats those branches so the desk can preview a slip. A Clears mark there is not a chain payment.</p>
            </div>
          </div>
        </section>

        <section className="pitch-section" id="run">
          <h2>The run</h2>
          <p>
            Contract <span className="mono">{receipt?.contract ?? "m028a47.mtrfc658fd1.testnet"}</span> on NEAR testnet. Every line below shares {when}. The receipt stores that time once.
          </p>
          {state === "ready" && steps.length > 0 ? (
            <ol className="run-list">
              {steps.map((step) => (
                <li key={`${step.code}-${step.hash ?? step.label}`}>
                  <div>
                    <b>{step.label}</b>
                    <span className="tag" data-kind={step.code.startsWith("ERR_") || step.code === "AccessKeyDoesNotExist" ? "refused" : /return/i.test(step.label) ? "back" : step.code === "OK" && Number(step.moved) > 0 ? "paid" : "neutral"}>{step.code}</span>
                  </div>
                  <p><span>Read.</span> {readOf(step)}</p>
                  <p><span>Decided.</span> {means(step)}</p>
                  <p className="run-meta">
                    <span className="mono">{formatUnits(step.moved ?? "0")} tUSDC</span>
                    {step.hash ? <a className="mono" href={txUrl(step.hash)} title={step.hash}>{shortHash(step.hash)}</a> : <span>No transaction. The network rejected it before inclusion.</span>}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="note">{state === "error" ? "The run stays hidden until the receipt loads." : "Reading the lines from the receipt."}</p>
          )}
        </section>

        <section className="pitch-section" id="signed">
          <h2>The signed release</h2>
          <p>
            A second contract, <span className="mono break">{signed.receipt?.contract ?? "m2b2440.mtrfc658fd1.testnet"}</span>. On this one, <span className="mono">release</span> also requires a <span className="mono">provider_tee</span> signature. The request and the response must both contain the release line. The signer pinned at creation is <span className="mono break">{signed.receipt?.signer ?? "0x3b753b4406613c5e70ae640508632b600424fa0c"}</span>. Model <span className="mono">{signed.receipt?.model ?? "z-ai/glm-5.3-flash"}</span>. The Intel quote was not checked. A matching signature pays as soon as the meter is funded. Deleting the key loses if that payment lands first. This is not the run above. Recorded {signedWhen}.
          </p>
          {signed.state === "ready" && signedSteps.length > 0 ? (
            <ol className="run-list">
              {signedSteps.map((step) => (
                <li key={`${step.code}-${step.hash ?? step.label}`}>
                  <div>
                    <b>{step.label}</b>
                    <span className="tag" data-kind={step.code.startsWith("ERR_") ? "refused" : step.code === "OK" && Number(step.moved) > 0 ? "paid" : "neutral"}>{step.code}</span>
                  </div>
                  <p><span>Read.</span> {signedRead(step)}</p>
                  <p><span>Decided.</span> {signedMeans(step)}</p>
                  <p className="run-meta">
                    <span className="mono">{formatUnits(step.moved ?? "0")} tUSDC</span>
                    {step.hash ? <a className="mono" href={txUrl(step.hash)} title={step.hash}>{shortHash(step.hash)}</a> : <span>No transaction.</span>}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="note">{signed.state === "error" ? "The signed release stays hidden until that receipt loads." : "Reading the signed release."}</p>
          )}
          {signed.state === "error" && <button className="text-btn" type="button" onClick={signed.reload}>Try again</button>}
        </section>

        <section className="pitch-section" id="time">
          <h2>The time gate</h2>
          <p>
            A third contract, <span className="mono break">{timed.receipt?.contract ?? "m718aa2.mtrfc658fd1.testnet"}</span>. <span className="mono">release</span> pays only when the block time is at or after the time stored on the line and before the deadline. No method can move that time earlier. The meter is marked paid only after the token transfer succeeds. The recipient <span className="mono break">{timed.receipt?.recipient ?? "the new account"}</span> was not registered with the token, so the first release after the time moved 0.00 and left the meter unpaid. After registration, the same line paid 48.00 once. The time is not evidence the work was done. Once that time has passed, the spending key can pay immediately, and deleting the key loses if that payment lands first. Recorded {timedWhen}.
          </p>
          {timed.state === "ready" && timedSteps.length > 0 ? (
            <ol className="run-list">
              {timedSteps.map((step) => (
                <li key={`${step.code}-${step.hash ?? step.label}`}>
                  <div>
                    <b>{step.label}</b>
                    <span className="tag" data-kind={step.code.startsWith("ERR_") ? "refused" : step.code === "OK" && Number(step.moved) > 0 ? "paid" : "neutral"}>{step.code}</span>
                  </div>
                  <p className="run-meta">
                    <span className="mono">{formatUnits(step.moved ?? "0")} tUSDC</span>
                    {step.hash ? <a className="mono" href={txUrl(step.hash)} title={step.hash}>{shortHash(step.hash)}</a> : <span>No transaction.</span>}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="note">{timed.state === "error" ? "The time gate stays hidden until that receipt loads." : "Reading the time gate."}</p>
          )}
          {timed.state === "error" && <button className="text-btn" type="button" onClick={timed.reload}>Try again</button>}
        </section>

        <section className="pitch-section" id="compare">
          <h2>A transfer, and this run</h2>
          <div className="pitch-scroll">
            <table className="pitch-table">
              <caption>A normal transfer pays the account named at send time. This table is the recorded testnet run, {when}.</caption>
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
                  <td>The tokens can move to the account named then.</td>
                  <td><span className="mono">0.00</span>, <span className="mono">ERR_RECIPIENT</span>. Which means the wrong account was paid nothing.</td>
                </tr>
                <tr>
                  <th>47.00 instead of 48.00</th>
                  <td>The caller can choose a new figure.</td>
                  <td><span className="mono">0.00</span>, <span className="mono">ERR_AMOUNT</span>. Which means 47.00 did not replace 48.00.</td>
                </tr>
                <tr>
                  <th>Evidence hash changed</th>
                  <td>A memo does not hold the money back.</td>
                  <td><span className="mono">0.00</span>, <span className="mono">ERR_EVIDENCE</span>. Which means the rewritten sentence was paid nothing.</td>
                </tr>
                <tr>
                  <th>Same key after delete</th>
                  <td>A key that still exists can sign again.</td>
                  <td>Rejected before a transaction existed. Which means a deleted key cannot spend.</td>
                </tr>
                <tr>
                  <th>After the deadline</th>
                  <td>The balance sits until someone moves it.</td>
                  <td><span className="mono">48.00</span> returned to the buyer. Which means the lock ended.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="pitch-section">
          <h2>The empty corner</h2>
          <p>
            The payout account is fixed when the meter opens. This repo has no later signer who can swap it. If the sealed account is wrong, the buyer waits for the deadline, the balance comes back, and a new slip is required.
          </p>
        </section>

        <section className="pitch-section" id="proof">
          <h2>Proof</h2>
          <p>
            From a clone, <span className="mono">node chain/verify.mjs</span> re-reads the payment record, the signed release, and the time gate. No key. The book lists all three, with a CSV. The figures above are those files, not a balance this page invented.
          </p>
          <p>
            <a href={receipt ? `https://testnet.nearblocks.io/address/${receipt.contract}` : "https://testnet.nearblocks.io/address/m028a47.mtrfc658fd1.testnet"}>Open the payment record</a>
            {" · "}
            <a href={signed.receipt ? `https://testnet.nearblocks.io/address/${signed.receipt.contract}` : "https://testnet.nearblocks.io/address/m2b2440.mtrfc658fd1.testnet"}>Open the signed release</a>
            {" · "}
            <a href={timed.receipt ? `https://testnet.nearblocks.io/address/${timed.receipt.contract}` : "https://testnet.nearblocks.io/address/m718aa2.mtrfc658fd1.testnet"}>Open the time gate</a>
            {" · "}
            <Link href="/book">Open the book</Link>
            {" · "}
            <Link href="/clause">Try the preview</Link>
          </p>
        </section>

        <section className="pitch-section" id="not">
          <h2>What this is not</h2>
          <dl className="not-list">
            <div>
              <dt>This is just a dashboard.</dt>
              <dd>The 0.00 row is a testnet transaction. The hash is on the run above.</dd>
            </div>
            <div>
              <dt>The page decides the payment.</dt>
              <dd>A Clears mark on a desk slip is the preview in <span className="mono">app/lib/rule.mjs</span>. The hash is the chain.</dd>
            </div>
            <div>
              <dt>The key can pay anyone.</dt>
              <dd>It can call <span className="mono">release</span> only. A mismatch moves 0.00. The buyer then deleted it. The next call never reached a block.</dd>
            </div>
            <div>
              <dt>The time proves the work.</dt>
              <dd>The stored time is a clock. It is not the field report. A release before it moved 0.00. After it, the spending key can pay immediately, and deleting the key loses if that payment lands first. A deposit after the deadline is still accepted.</dd>
            </div>
            <div>
              <dt>The signature checks the work.</dt>
              <dd>On the signed release, the model repeated a line this repo already wrote. The contract checks that both bodies contain that line and that the signer matches the address pinned at creation. It does not read the field report. The Intel quote was not checked. A matching signature pays as soon as the meter is funded. Deleting the key loses if that payment lands first.</dd>
            </div>
            <div>
              <dt>This is Circle USDC on mainnet.</dt>
              <dd>The token is <span className="mono">token.mtrfc658fd1.testnet</span>. Mint is public and capped. Mainnet waits on an audit. The contract has no owner withdraw.</dd>
            </div>
            <div>
              <dt>A server holds the key.</dt>
              <dd>No Meter server holds a signer for this run. The function-call key that could call <span className="mono">release</span> was deleted. The name in the desk sidebar is a tab id. It cannot sign.</dd>
            </div>
          </dl>
        </section>

        <section className="pitch-section" id="sources">
          <h2>Sources</h2>
          <ul className="source-list">
            <li>Receipt <span className="mono">app/public/chain.json</span>, {when}, NEAR testnet, contract <span className="mono break">{receipt?.contract ?? "m028a47.mtrfc658fd1.testnet"}</span>.</li>
            <li>Signed release <span className="mono">app/public/tee.json</span>, {signedWhen}, contract <span className="mono break">{signed.receipt?.contract ?? "m2b2440.mtrfc658fd1.testnet"}</span>. The Intel quote was not checked.</li>
            <li>Time gate <span className="mono">app/public/v2.json</span>, {timedWhen}, contract <span className="mono break">{timed.receipt?.contract ?? "m718aa2.mtrfc658fd1.testnet"}</span>. The time is not evidence the work was done.</li>
            <li>Attempted inputs are the ones <span className="mono">chain/prove.mjs</span> sent: <span className="mono">other.testnet</span>, <span className="mono">47000000</span> units (47.00), and an evidence hash that does not match.</li>
            <li>Desk companies Marlow and Sable, ceiling 60.00 and floor 48.00, are example copy. They are not the chain balance.</li>
          </ul>
        </section>

        <p className="pitch-close">A transfer pays whoever is named when it is sent. The sealed line is paid, or nothing moves. On the time gate, that payment also waits for the stored time.</p>
      </main>
    </div>
  );
}
