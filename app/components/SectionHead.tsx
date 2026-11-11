import { Icon, type IconName } from "@/components/Icons";

export function SectionHead({ hue, eyebrow, title, wide = false, icon, lead }: { hue: string; eyebrow: string; title: string; wide?: boolean; icon?: IconName; lead?: string }) {
  return (
    <header className="section-head">
      <p className="eyebrow">{icon ? <span data-hue={hue}><Icon name={icon} size={14} /></span> : <i data-hue={hue} />}{eyebrow}</p>
      <h2 className={wide ? "wide" : undefined}>{title}</h2>
      {lead ? <p className="section-lead">{lead}</p> : null}
    </header>
  );
}
