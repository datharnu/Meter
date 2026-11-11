"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DocArticle } from "@/components/DocArticle";
import { SiteNav } from "@/components/SiteNav";
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

function sectionId(heading: string, id?: string) {
  if (id) return id;
  return heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function DocsShell({ story }: { story: Story }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("");
  const path = usePathname();
  const overview = path === "/docs";
  const index = docLinks.findIndex((item) => item.href === path);
  const current = index >= 0 ? docLinks[index] : null;
  const prev = index > 0 ? docLinks[index - 1] : index === 0 ? { href: "/docs", title: "Overview" } : null;
  const next = index === -1 ? docLinks[0] : docLinks[index + 1];
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    const nodes = [...document.querySelectorAll<HTMLElement>("[data-doc-section]")];
    if (nodes.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: "-90px 0px -65% 0px" },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [path]);
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
          <DocArticle story={story} overview={overview} />
          {(prev || next) && (
            <nav className="docs-pager" aria-label="Adjacent pages">
              {prev ? <Link href={prev.href}><small>Previous</small><b>{prev.title}</b></Link> : <span />}
              {next ? <Link className="pager-next" href={next.href}><small>Next</small><b>{next.title}</b></Link> : null}
            </nav>
          )}
        </main>
        {story.blocks.length > 0 ? (
          <aside className="docs-toc" aria-label="On this page">
            <p>On this page</p>
            <ul>
              {story.blocks.map((block) => {
                const id = sectionId(block.heading, block.id);
                return (
                  <li key={id}>
                    <a href={`#${id}`} aria-current={active === id ? "true" : undefined}>{block.heading}</a>
                  </li>
                );
              })}
            </ul>
          </aside>
        ) : null}
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
