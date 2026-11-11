import Link from "next/link";
import { Logo } from "@/components/Logo";
import { NearMark } from "@/components/NearMark";
import { footer } from "@/lib/marketing";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-cta">
        <h2>{footer.headline}</h2>
        <p>{footer.line}</p>
        <div className="market-actions">
          <Link className="btn" href={footer.cta.href}>{footer.cta.label}</Link>
          <Link className="ghost" href={footer.secondary.href}>{footer.secondary.label}</Link>
        </div>
      </div>
      <div className="site-footer-brand">
        <Link className="site-footer-mark" href="/" aria-label="Meter, home">
          <Logo word />
        </Link>
        <nav className="site-footer-links" aria-label="Footer">
          {footer.links.map((link) => (
            <Link key={link.href} href={link.href}>{link.title}</Link>
          ))}
        </nav>
      </div>
      <p className="site-footer-note">
        <NearMark variant="tile" />
        {footer.note}
      </p>
    </footer>
  );
}
