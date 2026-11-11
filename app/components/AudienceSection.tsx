import { SectionHead } from "@/components/SectionHead";
import { audience } from "@/lib/marketing";

export function AudienceSection() {
  return (
    <section className="pitch-section audience-section" id="audience">
      <SectionHead hue="orange" icon="line" eyebrow={audience.eyebrow} title={audience.title} lead={audience.lead} />
      <div className="audience-block">
        <h3 className="audience-label">The problem</h3>
        <div className="persona-grid">
          {audience.problem.map((card, index) => (
            <article key={card.title} className="persona-card pop-in" style={{ ["--pop" as string]: `${index * 0.08}s` }}>
              <p className="persona-tag mono" title={card.tag}>{card.tag}</p>
              <h4>{card.title}</h4>
              <p>{card.body}</p>
            </article>
          ))}
        </div>
      </div>
      <div className="audience-block">
        <h3 className="audience-label">Who it is built for</h3>
        <div className="persona-grid">
          {audience.builtFor.map((card, index) => (
            <article key={card.title} className="persona-card persona-quiet pop-in" style={{ ["--pop" as string]: `${index * 0.08}s` }}>
              <h4>{card.title}</h4>
              <p>{card.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
