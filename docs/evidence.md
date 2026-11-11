# Evidence behind the homepage

Meter does not claim to stop business email compromise, invoice spam, or payments fraud in general. It enforces one sealed line on NEAR testnet: recipient, amount, sentence, and time. Each row below is a public source the marketing site cites, with what it does and does not support.

Checked against publisher URLs on 11 Nov 2026.

## FBI Internet Crime Report 2025 (`ic3-2025`)

**Source:** FBI Internet Crime Complaint Center, [Internet Crime Report 2025](https://www.ic3.gov/AnnualReport/Reports/2025_IC3Report.pdf) (published April 2026).

| | |
| --- | --- |
| **What it establishes** | 24,768 BEC complaints and **$3,046,598,558** in reported BEC losses in 2025. Complaints and losses in other categories are reported separately in the same document. |
| **What it does not establish** | Unreported loss, loss prevented, or anything about a specific contract on NEAR. Investment and other fraud categories dominate the headline total; BEC is the category closest to “pay the wrong party on a trusted figure.” |
| **Design decision it informs** | The payee on a sealed line does not come from a message at release time. A release that names a different account than the one stored at `open` moves **0.00** with `ERR_RECIPIENT` on the recorded payment run (10 Nov 2026). |

## AFP Payments Fraud and Control Survey 2026 (`afp-2026`)

**Source:** Association for Financial Professionals, Payments Fraud and Control Survey 2026 (cited on the AFP site and summarized in industry press; re-open the PDF from AFP when linking in production).

| | |
| --- | --- |
| **What it establishes** | **76%** of responding US organisations experienced attempted or actual payments fraud in the period surveyed; **74%** experienced business email compromise. |
| **What it does not establish** | That Meter would have blocked a specific incident, or that on-chain rules replace treasury controls, dual approval, or payee verification programmes. |
| **Design decision it informs** | The hero demo is a **refusal** (`ERR_NOT_YET`, `ERR_RECIPIENT`, etc.) with exact codes—not a dashboard green check. Industry pressure motivates the story; the proof is testnet receipts. |

## Recorded payment run, NEAR testnet (`meter-run-2026-11-10`)

**Source:** `app/public/chain.json`, contract `m028a47.mtrfc658fd1.testnet`, verified by `node chain/verify.mjs`.

| | |
| --- | --- |
| **What it establishes** | A release to `other.testnet` moved **0.00** with `ERR_RECIPIENT`. The sealed recipient `sable.testnet` then received **48.00** with hash on testnet. |
| **What it does not establish** | Mainnet deployment, USDC from Circle, or prevention of social engineering before the line is sealed. |
| **Design decision it informs** | One function moves value; if the check throws, the spend is blocked where tokens move—not in the UI. |

## How to use this page

- Homepage footnotes link here as `/docs/evidence#<id>`.
- Do not cite a figure on the site without a row in this file.
- Prefer **BEC / payments fraud** stats for “why now”; use on-chain rows for “what we proved.”
