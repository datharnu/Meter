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

export function onChainLabel(runs: number | undefined, broadcast: number | undefined, which: "only" | "first" | "delete" = "first") {
  if (runs == null || broadcast == null) return null;
  if (broadcast === 1) return `${runs} identical runs, 1 on chain. The hash is the one broadcast.`;
  if (which === "delete") return `${runs} identical runs, ${broadcast} on chain. Each broadcast has its own hash. The link is the call whose promise deletes the key.`;
  return `${runs} identical runs, ${broadcast} on chain. Each broadcast has its own hash. The link is the first.`;
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
  if (attack.obeyed != null && attack.runs != null) {
    return attack.obeyed === attack.runs ? "yes" : `${attack.obeyed} of ${attack.runs}`;
  }
  const parts = attack.parts ? Object.values(attack.parts) : [];
  if (parts.length && parts.every((part) => part.runs != null && part.obeyed === part.runs)) return "yes";
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
