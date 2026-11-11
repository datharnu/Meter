"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Icon, type IconName } from "@/components/Icons";
import { Logo } from "@/components/Logo";
import { ProfileDock } from "@/components/ProfileDock";
import { useDesk } from "@/lib/store";

const links: { href: string; label: string; short: string; icon: IconName }[] = [
  { href: "/desk", label: "Desk", short: "Desk", icon: "desk" },
  { href: "/new", label: "New slip", short: "New", icon: "slip" },
  { href: "/clause", label: "The line", short: "Line", icon: "line" },
  { href: "/book", label: "The book", short: "Book", icon: "book" },
  { href: "/key", label: "The key", short: "Key", icon: "key" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const setReady = useDesk((s) => s.setReady);
  useEffect(() => { setReady(); }, [setReady]);
  const marketing = path === "/" || path === "/sign-in" || path === "/how" || path === "/security" || path === "/verify" || path.startsWith("/product") || path.startsWith("/docs");
  if (marketing) return children;
  const current = (href: string) => path === href;
  return (
    <div className="shell">
      <aside className="nav">
        <Link className="mark" href="/desk"><Logo /></Link>
        <div className="nav-links">
          {links.map((link) => (
            <Link key={link.href} className="item" href={link.href} data-on={current(link.href)} aria-current={current(link.href) ? "page" : undefined}>
              <Icon name={link.icon} />
              {link.label}
            </Link>
          ))}
        </div>
        <ProfileDock place="side" />
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="frame frame-bar">
            <Link className="mark mark-phone" href="/desk"><Logo /></Link>
            <div className="topbar-end">
              <ProfileDock place="top" />
              <span className="tag" data-kind="neutral"><Icon name="near" size={12} />NEAR testnet</span>
            </div>
          </div>
        </header>
        <main id="content" className="main frame">{children}</main>
      </div>
      <nav className="tabs" aria-label="Sections">
        {links.map((link) => (
          <Link key={link.href} href={link.href} data-on={current(link.href)} aria-current={current(link.href) ? "page" : undefined}>
            <Icon name={link.icon} />
            {link.short}
          </Link>
        ))}
      </nav>
    </div>
  );
}
