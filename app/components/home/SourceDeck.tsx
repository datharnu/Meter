"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const SOURCES = [
  {
    id: "ic3",
    product: "The recipient",
    finding: "Reported BEC losses were $3.05 billion in 2025. The payee is what gets swapped.",
    who: "FBI Internet Crime Complaint Center",
    venue: "2025 Internet Crime Report",
    host: "ic3.gov",
    image: "/research/ic3.jpg",
    alt: "Cover of the FBI 2025 Internet Crime Report",
    crop: false,
    href: "https://www.ic3.gov/AnnualReport/Reports/2025_IC3Report.pdf",
    external: true,
  },
  {
    id: "afp",
    product: "The instruction",
    finding: "74% of surveyed organisations were hit by business email compromise in 2025.",
    who: "Association for Financial Professionals",
    venue: "Survey fielded January 2026",
    host: "AFP highlights",
    image: "/research/afp.jpg",
    alt: "Cover of the 2026 AFP Payments Fraud and Control Survey, key highlights",
    crop: false,
    href: "/docs/evidence#afp-2026",
    external: false,
  },
  {
    id: "run",
    product: "This contract",
    finding: "other.testnet moved 0.00. The sealed vendor was paid 48.00 tUSDC.",
    who: "Meter payment record",
    venue: "10 November 2026, 23:03 UTC",
    host: "testnet.near.rocks",
    image: "/research/refusal.jpg",
    alt: "NEAR testnet page for the refusal. The release names other.testnet and moves nothing.",
    crop: true,
    href: "https://testnet.near.rocks/tx/DrPqTQnWZSF94vfG8dyg1cPe1vgDxPuW1C7Yh5rjHdVX",
    external: true,
  },
] as const;

export function SourceDeck() {
  const [active, setActive] = useState(0);
  const [hold, setHold] = useState(false);
  const [inView, setInView] = useState(false);
  const [reduce, setReduce] = useState(false);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const root = useRef<HTMLElement>(null);

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
    if (reduce || hold || !inView) return;
    const timer = window.setTimeout(() => setActive((current) => (current + 1) % SOURCES.length), 4200);
    return () => window.clearTimeout(timer);
  }, [active, reduce, hold, inView]);

  return (
    <section ref={root} id="research" className="craft-research" aria-labelledby="research-title">
      <header className="craft-intro">
        <p className="craft-eyebrow">Research</p>
        <h2 id="research-title">What the reports say, and what this run recorded.</h2>
      </header>
      <div className="craft-deck" onMouseLeave={() => setHold(false)}>
        <ol>
          {SOURCES.map((source, index) => (
            <li key={source.id} className={index === active ? "is-on" : ""}>
              <button type="button" onMouseEnter={() => { setActive(index); setHold(true); }} onFocus={() => { setActive(index); setHold(true); }} onBlur={() => setHold(false)}>
                <span className="mono">0{index + 1}</span>
                <span>
                  <small>Informs {source.product}</small>
                  <b>{source.finding}</b>
                  <em>{source.who} · {source.venue}</em>
                </span>
              </button>
            </li>
          ))}
        </ol>
        <div className="craft-papers" aria-hidden="true">
          {SOURCES.map((source, index) => {
            const depth = (index - active + SOURCES.length) % SOURCES.length;
            const body = failed[source.id] ? (
              <>
                <span className="craft-paper-bar"><i /><i /><i />{source.host}</span>
                <span className="craft-paper-copy">
                  <strong>{source.venue}</strong>
                  <span>{source.finding}</span>
                </span>
              </>
            ) : (
              <>
                <span className="craft-paper-bar"><i /><i /><i />{source.host}</span>
                <span className="craft-shot" data-crop={source.crop ? "top" : undefined}>
                  <img
                    src={source.image}
                    alt={source.alt}
                    draggable={false}
                    onError={() => setFailed((current) => ({ ...current, [source.id]: true }))}
                  />
                </span>
              </>
            );
            return source.external ? (
              <a key={source.id} className="craft-paper" data-depth={depth} href={source.href} target="_blank" rel="noopener noreferrer" tabIndex={depth === 0 ? 0 : -1}>
                {body}
              </a>
            ) : (
              <Link key={source.id} className="craft-paper" data-depth={depth} href={source.href} tabIndex={depth === 0 ? 0 : -1}>
                {body}
              </Link>
            );
          })}
        </div>
      </div>
      <p className="craft-lead">These figures are not Meter outcomes. The proof is the hash, not the survey.</p>
    </section>
  );
}
