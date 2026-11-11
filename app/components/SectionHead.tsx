export function SectionHead({ hue, eyebrow, title, wide = false }: { hue: string; eyebrow: string; title: string; wide?: boolean }) {
  return (
    <header className="section-head">
      <p className="eyebrow"><i data-hue={hue} />{eyebrow}</p>
      <h2 className={wide ? "wide" : undefined}>{title}</h2>
    </header>
  );
}
