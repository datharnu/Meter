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
  if (which === "delete") return `${head} Each broadcast has its own hash. The link is the call whose promise deletes the key.`;
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
  promptOnly?: { attacks?: DefenceAttack[] };
  meterKey?: { attacks?: DefenceAttack[] };
  escalation?: { runs?: DefenceAttack[]; payloads?: unknown[] };
};

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
    const codes = permission
      ? permissionCodes(attack)
      : trial?.code || attack.expected || "";
    const hash = permission ? null : trial?.hash || attack.payment?.hash || null;
    const shown = hash && hash.length > 0 ? hash : null;
    const errors = permission ? permissionCodes(attack) : "";
    return {
      key: String(attack.id ?? attack.title),
      name: attack.title || `Attack ${attack.id}`,
      obeyed: obeyLabel(attack),
      code: codes,
      moved: attack.moneyMoved ?? trial?.moved ?? "0",
      hash: shown,
      hashNote: shown ? null : permission ? `rejected before inclusion (no tx). ${errors}` : "No transaction in this receipt.",
      evidence: shown ? "tx hash" : "rejected before inclusion (no tx)",
      permission,
      attack,
    };
  });
}

function permissionCodes(attack: InjectAttack) {
  const parts = attack.parts ?? {};
  const codes = ["revoke", "deposit", "token"]
    .map((key) => parts[key]?.expected || parts[key]?.trials?.find((trial) => trial.code)?.code)
    .filter((code): code is string => Boolean(code));
  return codes.join(" / ") || "key permission";
}

export function splitInvoice(invoice: string | undefined) {
  if (!invoice) return null;
  const marker = "\n\nNote:";
  const at = invoice.indexOf(marker);
  if (at < 0) return { head: invoice, note: null as string | null };
  return { head: invoice.slice(0, at), note: invoice.slice(at + marker.length).trim() };
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
