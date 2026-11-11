"use client";

import { useEffect, useRef, useState } from "react";

const STEPS = [
  {
    n: "01",
    title: "Open",
    short: "The buyer writes the line",
    body: "Recipient, amount, evidence hash, and deadline are stored. The ceiling and the floor never leave the browser.",
    shows: "On the meter",
    detail: "One recipient, 48.00, one hash, one deadline.",
    never: "A later method that edits those four fields.",
  },
  {
    n: "02",
    title: "Sign",
    short: "Both accounts mark the meter",
    body: "Buyer and vendor each call sign. The contract stores a boolean for each account named on the meter.",
    shows: "On the meter",
    detail: "Two booleans. Not a signature over the sentence.",
    never: "A stranger funding the meter.",
  },
  {
    n: "03",
    title: "Lock",
    short: "The buyer locks 48.00",
    body: "Testnet tUSDC moves onto the contract, up to the stored amount. Extra tokens are sent back. Mint on this token is public.",
    shows: "On the token",
    detail: "token.mtrfc658fd1.testnet, not Circle USDC.",
    never: "An owner withdraw.",
  },
  {
    n: "04",
    title: "Release",
    short: "The key repeats the line, or it pays nothing",
    body: "The key can call release and nothing else. A matching call pays once. Any other recipient, amount, or hash moves 0.00 and is recorded.",
    shows: "On the call",
    detail: "0.50 NEAR of gas. Not a spending cap.",
    never: "A fifth mismatch. That call deletes the key.",
  },
  {
    n: "05",
    title: "Deadline",
    short: "Unpaid funds return",
    body: "At or after the deadline, if nothing was paid, the balance returns to the buyer. A matching payment before that does not come back.",
    shows: "On the clock",
    detail: "Block time, not the desk clock.",
    never: "A refund while the line is still open.",
  },
] as const;

const DWELL = 5600;

export function StepRail() {
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(false);
  const [reduce, setReduce] = useState(false);
  const root = useRef<HTMLElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduce(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.35 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reduce || paused || !inView) return;
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const ratio = (now - started) / DWELL;
      if (ratio >= 1) {
        setActive((current) => (current + 1) % STEPS.length);
        setProgress(0);
        return;
      }
      setProgress(ratio);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, reduce, paused, inView]);

  function go(index: number) {
    setActive(index);
    setProgress(0);
  }

  const step = STEPS[active];

  return (
    <section ref={root} id="journey" className="craft-steps" aria-labelledby="journey-title">
      <header className="craft-intro">
        <p className="craft-eyebrow">How a meter runs</p>
        <h2 id="journey-title">Five steps. The line does not change after the first.</h2>
      </header>
      <div
        className="craft-rail"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div className="craft-tabs" role="tablist" aria-label="The five steps">
          {STEPS.map((item, index) => (
            <button
              key={item.n}
              ref={(node) => { tabs.current[index] = node; }}
              type="button"
              role="tab"
              id={`meter-step-${index}`}
              aria-selected={index === active}
              aria-controls="meter-step-panel"
              tabIndex={index === active ? 0 : -1}
              onClick={() => go(index)}
              onKeyDown={(event) => {
                if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
                event.preventDefault();
                const next = (index + (event.key === "ArrowRight" ? 1 : STEPS.length - 1)) % STEPS.length;
                go(next);
                tabs.current[next]?.focus();
              }}
            >
              <span className="mono">{item.n}</span>
              {item.title}
              {index === active && !reduce ? <i style={{ transform: `scaleX(${progress})` }} /> : null}
            </button>
          ))}
        </div>
        <div className="craft-stage" id="meter-step-panel" role="tabpanel" aria-labelledby={`meter-step-${active}`}>
          <div className="craft-copy">
            <p className="mono craft-kicker"><span>Step {step.n} of 05</span><span>{paused ? "Paused" : "Running"}</span></p>
            <h3>{step.title}. {step.short}.</h3>
            <p>{step.body}</p>
            <dl>
              <div><dt>{step.shows}</dt><dd>{step.detail}</dd></div>
              <div><dt>Cannot happen</dt><dd>{step.never}</dd></div>
            </dl>
          </div>
          <StepVisual index={active} />
        </div>
      </div>
    </section>
  );
}

function StepVisual({ index }: { index: number }) {
  if (index === 0) {
    return (
      <div className="craft-visual craft-visual-sheet" aria-hidden="true">
        <p>48.00</p>
        <span>sable.testnet</span>
        <span>hash stored · ceiling hidden</span>
      </div>
    );
  }
  if (index === 1) {
    return (
      <div className="craft-visual craft-visual-signs" aria-hidden="true">
        <p><b>Buyer</b><span>signed</span></p>
        <p><b>Vendor</b><span>signed</span></p>
      </div>
    );
  }
  if (index === 2) {
    return (
      <div className="craft-visual craft-visual-lock" aria-hidden="true">
        <p>48.00 locked</p>
        <span className="craft-bar"><i /></span>
        <span>public mint · no owner withdraw</span>
      </div>
    );
  }
  if (index === 3) {
    return (
      <div className="craft-visual craft-visual-pay" aria-hidden="true">
        <p data-kind="paid"><b>Match</b><span>48.00</span></p>
        <p data-kind="refused"><b>Anything else</b><span>0.00</span></p>
      </div>
    );
  }
  return (
    <div className="craft-visual craft-visual-back" aria-hidden="true">
      <p>Unpaid</p>
      <span>returns to the buyer</span>
      <p>Already paid</p>
      <span>stays paid</span>
    </div>
  );
}
