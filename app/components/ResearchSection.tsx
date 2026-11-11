import Link from "next/link";
import { SectionHead } from "@/components/SectionHead";
import { research, researchCited, researchRecorded } from "@/lib/marketing";

function ResearchGrid({ items }: { items: readonly { title: string; body: string; href: string; label: string }[] }) {
  return (
    <div className="research-grid">
      {items.map((item, index) => {
        const external = item.href.startsWith("http");
        const inner = (
          <>
            <span className="research-index mono">0{index + 1}</span>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
            <span className="research-go">
              {item.label}
              <i aria-hidden="true">→</i>
            </span>
          </>
        );
        const style = { ["--pop" as string]: `${index * 0.1}s` };
        return external ? (
          <a key={item.title} className="research-card pop-in" href={item.href} target="_blank" rel="noopener noreferrer" style={style}>
            {inner}
          </a>
        ) : (
          <Link key={item.title} className="research-card pop-in" href={item.href} style={style}>
            {inner}
          </Link>
        );
      })}
    </div>
  );
}

export function ResearchSection() {
  return (
    <section className="pitch-section research-section" id="research">
      <SectionHead hue="purple" icon="book" eyebrow={research.eyebrow} title={research.title} lead={research.lead} />
      <div className="research-block">
        <h3 className="audience-label">{researchCited.subhead}</h3>
        <p className="research-block-lead">{researchCited.lead}</p>
        <ResearchGrid items={researchCited.items} />
      </div>
      <div className="research-block">
        <h3 className="audience-label">{researchRecorded.subhead}</h3>
        <p className="research-block-lead">{researchRecorded.lead}</p>
        <ResearchGrid items={researchRecorded.items} />
      </div>
    </section>
  );
}
