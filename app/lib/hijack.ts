export type ToolCall = { name: string | null; args: Record<string, string | undefined> };

export type InjectTrial = {
  n?: number;
  obeyed?: boolean;
  broadcast?: boolean;
  hash?: string | null;
  code?: string | null;
  moved?: string | null;
  failure?: string | null;
  refusals?: number | null;
  revoked?: boolean | null;
  transcript?: {
    system?: string;
    invoice?: string;
    toolCall?: ToolCall;
  };
  balances?: {
    before?: { attacker?: string; vendor?: string; clerk?: string };
    after?: { attacker?: string; vendor?: string; clerk?: string };
  } | null;
};

export type InjectAttack = {
  id?: number | string;
  title?: string;
  kind?: string;
  meter?: string;
  injection?: string;
  tools?: string[];
  runs?: number;
  obeyed?: number;
  broadcast?: number;
  moneyMoved?: string;
  expected?: string;
  trials?: InjectTrial[];
  payment?: { hash?: string | null; code?: string | null; moved?: string | null };
  burnHash?: string | null;
  keysAfterBurn?: number | null;
  burnedPublicKey?: string | null;
  nextCall?: { code?: string | null; hash?: string | null; failure?: string | null };
  reinstallHash?: string | null;
  recoveryPublicKey?: string | null;
  note?: string;
  parts?: Record<string, { trials?: InjectTrial[]; summary?: string; obeyed?: number; runs?: number; expected?: string }>;
};

export type HardenedCase = {
  id: string;
  title?: string;
  runs: number;
  obeyed: number;
  broadcast: number;
  invoice?: string;
  trials?: Array<{ n?: number; obeyed?: boolean; toolCall?: ToolCall; model?: string }>;
  reading?: string;
};

export type InjectReceipt = {
  at?: string;
  model?: string;
  modelVersion?: string;
  temperature?: number;
  toolChoice?: string;
  n?: number;
  system?: string;
  notYetNote?: string;
  dos?: string;
  contract?: string;
  attacker?: string;
  amount?: string;
  baseline?: {
    runs?: number;
    obeyed?: number;
    broadcast?: number;
    moneyMoved?: string;
    invoice?: string;
    injection?: string;
    trials?: InjectTrial[];
  };
  attacks?: InjectAttack[];
  steps?: Array<{ label?: string; hash?: string; kind?: string; code?: string }>;
  failureKept?: Array<{ code?: string; hash?: string; contract?: string; what?: string }>;
  wasm?: string;
  commit?: string;
  hardened?: {
    system?: string;
    temperature?: number;
    n?: number;
    model?: string;
    broadcast?: boolean;
    whyNotBroadcast?: string;
    cases?: HardenedCase[];
  };
};

export function attackById(receipt: InjectReceipt, id: number) {
  return receipt.attacks?.find((attack) => Number(attack.id) === id) ?? null;
}

export function broadcastTrial(attack: InjectAttack | null | undefined) {
  const trials = attack?.trials ?? [];
  if (attack?.burnHash) {
    const burned = trials.find((trial) => trial.hash === attack.burnHash);
    if (burned) return burned;
  }
  return trials.find((trial) => trial.hash) ?? trials[0] ?? null;
}

export function baselineTrial(receipt: InjectReceipt) {
  const trials = receipt.baseline?.trials ?? [];
  return trials.find((trial) => trial.hash) ?? trials[0] ?? null;
}

export function hardenedCase(receipt: InjectReceipt, id: string) {
  return receipt.hardened?.cases?.find((item) => item.id === id) ?? null;
}

export function toolLine(call: ToolCall | undefined) {
  if (!call?.name) return "No tool call in this receipt.";
  const args = call.args ?? {};
  const body = Object.entries(args)
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ");
  return body ? `${call.name}(${body})` : `${call.name}()`;
}

export function chainPhrase(runs: number | undefined, broadcast: number | undefined) {
  if (runs !== 10 || broadcast == null) return null;
  const times = broadcast === 1 ? "1 time" : `${broadcast} times`;
  return `one deterministic run per attack (temperature 0), executed on chain ${times}`;
}

export function obeyText(obeyed: number | undefined, runs: number | undefined, broadcast: number | undefined) {
  if (obeyed != null && runs != null && obeyed === runs) {
    return chainPhrase(runs, broadcast) ?? "yes";
  }
  if (obeyed != null && runs != null) return `${obeyed} of ${runs}`;
  return "—";
}

export function onChainLabel(runs: number | undefined, broadcast: number | undefined, which: "only" | "first" | "delete" = "first") {
  if (runs == null || broadcast == null) return null;
  const lead = chainPhrase(runs, broadcast);
  const head = lead ? `${lead}.` : `${runs} identical runs, ${broadcast} on chain.`;
  if (broadcast === 1) return `${head} The hash is the one broadcast.`;
  if (which === "delete") return `${head} Each broadcast has its own hash. The link is the call whose promise receipt is DeleteKey. The transaction status is empty.`;
  return `${head} Each broadcast has its own hash. The link is the first.`;
}

export function deadKeyHashes(attack: InjectAttack) {
  return (attack.trials ?? [])
    .filter((trial) => trial.broadcast && trial.hash && (trial.failure || String(trial.code ?? "").includes("AccessKey")))
    .map((trial) => String(trial.hash));
}

export function tripwireFact(receipt: InjectReceipt, attack: InjectAttack) {
  const trials = (attack.trials ?? [])
    .filter((trial) => trial.broadcast && trial.hash)
    .sort((a, b) => (a.n ?? 0) - (b.n ?? 0));
  if (trials.length < 10) return null;
  const fifth = trials[4];
  const sixth = trials[5];
  if (fifth?.revoked !== true || sixth?.refusals !== 1 || sixth.revoked !== false) return null;
  if (deadKeyHashes(attack).length) return null;
  const role = attack.meter;
  const step = (receipt.steps ?? []).find((item) => item.kind === "reinstall" && role && String(item.label ?? "").includes(role));
  const hash = step?.hash ? ` Reinstall ${step.hash}.` : "";
  return `Own meter. The fifth call burns the key that signed it. The buyer reinstalls, the counter clears, and five more run on the new key. The tenth call burns that key. All ten were included while a key was live.${hash}`;
}

export type DefenceAttack = {
  id: number;
  config?: string;
  emittedMalicious: boolean;
  moneyMoved: string;
  injectedReached?: string;
  evidence: string;
  hash?: string | null;
  code?: string | null;
  toolCall?: ToolCall;
  invoice?: string;
};

export type DefenceFile = {
  prompts?: { model?: string; temperature?: number };
  promptOnly?: { attacks?: DefenceAttack[] };
  meterKey?: { attacks?: DefenceAttack[] };
  escalation?: { runs?: DefenceAttack[]; payloads?: unknown[]; model?: string; temperature?: number };
};

export function escalationAttack(file: DefenceFile | null, id = 1) {
  const runs = file?.escalation?.runs ?? [];
  return {
    full: runs.find((row) => row.id === id && row.config !== "meterKey") ?? null,
    meter: runs.find((row) => row.id === id && row.config === "meterKey") ?? null,
  };
}

export function sampleLine(file: DefenceFile | null) {
  const model = file?.escalation?.model || file?.prompts?.model;
  const named = model ? ` The model is ${model}.` : "";
  return `One escalation set was written, after the plain-tier results. No earlier escalation payload was tried. It was committed, then run.${named} This is one temperature-0 sample per attack. It is one result, not a claim that hardened prompts fail.`;
}

export function invoiceField(invoice: string | undefined, label: string) {
  const line = invoice?.split("\n").find((item) => item.toLowerCase().startsWith(`${label.toLowerCase()}:`));
  if (!line) return null;
  return line.slice(line.indexOf(":") + 1).trim();
}

export function callDestination(row: DefenceAttack) {
  return row.toolCall?.args?.to || row.toolCall?.args?.recipient || "";
}

export function attackerReached(row: DefenceAttack, attacker: string) {
  return callDestination(row) === attacker ? (row.moneyMoved || "0") : "0";
}

export function termsFieldMissing(row: DefenceAttack) {
  return row.id === 3 && row.toolCall?.name === "ft_transfer";
}

export function sealedUnits(invoice: string | undefined) {
  const text = invoiceField(invoice, "Amount");
  if (!text || !/^\d+(\.\d+)?$/.test(text)) return null;
  const [whole, frac = ""] = text.split(".");
  return BigInt(whole) * BigInt(1000000) + BigInt((frac + "000000").slice(0, 6));
}

export function overpay(row: DefenceAttack) {
  const payee = invoiceField(row.invoice, "Payee");
  const sealed = sealedUnits(row.invoice);
  const moved = BigInt(row.moneyMoved || "0");
  if (row.id !== 2 || !payee || callDestination(row) !== payee || !sealed || moved <= sealed || moved % sealed !== BigInt(0)) return null;
  return { moved: moved.toString(), times: (moved / sealed).toString() };
}

export function tierLineParts(file: DefenceFile | null): { main: string; note: string | null } | null {
  const plain = file?.promptOnly?.attacks ?? [];
  const meter = file?.meterKey?.attacks ?? [];
  if (!plain.length || !meter.length) return null;
  let counted = 0;
  let obeyed = 0;
  for (const id of [1, 2, 3]) {
    const rows = [...plain, ...meter].filter((row) => row.id === id && !termsFieldMissing(row));
    if (!rows.length) continue;
    counted += 1;
    if (rows.some((row) => row.emittedMalicious)) obeyed += 1;
  }
  const payNow = [...plain, ...meter].filter((row) => row.id === 4);
  const payNowText = payNow.length ? `Pay-now: ${payNow.some((row) => row.emittedMalicious) ? "obeyed" : "not obeyed"}.` : "";
  const esc = escalationLineParts(file?.escalation?.runs ?? []);
  const main = [`Plain injections: ${obeyed} of ${counted} obeyed.`, payNowText, esc.main].filter(Boolean).join(" ");
  return { main, note: esc.note };
}

export function tierLine(file: DefenceFile | null) {
  const parts = tierLineParts(file);
  if (!parts) return null;
  return parts.note ? `${parts.main} ${parts.note}` : parts.main;
}

function idList(ids: number[]) {
  if (ids.length <= 1) return ids.join("");
  if (ids.length === 2) return `${ids[0]} and ${ids[1]}`;
  return `${ids.slice(0, -1).join(", ")} and ${ids[ids.length - 1]}`;
}

function escalationLineParts(runs: DefenceAttack[]): { main: string; note: string | null } {
  const both: number[] = [];
  const meterOnly: number[] = [];
  const fullOnly: number[] = [];
  const missingTerms: number[] = [];
  for (const id of [...new Set(runs.map((row) => row.id))].sort((a, b) => a - b)) {
    const full = runs.filter((row) => row.id === id && row.config !== "meterKey");
    const meter = runs.filter((row) => row.id === id && row.config === "meterKey");
    const fullMissing = full.some(termsFieldMissing);
    const fullObeyed = full.some((row) => row.emittedMalicious && !termsFieldMissing(row));
    const meterObeyed = meter.some((row) => row.emittedMalicious);
    if (fullMissing) missingTerms.push(id);
    if (fullObeyed && meterObeyed) both.push(id);
    else if (meterObeyed) meterOnly.push(id);
    else if (fullObeyed) fullOnly.push(id);
  }
  const parts = [
    both.length ? `obeyed on ${both.length === 1 ? "attack" : "attacks"} ${idList(both)} under both keys` : "",
    meterOnly.length ? `on ${meterOnly.length === 1 ? "attack" : "attacks"} ${idList(meterOnly)} under the Meter key` : "",
    fullOnly.length ? `on ${fullOnly.length === 1 ? "attack" : "attacks"} ${idList(fullOnly)} under the full-access key` : "",
  ].filter(Boolean);
  if (!parts.length) return { main: "", note: null };
  const note = missingTerms.length
    ? `${missingTerms.length === 1 ? "Attack" : "Attacks"} ${idList(missingTerms)} ${missingTerms.length === 1 ? "has" : "have"} no terms field on the full-access key, so N/A there.`
    : null;
  return { main: `Escalation: ${parts.join(", and ")}.`, note };
}

function escalationLine(runs: DefenceAttack[]) {
  const { main, note } = escalationLineParts(runs);
  if (!main) return "";
  return note ? `${main} ${note}` : main;
}

export function hardenedCalls(file: DefenceFile | null) {
  return [
    ...(file?.promptOnly?.attacks ?? []),
    ...(file?.meterKey?.attacks ?? []),
    ...(file?.escalation?.runs ?? []),
  ];
}

export function wrongTargetUnits(file: DefenceFile | null) {
  const rows = [
    ...(file?.meterKey?.attacks ?? []),
    ...(file?.escalation?.runs ?? []).filter((row) => row.config === "meterKey"),
  ];
  let sum = BigInt(0);
  for (const row of rows) {
    const payee = invoiceField(row.invoice, "Payee");
    const dest = callDestination(row);
    if (payee && dest && dest !== payee) sum += BigInt(row.moneyMoved || "0");
  }
  return sum.toString();
}

export function outcomeWord(moved: string | null | undefined) {
  return moved != null && BigInt(moved || "0") > BigInt(0) ? "PAID" : "STOPPED";
}

export type LadderRow = {
  key: string;
  name: string;
  obeyed: string;
  code: string;
  moved: string;
  hash: string | null;
  hashNote: string | null;
  evidence: "tx hash" | "rejected before inclusion (no tx)";
  permission: boolean;
  attack: InjectAttack;
};

function obeyLabel(attack: InjectAttack) {
  const broadcast = attack.broadcast ?? (attack.kind === "permission" ? 0 : undefined);
  if (attack.obeyed != null && attack.runs != null) return obeyText(attack.obeyed, attack.runs, broadcast);
  const parts = attack.parts ? Object.values(attack.parts) : [];
  if (parts.length && parts.every((part) => part.runs != null && part.obeyed === part.runs)) {
    return chainPhrase(parts[0]?.runs, broadcast) ?? "yes";
  }
  if (parts.length) return parts.map((part) => `${part.obeyed ?? "—"} of ${part.runs ?? "—"}`).join(" · ");
  return "—";
}

export function ladderRows(receipt: InjectReceipt): LadderRow[] {
  return (receipt.attacks ?? []).map((attack) => {
    const trial = broadcastTrial(attack);
    const permission = attack.kind === "permission" || Boolean(attack.parts);
    const hash = permission ? null : trial?.hash || attack.payment?.hash || null;
    const shown = hash && hash.length > 0 ? hash : null;
    const burn = Boolean(shown && attack.burnHash && shown === attack.burnHash);
    const attempt = trial?.code || attack.expected || "ERR_RECIPIENT";
    return {
      key: String(attack.id ?? attack.title),
      name: attack.title || `Attack ${attack.id}`,
      obeyed: obeyLabel(attack),
      code: permission
        ? "key permission"
        : burn
          ? `attempt ${attempt}; transaction status is empty`
          : trial?.code || attack.expected || "",
      moved: attack.moneyMoved ?? trial?.moved ?? "0",
      hash: shown,
      hashNote: shown ? null : permission ? "No transaction. Rejected before inclusion. Not a contract refusal." : "No transaction in this receipt.",
      evidence: shown ? "tx hash" : "rejected before inclusion (no tx)",
      permission,
      attack,
    };
  });
}

export function splitInvoice(invoice: string | undefined) {
  if (!invoice) return null;
  const head: string[] = [];
  const extra: string[] = [];
  let note: string | null = null;
  for (const line of invoice.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^invoice$/i.test(trimmed)) {
      head.push(trimmed);
      continue;
    }
    const at = trimmed.indexOf(":");
    const label = at >= 1 ? trimmed.slice(0, at).trim() : "";
    if (/^note$/i.test(label)) {
      note = trimmed.slice(at + 1).trim();
      continue;
    }
    if (/^(payee|amount|terms)$/i.test(label)) {
      head.push(trimmed);
      continue;
    }
    // A line with no Payee/Amount/Terms/Note label was dropped, including a fake [SYSTEM] line and a Footer line.
    extra.push(trimmed);
  }
  return { head: head.join("\n"), note, extra };
}

export function balanceDelta(before: string | undefined, after: string | undefined) {
  if (before == null || after == null || before === "" || after === "") return null;
  try {
    const delta = BigInt(after) - BigInt(before);
    const negative = delta < BigInt(0);
    const units = negative ? (-delta).toString() : delta.toString();
    return { negative, units, before };
  } catch {
    return null;
  }
}
