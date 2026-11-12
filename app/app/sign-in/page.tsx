"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icons";
import { NearMark } from "@/components/NearMark";
import { readTab, writeTab } from "@/components/ProfileDock";
import { SiteNav } from "@/components/SiteNav";

export default function SignInPage() {
  const router = useRouter();
  const [named, setNamed] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => { setNamed(Boolean(readTab())); }, []);

  function enter() {
    try {
      if (!readTab()) writeTab();
      setFailed(false);
      router.push("/desk");
    } catch {
      setFailed(true);
    }
  }

  const opening = named === null;

  return (
    <div className="market">
      <SiteNav />
      <main id="content" className="market-main market-narrow gate">
        <p className="eyebrow"><span aria-hidden="true"><NearMark variant="tile" /></span>NEAR testnet</p>
        <h1>Open the desk.</h1>
        <p className="market-lead">
          Slips you seal here stay on this machine. This page does not connect a wallet, and it does not create a key that can spend.
        </p>
        <div className="gate-choices">
          <button className="gate-choice gate-choice-now" type="button" onClick={enter} disabled={opening} aria-busy={opening}>
            <span className="gate-icon" aria-hidden="true"><Icon name="desk" /></span>
            <span>
              <b>{opening ? "Opening the desk" : named ? "Back to the desk" : "Continue in this browser"}</b>
              <small>{named ? "This tab already has a name. It is not a NEAR account." : "Gives this tab a name so the desk can tell one sitting from the next. Closing the tab drops it."}</small>
            </span>
            <span className="gate-go" aria-hidden="true">→</span>
          </button>
          <Link className="gate-choice" href="/book">
            <span className="gate-icon" aria-hidden="true"><Icon name="book" /></span>
            <span>
              <b>Read the receipts</b>
              <small>The payment, the refusals, and the deleted key are already on testnet. No name is required.</small>
            </span>
            <span className="gate-go" aria-hidden="true">→</span>
          </Link>
        </div>
        {failed && <p className="alert" role="alert">This browser blocked the tab name. The receipts are still open.</p>}
      </main>
    </div>
  );
}
