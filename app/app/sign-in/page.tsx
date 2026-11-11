"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { readTab, writeTab } from "@/components/ProfileDock";

export default function SignInPage() {
  const router = useRouter();
  const [named, setNamed] = useState(false);

  useEffect(() => { setNamed(Boolean(readTab())); }, []);

  function enter() {
    if (!readTab()) writeTab();
    router.push("/desk");
  }

  return (
    <div className="market">
      <header className="market-bar">
        <Link href="/"><Logo /></Link>
      </header>
      <main id="content" className="market-main market-narrow">
        <h1>Open the desk in this browser.</h1>
        <p className="market-lead">
          Slips you seal here stay on this machine. This page does not connect a wallet, and it does not create a key that can spend.
        </p>
        <div className="panel">
          <h2>Continue here</h2>
          <p>Gives this tab a name so the desk can tell one sitting from the next. The name is not a NEAR account. Closing the tab drops it.</p>
          <button className="btn" type="button" onClick={enter}>{named ? "Back to the desk" : "Continue in this browser"}</button>
        </div>
        <div className="panel">
          <h2>Skip the desk</h2>
          <p>The payment, the refusals, and the deleted key are already on testnet. No name is required to read them.</p>
          <Link className="ghost" href="/book">See the proof</Link>
        </div>
      </main>
    </div>
  );
}
