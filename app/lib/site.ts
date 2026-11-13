import type { IconName } from "@/components/Icons";

export const deskNav: { href: string; label: string; short: string; icon: IconName }[] = [
  { href: "/desk", label: "Desk", short: "Desk", icon: "desk" },
  { href: "/new", label: "New slip", short: "New", icon: "slip" },
  { href: "/clause", label: "The line", short: "Line", icon: "line" },
  { href: "/book", label: "The book", short: "Book", icon: "book" },
  { href: "/key", label: "The key", short: "Key", icon: "key" },
  { href: "/attack", label: "The hijack", short: "Hijack", icon: "limit" },
  { href: "/check", label: "Check a call", short: "Check a call", icon: "check" },
  { href: "/bench", label: "Bench", short: "Bench", icon: "run" },
];

export type Story = {
  eyebrow: string;
  title: string;
  lede: string;
  blocks: { heading: string; body: string[]; id?: string }[];
};

export const productMenu = [
  { href: "/#try", title: "Try the refusal", note: "Before the time moves 0.00. This page sends no transaction." },
  { href: "/desk", title: "The desk", note: "The recorded runs, then a slip that moves no tokens." },
  { href: "/book", title: "The book", note: "Every step, its code, and its transaction." },
  { href: "/key", title: "The key", note: "release only. 0.50 NEAR. Then it is gone." },
] as const;

export const topNav = [
  { href: "/#journey", title: "The flow" },
  { href: "/#why", title: "Why now" },
  { href: "/#audience", title: "Who it's for" },
  { href: "/#research", title: "Research" },
  { href: "/#faq", title: "FAQ" },
  { href: "/docs", title: "Docs" },
] as const;

export type DocLink = { href: string; title: string; group: string };

export const docGroups = ["Get started", "Concepts", "On NEAR", "Trust"] as const;

export const docLinks: DocLink[] = [
  { href: "/docs/desk", title: "Open the desk", group: "Get started" },
  { href: "/docs/line", title: "The sealed line", group: "Concepts" },
  { href: "/docs/time", title: "The time window", group: "Concepts" },
  { href: "/docs/run", title: "How a run works", group: "On NEAR" },
  { href: "/docs/contracts", title: "The contracts", group: "On NEAR" },
  { href: "/check", title: "Check a call", group: "Trust" },
  { href: "/bench", title: "Meter-Bench", group: "Trust" },
  { href: "/docs/verify", title: "Verify a run", group: "Trust" },
  { href: "/docs/evidence", title: "Evidence behind the site", group: "Trust" },
  { href: "/docs/limits", title: "What this is not", group: "Trust" },
];

export const productPages: Record<string, Story> = {
  line: {
    eyebrow: "Product",
    title: "The line",
    lede: "After the meter opens, nothing can edit the recipient, the amount, the sentence, or the time.",
    blocks: [
      {
        heading: "What is sealed",
        body: [
          "The slip in the example is 48.00 to sable.testnet, for one sentence. Ceiling and floor stay off the sheet. That overlap is computed in the browser and moves no tokens.",
          "There is no method that edits the line after open. If the sealed account is wrong, the buyer waits for the deadline and the balance comes back.",
        ],
      },
      {
        heading: "What a wrong call does",
        body: [
          "A different account was named. The contract recorded ERR_RECIPIENT and moved 0.00.",
          "47.00 instead of 48.00 is ERR_AMOUNT. A rewritten sentence is ERR_EVIDENCE. release can call nothing else.",
        ],
      },
    ],
  },
  time: {
    eyebrow: "Product",
    title: "Time gate",
    lede: "The parties choose the time. The contract enforces stored time ≤ block time < deadline.",
    blocks: [
      {
        heading: "The window",
        body: [
          "One nanosecond before the deadline still clears. At the deadline the call is ERR_TOO_LATE.",
          "Before the stored time, a release moves 0.00 and the code is ERR_NOT_YET. The time is a clock, not proof the work was done.",
        ],
      },
      {
        heading: "The recorded run",
        body: [
          "The recipient was unregistered, so the first release after the time moved 0.00. Once that account was registered, the same line paid 48.00.",
          "A deposit at or after the deadline is rejected on this contract. An earlier meter, m718aa2, still keeps a late deposit.",
        ],
      },
    ],
  },
  key: {
    eyebrow: "Product",
    title: "Paying key",
    lede: "The key can call release only. It holds 0.50 NEAR, for gas. It cannot choose a new recipient.",
    blocks: [
      {
        heading: "What it is allowed to do",
        body: [
          "Five refusals delete it. Once the stored time has arrived, that key can pay immediately, and a delete loses if the payment lands first.",
          "No Meter server holds a signer. The name in the desk sidebar is a tab id, not a NEAR account.",
        ],
      },
      {
        heading: "What it does not check",
        body: [
          "The signed release pays when the signature matches and the meter is funded. The Intel quote was not checked. A matching signature is not a review of the work.",
        ],
      },
    ],
  },
  book: {
    eyebrow: "Product",
    title: "The book",
    lede: "A Paid figure on this site is a receipt step with a hash. A Clears mark has no hash and moves nothing.",
    blocks: [
      {
        heading: "Three receipts",
        body: [
          "The payment record, the signed release, and the time gate are three files. They are not one clock.",
          "Editing browser storage cannot create a Paid figure. node chain/verify.mjs re-reads all three. No key.",
        ],
      },
      {
        heading: "Where to read them",
        body: [
          "The book in the desk lists every line, with its code, the amount that moved, and the transaction. It can download a CSV of the same rows.",
        ],
      },
    ],
  },
};

export const howPage: Story = {
  eyebrow: "How it works",
  title: "The contract pays the sealed line, or it pays nothing.",
  lede: "Meter does not judge the work. It enforces the line the parties stored.",
  blocks: [
    {
      heading: "Four checks",
      body: [
        "Recipient. Another account moves 0.00.",
        "Amount. 47.00 does not replace 48.00.",
        "Evidence. A rewrite of the sentence moves 0.00.",
        "Time. The call has to land at or after the stored time, and before the deadline.",
      ],
    },
    {
      heading: "Then one of two things",
      body: [
        "The sealed line pays. On the recorded time gate, that payment was 48.00, after the recipient was registered.",
        "Or nothing moves. A wrong recipient, a wrong amount, a rewritten sentence, a call before the time, or a call at the deadline all leave the balance where it is. After the deadline the older meters can send it back.",
      ],
    },
  ],
};

export const securityPage: Story = {
  eyebrow: "Security",
  title: "The page does not hold the money.",
  lede: "A transfer pays whoever is named when it is sent. This contract will not.",
  blocks: [
    {
      heading: "What the contract refuses",
      body: [
        "There is no owner withdraw. The paying key can call release only, and the function-call key was deleted.",
        "Mainnet waits on an audit. The hijack runs use a toy testnet token (public mint), token.mtrfc658fd1.testnet. The medbf5c run uses Circle testnet USDC.",
      ],
    },
    {
      heading: "What a browser cannot fake",
      body: [
        "A Clears mark on the preview has no hash and moves nothing. A Paid figure is a receipt step with a hash. Editing browser storage cannot create one.",
      ],
    },
  ],
};

export const verifyPage: Story = {
  eyebrow: "Verify",
  title: "Read the three receipts. No account required.",
  lede: "The figures on the homepage are those files. node chain/verify.mjs re-reads all three.",
  blocks: [
    {
      heading: "The runs in this build",
      body: [
        "Payment record: m028a47.mtrfc658fd1.testnet. A wrong recipient moved 0.00. The sealed line paid 48.00.",
        "Signed release: m2b2440.mtrfc658fd1.testnet. The Intel quote was not checked.",
        "Time gate: m1870dd.mtrfc658fd1.testnet. Before the stored time, 0.00 moved. After it, the same line paid 48.00.",
      ],
    },
    {
      heading: "Open them",
      body: [
        "Each contract is on NEAR testnet. The book in the desk lists the steps and the transaction hashes, and can save them as a CSV.",
      ],
    },
  ],
};

export const docs: Record<string, Story & { group: string }> = {
  desk: {
    group: "Get started",
    eyebrow: "Get started",
    title: "Open the desk",
    lede: "The desk is a browser tab. It does not connect a wallet, and it does not create a key that can spend.",
    blocks: [
      {
        heading: "What the name is",
        body: [
          "Continuing gives the tab a name so one sitting can be told from the next. The name is not a NEAR account. Closing the tab drops it.",
          "Slips you seal here stay on this machine. They follow the same rule as the contract and move no tokens.",
        ],
      },
      {
        heading: "If you skip it",
        body: [
          "The payment, the refusals, and the deleted key are already on testnet. No name is required to read them. Start at Verify, or open the book.",
        ],
      },
    ],
  },
  line: {
    group: "Concepts",
    eyebrow: "Concepts",
    title: "The sealed line",
    lede: "The line is the recipient, the amount, the sentence, and the time. After open, those four do not change.",
    blocks: [
      {
        heading: "The example",
        body: [
          "Marlow Studio and Sable Field are example names. The slip shown on the homepage is 48.00. It is not the chain balance by itself. The chain balance is the receipt.",
        ],
      },
      {
        heading: "The refusals",
        body: [
          "ERR_RECIPIENT, ERR_AMOUNT, and ERR_EVIDENCE each move 0.00. The preview on The line runs the same branches in this browser and labels a clear answer Clears, which has no hash.",
        ],
      },
    ],
  },
  time: {
    group: "Concepts",
    eyebrow: "Concepts",
    title: "The time window",
    lede: "stored time ≤ block time < deadline. Both edges are the contract’s, not a person’s accept button.",
    blocks: [
      {
        heading: "The edges",
        body: [
          "The unit test is one_nanosecond_before_the_deadline_clears_and_the_deadline_does_not. Before the stored time the code is ERR_NOT_YET.",
          "Accept is not a method. The stored time does not prove the field report was done.",
        ],
      },
    ],
  },
  run: {
    group: "On NEAR",
    eyebrow: "On NEAR",
    title: "How a run works",
    lede: "A run is a list of steps. Each step has a label, a code, an amount that moved, and sometimes a transaction hash.",
    blocks: [
      {
        heading: "Paid means a transfer succeeded",
        body: [
          "Paid is set only after the token transfer succeeds. On the time gate, the first release after the time moved 0.00 because the recipient was unregistered. The next one paid 48.00.",
        ],
      },
      {
        heading: "Three files, three runs",
        body: [
          "chain.json is the payment record. tee.json is the signed release. v2.json is the time gate. They are not interchangeable.",
        ],
      },
    ],
  },
  contracts: {
    group: "On NEAR",
    eyebrow: "On NEAR",
    title: "The contracts",
    lede: "This build records three testnet contracts. The token is token.mtrfc658fd1.testnet.",
    blocks: [
      {
        heading: "Addresses",
        body: [
          "Payment record: m028a47.mtrfc658fd1.testnet.",
          "Signed release: m2b2440.mtrfc658fd1.testnet.",
          "Time gate: m1870dd.mtrfc658fd1.testnet. Previous build. install_agent on that account rejects a revoked meter. The hijack account clears the counter and installs a new key.",
        ],
      },
      {
        heading: "What they share",
        body: [
          "release pays the sealed line or moves nothing. There is no owner withdraw. Mainnet waits on an audit.",
        ],
      },
    ],
  },
  verify: {
    group: "Trust",
    eyebrow: "Trust",
    title: "Verify a run",
    lede: "You do not need an account. The hashes are on the receipt, and the contracts are on testnet.",
    blocks: [
      {
        heading: "Two ways",
        body: [
          "Open the book and follow a hash. Or run node chain/verify.mjs, which re-reads all three files and uses no key.",
        ],
      },
    ],
  },
  evidence: {
    group: "Trust",
    eyebrow: "Trust",
    title: "Evidence behind the site",
    lede: "Industry figures on the homepage link here. Each row says what a source establishes, what it does not establish, and which design choice it informed.",
    blocks: [
      {
        id: "ic3-2025",
        heading: "FBI IC3 report 2025",
        body: [
          "Establishes: 24,768 business email compromise complaints and $3,046,598,558 in reported BEC losses in 2025, per the FBI Internet Crime Report 2025.",
          "Does not establish: unreported loss, or that Meter would have stopped a specific incident.",
          "Informs: the recipient is sealed when the meter opens. On the recorded payment run, other.testnet moved 0.00 with ERR_RECIPIENT.",
        ],
      },
      {
        id: "afp-2026",
        heading: "AFP payments fraud survey 2026",
        body: [
          "Establishes: 76% of responding US organisations experienced attempted or actual payments fraud; 74% experienced business email compromise, per the AFP Payments Fraud and Control Survey 2026.",
          "Does not establish: that on-chain rules replace treasury policy, dual approval, or payee verification programmes.",
          "Informs: the homepage demos refusals with exact codes. The proof is a testnet hash, not a survey percentage.",
        ],
      },
      {
        id: "meter-run-2026-11-10",
        heading: "Recorded payment run, 10 Nov 2026",
        body: [
          "Establishes: app/public/chain.json and m028a47.mtrfc658fd1.testnet on NEAR testnet. A wrong recipient moved 0.00; the sealed line paid 48.00 with a transaction hash.",
          "Does not establish: mainnet USDC, Circle issuance, or work-quality judgment.",
          "Informs: one function moves money. If the check throws, the spend is blocked where value moves.",
        ],
      },
      {
        heading: "Repository copy",
        body: [
          "The same table lives at docs/evidence.md in the repo for judges reading GitHub.",
          "Do not cite a figure on the site without a matching row.",
        ],
      },
    ],
  },
  limits: {
    group: "Trust",
    eyebrow: "Trust",
    title: "What this is not",
    lede: "The limits are part of the product. A page that hides them is describing a different contract.",
    blocks: [
      {
        heading: "Not a judgment of the work",
        body: [
          "The time is a clock. The signature checks that a line matches. Neither one checks the field report. The model repeated a line this repo wrote.",
        ],
      },
      {
        heading: "Not mainnet USDC",
        body: [
          "The token is a testnet token. A server does not hold the paying key. The desk does not decide a payment. Only a receipt step with a hash did.",
        ],
      },
    ],
  },
};

export const docsOverview: Story = {
  eyebrow: "Docs",
  title: "The sealed line, the window, and the receipts.",
  lede: "Start with the desk if you want to try a refusal. Start with Verify if you want the transactions that already happened.",
  blocks: [
    {
      heading: "How the docs are split",
      body: [
        "Get started opens the desk. Concepts are the line and the window. On NEAR is a run and the three contracts. Trust is how to check a receipt, the evidence behind cited figures, and the limits.",
      ],
    },
  ],
};
