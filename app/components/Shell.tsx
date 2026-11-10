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
        <Link className="item" data-on={on("/")} href="/">Meters</Link>
        <Link className="item" data-on={on("/new")} href="/new">New</Link>
        <p>NEAR testnet. Mainnet after an audit. This desk does not move tokens.</p>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
