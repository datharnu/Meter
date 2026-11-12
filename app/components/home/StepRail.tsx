const STEPS = [
  {
    n: "01",
    title: "Open",
    body: "Recipient, amount, terms hash, and deadline are stored. The ceiling and the floor never leave the browser.",
  },
  {
    n: "02",
    title: "Sign",
    body: "Buyer and vendor each call sign. The contract stores a boolean for each account named on the meter.",
  },
  {
    n: "03",
    title: "Lock",
    body: "Testnet tUSDC moves onto the contract, up to the stored amount. Mint on this token is public.",
  },
  {
    n: "04",
    title: "Release",
    body: "The key can call release and nothing else. A matching call pays once. Any other recipient, amount, or terms moves 0.00.",
  },
  {
    n: "05",
    title: "Deadline",
    body: "At or after the deadline, if nothing was paid, the balance returns to the buyer.",
  },
] as const;

export function StepRail() {
  return (
    <section id="journey" className="craft-steps" aria-labelledby="journey-title">
      <header className="craft-intro">
        <p className="craft-eyebrow">How a meter runs</p>
        <h2 id="journey-title">Five steps. The line does not change after the first.</h2>
      </header>
      <ol className="hijack-steps">
        {STEPS.map((step) => (
          <li key={step.n}>
            <span className="mono">{step.n}</span>
            <b>{step.title}</b>
            <p>{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
