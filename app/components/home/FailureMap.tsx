import { whyNow } from "@/lib/marketing";
import { txUrl } from "@/lib/useReceipt";

const REFUSED = "DrPqTQnWZSF94vfG8dyg1cPe1vgDxPuW1C7Yh5rjHdVX";
const PAID = "BGX34Gq1NRv17qNtdBy2pcFqszP5V1AzBfpxy7bwveSt";

export function FailureMap() {
  return (
    <section id="why" className="craft-fail" aria-labelledby="why-title">
      <header className="craft-intro">
        <p className="craft-eyebrow">Why the line is sealed</p>
        <h2 id="why-title">A changed instruction is common. A matching call is the hole.</h2>
        <p className="craft-lead">{whyNow.disclaimer}</p>
      </header>

      <div className="craft-figures">
        <p className="craft-figure-main">
          <b>$3.05B</b>
          <span>Business email compromise losses reported to the FBI in 2025, across 24,768 complaints.</span>
          <a href="https://www.ic3.gov/AnnualReport/Reports/2025_IC3Report.pdf">IC3 2025 report</a>
        </p>
        <ul>
          <li>
            <b>74%</b>
            <span>Organisations hit by business email compromise in 2025. 76% saw attempted or actual payments fraud.</span>
            <a href="/docs/evidence#afp-2026">AFP survey, January 2026</a>
          </li>
          <li>
            <b>0.00</b>
            <span>Moved when the recorded run named other.testnet. The sealed line still paid 48.00.</span>
            <a href={txUrl(REFUSED)}>ERR_RECIPIENT</a>
          </li>
        </ul>
      </div>

      <figure className="craft-map">
        <svg viewBox="0 0 880 280" role="img" aria-labelledby="fail-title fail-desc">
          <title id="fail-title">A matching release pays immediately</title>
          <desc id="fail-desc">The stored line is public. The key repeats it and 48.00 moves. A different account moves 0.00. Revoke loses if the matching call lands first.</desc>
          <path className="craft-wire" d="M150 78 H730" />
          <path className="craft-wire craft-wire-down" d="M440 78 V190" />
          <g className="craft-node">
            <rect x="24" y="36" width="200" height="84" rx="16" />
            <text x="124" y="70">get()</text>
            <text x="124" y="94" className="craft-node-sub">line is public</text>
          </g>
          <g className="craft-node">
            <rect x="340" y="36" width="200" height="84" rx="16" />
            <text x="440" y="70">release</text>
            <text x="440" y="94" className="craft-node-sub">repeats the line</text>
          </g>
          <g className="craft-node craft-node-paid">
            <rect x="656" y="36" width="200" height="84" rx="16" />
            <text x="756" y="70">48.00</text>
            <text x="756" y="94" className="craft-node-sub">paid once</text>
          </g>
          <g className="craft-node craft-node-refused">
            <rect x="340" y="168" width="200" height="84" rx="16" />
            <text x="440" y="202">0.00</text>
            <text x="440" y="226" className="craft-node-sub">other account</text>
          </g>
        </svg>
        <figcaption>
          <span>The hash is already stored, so a matching call does not wait for the work.</span>
          <span>Revoke loses if that call lands first. Refund then stays closed.</span>
          <a href={txUrl(PAID)}>Recorded match, 48.00</a>
          <a href={txUrl(REFUSED)}>Recorded mismatch, 0.00</a>
        </figcaption>
      </figure>
    </section>
  );
}
