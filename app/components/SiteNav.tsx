"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type FocusEvent } from "react";
import { Logo } from "@/components/Logo";
import { productMenu, topNav } from "@/lib/site";

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
    <button type="button" className="theme-btn" aria-pressed={light} onClick={toggle}>
      {light ? "Light" : "Dark"}
    </button>
  );
}

export function SiteNav() {
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const [product, setProduct] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  const productButton = useRef<HTMLButtonElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const productPanel = useRef<HTMLDivElement>(null);
  const focusProduct = useRef(false);
  const pinned = useRef(false);
  const shown = useRef(false);

  function setShown(next: boolean) {
    shown.current = next;
    setProduct(next);
  }

  useEffect(() => {
    pinned.current = false;
    setMenu(false);
    setShown(false);
  }, [path]);

  useEffect(() => {
    if (!product || !focusProduct.current) return;
    focusProduct.current = false;
    productPanel.current?.querySelector("a")?.focus();
  }, [product]);

  useEffect(() => {
    if (!menu) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [menu]);

  useEffect(() => {
    if (!menu && !product) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      pinned.current = false;
      setMenu(false);
      setShown(false);
      (menu ? menuButton : productButton).current?.focus();
    }
    function onPointer(event: PointerEvent) {
      if (bar.current && event.target instanceof Node && !bar.current.contains(event.target)) {
        pinned.current = false;
        setMenu(false);
        setShown(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [menu, product]);

  function onProductBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
      pinned.current = false;
      setShown(false);
    }
  }

  return (
    <header className="market-bar" data-open={menu ? "true" : "false"}>
      <div className="market-pill" ref={bar}>
        <Link className="market-brand" href="/" aria-label="Meter, home"><Logo /></Link>
        <nav className="market-nav" aria-label="Primary">
          <div className="nav-center">
            <div
              className="product-menu"
              data-open={product ? "true" : "false"}
              onMouseEnter={() => { if (!pinned.current) setShown(true); }}
              onMouseLeave={() => { if (!pinned.current) setShown(false); }}
              onBlur={onProductBlur}
            >
              <button
                ref={productButton}
                className="product-btn"
                type="button"
                data-on={path === "/" || path.startsWith("/product") ? "true" : "false"}
                aria-expanded={product}
                aria-controls="product-panel"
                onClick={() => {
                  if (shown.current && !pinned.current) {
                    pinned.current = true;
                    return;
                  }
                  const next = !shown.current;
                  pinned.current = next;
                  setShown(next);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowDown") return;
                  event.preventDefault();
                  focusProduct.current = true;
                  pinned.current = true;
                  setShown(true);
                }}
              >
                Product
                <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
              </button>
              <div id="product-panel" ref={productPanel} className="product-panel" role="region" aria-label="Product" inert={!product} aria-hidden={!product}>
                {productMenu.map((item) => (
                  <Link key={item.href} href={item.href} title={item.note} aria-current={path === item.href ? "page" : undefined}>
                    <b>{item.title}</b>
                    <span>{item.note}</span>
                  </Link>
                ))}
              </div>
            </div>
            {topNav.map((item) => (
              <Link key={item.href} className="site-link" href={item.href} aria-current={path === item.href || (item.href === "/docs" && path.startsWith("/docs")) ? "page" : undefined}>
                {item.title}
              </Link>
            ))}
          </div>
          <button
            ref={menuButton}
            className="menu-btn"
            type="button"
            aria-expanded={menu}
            aria-controls="site-menu"
            onClick={() => setMenu((open) => !open)}
          >
            {menu ? "Close" : "Menu"}
          </button>
        </nav>
        <div className="nav-end">
          <ThemeToggle />
          <Link className="btn" href="/sign-in">Open the desk</Link>
        </div>
        <div id="site-menu" className="market-links" data-open={menu ? "true" : "false"}>
          <span className="site-label">Product</span>
          {productMenu.map((item) => (
            <Link key={item.href} className="menu-item" href={item.href} title={item.note} onClick={() => setMenu(false)}>
              <b>{item.title}</b>
              <span>{item.note}</span>
            </Link>
          ))}
          {topNav.map((item) => (
            <Link key={item.href} href={item.href} aria-current={path === item.href || path.startsWith(`${item.href}/`) ? "page" : undefined} onClick={() => setMenu(false)}>
              {item.title}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}
