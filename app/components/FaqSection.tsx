"use client";

import { useId, useState } from "react";
import { SectionHead } from "@/components/SectionHead";
import { faq } from "@/lib/marketing";

export function FaqSection() {
  const baseId = useId();
  const [open, setOpen] = useState<string | null>(faq.items[0]?.q ?? null);

  return (
    <section className="pitch-section faq-section" id="faq">
      <SectionHead hue="cyan" icon="limit" eyebrow={faq.eyebrow} title={faq.title} />
      <div className="faq-grid">
        {faq.items.map((item) => (
          <FaqItem key={item.q} baseId={baseId} item={item} open={open} onToggle={setOpen} />
        ))}
      </div>
    </section>
  );
}

function FaqItem({
  item,
  baseId,
  open,
  onToggle,
}: {
  item: { q: string; a: string };
  baseId: string;
  open: string | null;
  onToggle: (q: string | null) => void;
}) {
  const id = `${baseId}-${item.q.slice(0, 12)}`;
  const expanded = open === item.q;
  return (
    <div className={`faq-item${expanded ? " is-open" : ""}`}>
      <button
        type="button"
        className="faq-q"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => onToggle(expanded ? null : item.q)}
      >
        {item.q}
      </button>
      <div id={id} className="faq-a" hidden={!expanded}>
        <p>{item.a}</p>
      </div>
    </div>
  );
}
