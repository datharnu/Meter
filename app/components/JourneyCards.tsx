import { SectionHead } from "@/components/SectionHead";
import { journey } from "@/lib/marketing";
import { BeamIllustration, ReceiptIllustration, SlipIllustration } from "@/components/marketing/Illustrations";

const art = [SlipIllustration, BeamIllustration, ReceiptIllustration] as const;

export function JourneyCards() {
  return (
    <section className="pitch-section journey-section" id="journey">
      <SectionHead hue="teal" icon="slip" eyebrow={journey.eyebrow} title={journey.title} lead={journey.lead} />
      <div className="journey-grid">
        {journey.steps.map((step, index) => {
          const Art = art[index];
          return (
            <article key={step.phase} className="journey-card pop-in" style={{ ["--pop" as string]: `${index * 0.1}s` }}>
              <div className="journey-plate">
                <Art />
              </div>
              <div className="journey-copy">
                <p className="journey-phase">{step.phase}</p>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
