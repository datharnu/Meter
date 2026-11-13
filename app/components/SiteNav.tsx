"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icons";
import { Logo } from "@/components/Logo";
import { topNav } from "@/lib/site";

function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);
  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("meter-theme", next); } catch { /* private mode */ }
    setTheme(next);
  }
  const light = theme === "light";
  return (
    <button type="button" className="theme-btn" aria-pressed={light} aria-label={light ? "Switch to dark" : "Switch to light"} onClick={toggle}>
      <Icon name={light ? "sun" : "moon"} />
    </button>
  );
}

export function SiteNav() {
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const menuPanel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMenu(false);
  }, [path]);

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1200px)");
    const close = () => { if (wide.matches) setMenu(false); };
    wide.addEventListener("change", close);
    return () => wide.removeEventListener("change", close);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    menuPanel.current?.querySelector("a")?.focus({ preventScroll: true });
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMenu(false);
      menuButton.current?.focus();
    }
    function onPointer(event: PointerEvent) {
      if (bar.current && event.target instanceof Node && !bar.current.contains(event.target)) setMenu(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [menu]);

  function current(href: string) {
    if (href === "/docs") return path.startsWith("/docs") ? "page" : undefined;
    return path === href ? "page" : undefined;
  }

  return (
    <header className="market-bar" data-open={menu ? "true" : "false"}>
      <div className="market-pill" ref={bar}>
        <div className="market-top">
        <Link className="market-brand" href="/" aria-label="Meter, home"><Logo /></Link>
        <nav className="market-nav" aria-label="Primary">
          <div className="nav-center">
            {topNav.map((item) => (
              <Link key={item.href} className="site-link" href={item.href} aria-current={current(item.href)}>
                {item.title}
              </Link>
            ))}
          </div>
          <div className="nav-actions">
            <ThemeToggle />
            <Link className="btn nav-desk" href="/sign-in" aria-label="Open the desk">
              <span className="nav-desk-long">Open the desk</span>
              <span className="nav-desk-short" aria-hidden="true">Desk</span>
            </Link>
            <button
              ref={menuButton}
              className="menu-btn"
              type="button"
              aria-expanded={menu}
              aria-controls="site-menu"
              aria-label={menu ? "Close menu" : "Open menu"}
              onClick={() => setMenu((open) => !open)}
            >
              <Icon name={menu ? "close" : "menu"} size={20} />
            </button>
          </div>
        </nav>
        </div>
        <div id="site-menu" ref={menuPanel} className="market-links" data-open={menu ? "true" : "false"} aria-hidden={menu ? undefined : true}>
          {topNav.map((item) => (
            <Link key={item.href} href={item.href} aria-current={current(item.href)} onClick={() => setMenu(false)}>
              {item.title}
            </Link>
          ))}
          <Link className="btn market-sheet-cta" href="/sign-in" onClick={() => setMenu(false)}>Open the desk</Link>
        </div>
      </div>
    </header>
  );
}
