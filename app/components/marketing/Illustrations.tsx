/** Composed UI illustrations (Proteus/Accord-style), not stock art. */

export function SlipIllustration() {
  return (
    <div className="illus-slip" aria-hidden="true">
      <div className="illus-card">
        <p className="illus-kicker"><span>Example slip</span><span>Sealed</span></p>
        <p className="illus-amount">48.00<small>tUSDC</small></p>
        <div className="illus-rows">
          <div><span>Buyer</span><b>Marlow Studio</b></div>
          <div><span>Vendor</span><b className="mono">sable.testnet</b></div>
        </div>
        <p className="illus-caption">Field report 04 · price at most 100</p>
      </div>
    </div>
  );
}

export function BeamIllustration() {
  return (
    <figure className="illus-beam" aria-label="Buyer, meter contract, and vendor connected by a release path">
      <svg viewBox="0 0 320 120" className="illus-beam-svg">
        <defs>
          <linearGradient id="beam-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--teal)" stopOpacity="0" />
            <stop offset="45%" stopColor="var(--teal)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--teal)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M 56 60 C 120 40, 200 80, 264 60" fill="none" stroke="url(#beam-grad)" strokeWidth="3" strokeLinecap="round" />
        <rect x="16" y="36" width="72" height="48" rx="12" className="illus-node" />
        <text x="52" y="64" textAnchor="middle" className="illus-node-label">Buyer</text>
        <rect x="124" y="28" width="72" height="64" rx="12" className="illus-node illus-node-mid" />
        <text x="160" y="58" textAnchor="middle" className="illus-node-label">Meter</text>
        <text x="160" y="76" textAnchor="middle" className="illus-node-sub mono">release</text>
        <rect x="232" y="36" width="72" height="48" rx="12" className="illus-node" />
        <text x="268" y="64" textAnchor="middle" className="illus-node-label">Vendor</text>
      </svg>
      <figcaption className="illus-beam-caption">Four checks run on the path. Only the sealed line clears.</figcaption>
    </figure>
  );
}

export function ReceiptIllustration() {
  return (
    <div className="illus-receipt" aria-hidden="true">
      <div className="illus-ledger">
        <div className="illus-row refused">
          <span>Wrong recipient</span>
          <span className="tag" data-kind="refused">ERR_RECIPIENT</span>
          <span className="mono">0.00</span>
        </div>
        <div className="illus-row paid">
          <span>Sealed line</span>
          <span className="tag" data-kind="paid">OK</span>
          <span className="mono">48.00</span>
        </div>
        <p className="illus-hash mono">DrPqTQnW…rjHdVX</p>
      </div>
    </div>
  );
}
