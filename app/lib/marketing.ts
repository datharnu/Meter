export const trustPhrases = [
  { label: "Built on NEAR testnet", icon: "near" as const },
  { label: "token.mtrfc658fd1.testnet", icon: null },
  { label: "Not Circle USDC", icon: null },
];

export const journey = {
  eyebrow: "Before, during, after",
  title: "One line through the whole payment.",
  lead: "The parties seal recipient, amount, sentence, and time. The contract pays that line, or it pays nothing.",
  steps: [
    {
      phase: "Before",
      title: "Seal the line",
      body: "Recipient, 48.00, one sentence, and a window stay fixed after open. Ceiling and floor on the desk slip move no tokens.",
    },
    {
      phase: "During",
      title: "Four checks at release",
      body: "Wrong account, amount, terms, or time each move 0.00 with a reason code. release cannot edit the line.",
    },
    {
      phase: "After",
      title: "A receipt or nothing",
      body: "A paid step has a hash on testnet. A Clears mark in the browser has no hash. Editing storage cannot create one.",
    },
  ],
} as const;

export const audience = {
  eyebrow: "Who feels this",
  title: "Built for anyone who has to trust the figure, not the UI.",
  lead: "Meter does not judge the work. It enforces what was stored.",
  problem: [
    {
      title: "The buyer",
      body: "A memo or a last-minute account change should not redirect sealed funds. The wrong name moved 0.00 on the recorded run.",
      tag: "ERR_RECIPIENT",
    },
    {
      title: "The vendor",
      body: "Payment should track the agreed line, not a caller’s new figure. 47.00 did not replace 48.00.",
      tag: "ERR_AMOUNT",
    },
    {
      title: "The auditor",
      body: "Every refusal and every paid step should be readable on chain. The book lists codes, amounts, and hashes.",
      tag: "node chain/verify.mjs",
    },
  ],
  builtFor: [
    {
      title: "Two parties with one price",
      body: "Marlow Studio and Sable Field are example names on the sheet. They are not a chain balance.",
    },
    {
      title: "A keyed release",
      body: "The paying key calls release only, holds 0.50 NEAR, and disappears after five refusals or a successful pay.",
    },
    {
      title: "A clock, not an accept button",
      body: "stored time ≤ block time < deadline. The time does not prove the field report was done.",
    },
  ],
} as const;

export const whyNow = {
  eyebrow: "Why now",
  title: "Figures move faster than the sheet that authorised them.",
  lead: "Industry reports describe payments redirected after approval. Meter does not stop email fraud or BEC in general—it enforces the line stored on chain at release. Each statistic links to sources; the refusal links to a hash.",
  disclaimer:
    "These numbers are not Meter outcomes. They explain why a fixed recipient, amount, sentence, and time belong in the contract—not in the last message someone trusted.",
  worstCaseLabel: "Worst case, on this contract",
  worstCase:
    "The evidence hash is already on the meter. A matching release pays the sealed recipient as soon as the funds are locked. Revoke loses if that call lands first, and refund then stays closed.",
  attackCaption: "Where a changed instruction stops.",
  attacks: [
    { label: "New bank details in chat", stop: "Recipient sealed at open", code: "ERR_RECIPIENT" },
    { label: "A lower figure at pay time", stop: "Amount sealed at open", code: "ERR_AMOUNT" },
    { label: "A rewritten memo", stop: "Sentence hashed at open", code: "ERR_EVIDENCE" },
    { label: "Pay before the window", stop: "stored time ≤ block time < deadline", code: "ERR_NOT_YET" },
  ],
  stats: [
    {
      id: "ic3-2025",
      label: "Business email compromise losses reported to the FBI, 2025",
      value: "$3.05B",
      line: "24,768 complaints in the 2025 IC3 report.",
      footnote: 1,
    },
    {
      id: "afp-2026",
      label: "US organisations hit by payments fraud, AFP survey 2026",
      value: "76%",
      line: "74% experienced business email compromise in the same survey.",
      footnote: 2,
    },
    {
      id: "meter-run-2026-11-10",
      label: "Wrong recipient on the recorded payment run",
      value: "0.00",
      line: "other.testnet was refused; the sealed line paid 48.00 on testnet.",
      footnote: 3,
      href: "/book",
    },
  ],
  sourcesLine:
    "Sources: FBI IC3 Internet Crime Report 2025; AFP Payments Fraud and Control Survey 2026. Each row is expanded on the evidence page.",
} as const;

export const researchCited = {
  subhead: "Evidence we cite",
  lead: "Public reports on payments fraud and BEC. What they establish—and what Meter does not claim—is spelled out per source.",
  items: [
    {
      title: "FBI IC3 report 2025",
      body: "BEC complaints and losses in 2025. Informs why the recipient is sealed at open, not taken from a message at release.",
      href: "/docs/evidence#ic3-2025",
      label: "Read the row",
    },
    {
      title: "AFP payments fraud survey 2026",
      body: "Share of US organisations reporting payments fraud and BEC. Informs why the homepage demos refusals with codes.",
      href: "/docs/evidence#afp-2026",
      label: "Read the row",
    },
    {
      title: "The evidence index",
      body: "Every cited figure on the site should have a row here: establishes, does not establish, design decision.",
      href: "/docs/evidence",
      label: "Open evidence",
    },
  ],
} as const;

export const researchRecorded = {
  subhead: "Evidence we recorded",
  lead: "No Meter server signs. These numbers come from three JSON files and the contracts they name.",
  items: [
    {
      title: "Three testnet contracts",
      body: "Payment record m028a47, signed release m2b2440, and time gate m1870dd. Each run is a separate receipt.",
      href: "https://testnet.nearblocks.io/address/m028a47.mtrfc658fd1.testnet",
      label: "Open payment record",
    },
    {
      title: "Time window unit test",
      body: "one_nanosecond_before_the_deadline_clears_and_the_deadline_does_not is in the repo. The deadline edge is not hand-waved.",
      href: "/docs/time",
      label: "Read the time window",
    },
    {
      title: "Verify without a key",
      body: "node chain/verify.mjs re-reads app/public/chain.json, tee.json, and v2.json. No signer is required.",
      href: "/verify",
      label: "See verify",
    },
  ],
} as const;

export const research = {
  eyebrow: "Research",
  title: "Cited industry evidence and recorded testnet receipts.",
  lead: "Split what we read from publishers from what we re-read on chain.",
} as const;

export const faq = {
  eyebrow: "FAQ",
  title: "Questions judges ask first.",
  items: [
    {
      q: "Does the page decide the payment?",
      a: "No. A Clears mark has no hash and moves nothing. Only a receipt step with a hash on testnet is a paid figure.",
    },
    {
      q: "Can the key pay anyone?",
      a: "It can call release only. The recipient, amount, sentence, and time were sealed when the meter opened.",
    },
    {
      q: "What if the work is late?",
      a: "The stored time is a clock, not proof of work. At or after the deadline the contract rejects the release or returns the balance.",
    },
    {
      q: "Is this mainnet USDC?",
      a: "No. The token is token.mtrfc658fd1.testnet. Mainnet waits on an audit.",
    },
    {
      q: "Does Meter hold a signer?",
      a: "No Meter server holds a key. The function-call key on the recorded run was deleted.",
    },
    {
      q: "How do I check a refusal?",
      a: "Open the book for the hash, or run node chain/verify.mjs from the repo root with no key.",
    },
    {
      q: "Does Meter stop business email compromise?",
      a: "No. It enforces one sealed line on testnet. Industry stats on the homepage link to /docs/evidence; the proof is a transaction hash, not a survey.",
    },
    {
      q: "Is the AI doing anything?",
      a: "Yes. A model reads the invoice and emits the tool call. The contract then pays the stored line or moves 0.00. The model is not the guard.",
    },
    {
      q: "Why does the model always obey?",
      a: "The recorded clerk is told that the invoice is the instruction, at temperature 0, with tool choice required. That is the naive prompt in inject.json. A hardened prompt that pays the header is stored beside it when that run exists. Neither prompt can change the sealed line.",
    },
    {
      q: "What if the agent burns its own key?",
      a: "Five refusals delete the key. The tokens stay in the meter. The buyer installs a new key with 1 yoctoNEAR. The recipient, amount, sentence, and window do not change.",
    },
  ],
} as const;

export const footer = {
  headline: "Open the desk, or read the receipts first.",
  line: "The sealed line is paid, or nothing moves.",
  cta: { label: "Open the desk", href: "/sign-in" },
  secondary: { label: "See the proof", href: "/book" },
  links: [
    { title: "The flow", href: "/#journey" },
    { title: "Who it is for", href: "/#audience" },
    { title: "Try the refusal", href: "/#try" },
    { title: "The run", href: "/#run" },
    { title: "Why now", href: "/#why" },
    { title: "Research", href: "/#research" },
    { title: "Evidence", href: "/docs/evidence" },
    { title: "Docs", href: "/docs" },
    { title: "Verify", href: "/verify" },
  ],
  note: "NEAR testnet · example copy only where labeled",
};
