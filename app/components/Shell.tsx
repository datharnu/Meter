"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useDesk } from "@/lib/store";

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const setReady = useDesk((s) => s.setReady);
  useEffect(() => { setReady(); }, [setReady]);
  const on = (href: string) => path === href;
  return (
    <div className="shell">
      <nav className="nav">
        <Link className="mark" href="/">Meter</Link>
        <div className="nav-links">
          <Link className="item" data-on={on("/")} href="/">Desk</Link>
          <Link className="item" data-on={on("/new")} href="/new">New slip</Link>
          <Link className="item" data-on={on("/clause")} href="/clause">The line</Link>
          <Link className="item" data-on={on("/book")} href="/book">The book</Link>
          <Link className="item" data-on={on("/key")} href="/key">The key</Link>
        </div>
        <p>NEAR testnet. Mainnet after an audit.</p>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
