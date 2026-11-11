"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { docGroups, docLinks } from "@/lib/site";

export function DocFrame() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const nav = (
    <nav className="docs-nav" aria-label="Documentation">
      <Link href="/docs" aria-current={path === "/docs" ? "page" : undefined}>Overview</Link>
      {docGroups.map((group) => (
        <div key={group}>
          <p>{group}</p>
          <ul>
            {docLinks.filter((item) => item.group === group).map((item) => (
              <li key={item.href}>
                <Link href={item.href} aria-current={path === item.href ? "page" : undefined} onClick={() => setOpen(false)}>{item.title}</Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      <aside className="docs-side">{nav}</aside>
      <div className="docs-mobile">
        <button type="button" aria-expanded={open} aria-controls="docs-drawer" onClick={() => setOpen(true)}>Docs menu</button>
      </div>
      {open ? (
        <div className="docs-scrim" onClick={() => setOpen(false)}>
          <div id="docs-drawer" role="dialog" aria-modal="true" aria-label="Documentation" onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => setOpen(false)}>Close</button>
            {nav}
          </div>
        </div>
      ) : null}
    </>
  );
}
