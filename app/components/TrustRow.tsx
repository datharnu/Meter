import { Icon, type IconName } from "@/components/Icons";
import { trustPhrases } from "@/lib/marketing";

export function TrustRow() {
  return (
    <p className="trust-row">
      {trustPhrases.map((item, index) => (
        <span key={item.label} className="trust-item">
          {index > 0 ? <span className="trust-dot" aria-hidden="true">·</span> : null}
          {item.icon ? <Icon name={item.icon as IconName} size={14} /> : null}
          <span>{item.label}</span>
        </span>
      ))}
    </p>
  );
}
