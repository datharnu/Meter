"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SiteNav } from "@/components/SiteNav";
import { StoryBody } from "@/components/StoryPage";
import { docGroups, docLinks, type Story } from "@/lib/site";

function DocNav({ onPick }: { onPick?: () => void }) {
  const path = usePathname();
  return (
    <nav className="docs-nav" aria-label="Documentation">
      <Link href="/docs" aria-current={path === "/docs" ? "page" : undefined} onClick={onPick}>Overview</Link>
      {docGroups.map((group) => (
        <div key={group}>
          <p>{group}</p>
          <ul>
            {docLinks.filter((item) => item.group === group).map((item) => (
              <li key={item.href}>
                <Link href={item.href} aria-current={path === item.href ? "page" : undefined} onClick={onPick}>{item.title}</Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function DocsShell({ story }: { story: Story }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const index = docLinks.findIndex((item) => item.href === path);
  const current = index >= 0 ? docLinks[index] : null;
  const prev = index > 0 ? docLinks[index - 1] : index === 0 ? { href: "/docs", title: "Overview" } : null;
  const next = index === -1 ? docLinks[0] : docLinks[index + 1];
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="market">
      <SiteNav />
      <div className="docs-shell">
        <aside className="docs-side"><DocNav /></aside>
        <main id="content" className="story">
          <div className="docs-mobile">
            <button type="button" aria-expanded={open} aria-controls="docs-drawer" onClick={() => setOpen(true)}>Docs menu</button>
          </div>
          <p className="crumbs">
            <Link href="/docs">Docs</Link>
            {current ? <><span aria-hidden="true">/</span><span>{current.group}</span><span aria-hidden="true">/</span><span>{current.title}</span></> : <span>Overview</span>}
          </p>
          <StoryBody story={story} />
          {(prev || next) && (
            <nav className="docs-pager" aria-label="Adjacent pages">
              {prev ? <Link href={prev.href}><small>Previous</small><b>{prev.title}</b></Link> : <span />}
              {next ? <Link className="pager-next" href={next.href}><small>Next</small><b>{next.title}</b></Link> : null}
            </nav>
          )}
        </main>
      </div>
      {open ? (
        <div className="docs-scrim" onClick={() => setOpen(false)}>
          <div id="docs-drawer" role="dialog" aria-modal="true" aria-label="Documentation" onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => setOpen(false)}>Close</button>
            <DocNav onPick={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
