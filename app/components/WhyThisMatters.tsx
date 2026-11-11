import Link from "next/link";
import { SectionHead } from "@/components/SectionHead";
import { whyNow } from "@/lib/marketing";

function Fn({ n, id }: { n: number; id: string }) {
  return (
    <sup className="stat-fn">
      <Link href={`/docs/evidence#${id}`} aria-label={`Source ${n}`}>
        {n}
      </Link>
    </sup>
  );
}

export function WhyThisMatters() {
  return (
    <section className="pitch-section why-section" id="why" aria-labelledby="why-title">
      <SectionHead hue="teal" icon="book" eyebrow={whyNow.eyebrow} title={whyNow.title} lead={whyNow.lead} />
      <p className="why-disclaimer">{whyNow.disclaimer}</p>

      <div className="why-stats" role="list">
        {whyNow.stats.map((tile, index) => {
          const inner = (
            <>
              <p className="why-stat-label">
                {tile.label}
                <Fn n={tile.footnote} id={tile.id} />
              </p>
              <p className="why-stat-value mono">{tile.value}</p>
              <p className="why-stat-line">{tile.line}</p>
              {"href" in tile && tile.href ? (
                <span className="why-stat-go">
                  Open the book <i aria-hidden="true">→</i>
                </span>
              ) : null}
            </>
          );
          const className = `why-stat pop-in${"href" in tile && tile.href ? " why-stat-link" : ""}`;
          const style = { ["--pop" as string]: `${index * 0.06}s` };
          return "href" in tile && tile.href ? (
            <Link key={tile.id} href={tile.href} className={className} style={style} role="listitem">
              {inner}
            </Link>
          ) : (
            <article key={tile.id} className={className} style={style} role="listitem">
              {inner}
            </article>
          );
        })}
      </div>

      <p className="why-sources">
        {whyNow.sourcesLine}{" "}
        <Link href="/docs/evidence">Evidence</Link>.
      </p>

      <div className="why-worst">
        <p className="mono why-worst-label">{whyNow.worstCaseLabel}</p>
        <p className="why-worst-text">{whyNow.worstCase}</p>
      </div>

      <figure className="why-attack">
        <figcaption className="why-attack-cap">{whyNow.attackCaption}</figcaption>
        <ol className="why-attack-list">
          {whyNow.attacks.map((row) => (
            <li key={row.code}>
              <span className="why-attack-from">{row.label}</span>
              <span className="why-attack-arrow" aria-hidden="true">→</span>
              <span className="why-attack-stop">{row.stop}</span>
              <code className="why-attack-code mono">{row.code}</code>
            </li>
          ))}
        </ol>
      </figure>

      <p className="why-try">
        <Link href="#try">Try the refusal in this browser</Link>
        <span className="muted"> · no transaction hash</span>
      </p>
    </section>
  );
}
