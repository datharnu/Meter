/** Desk copy of the contract rule. Amounts are token units (6 decimals). */

export const CODES = {
  Ok: "OK",
  AlreadySigned: "ERR_ALREADY_SIGNED",
  NeedBoth: "ERR_NEED_BOTH",
  NotBuyer: "ERR_NOT_BUYER",
  NotLocked: "ERR_NOT_LOCKED",
  Recipient: "ERR_RECIPIENT",
  Amount: "ERR_AMOUNT",
  Evidence: "ERR_EVIDENCE",
  AlreadyPaid: "ERR_ALREADY_PAID",
  TooEarly: "ERR_TOO_EARLY",
  TooLate: "ERR_TOO_LATE",
};

export function slip(buyer, vendor) {
  if (buyer.evidence.trim() !== vendor.evidence.trim()) return null;
  if (buyer.recipient.trim() !== vendor.recipient.trim()) return null;
  if (buyer.max < vendor.min || vendor.min <= 0) return null;
  return {
    buyer: buyer.account.trim(),
    vendor: vendor.account.trim(),
    recipient: vendor.recipient.trim(),
    amount: vendor.min,
    evidence: buyer.evidence.trim(),
    deadline: buyer.deadline,
  };
}

export function phase(deal, now) {
  if (deal.paid > 0 || deal.refunded > 0) return "Closed";
  if (deal.buyerSigned && deal.vendorSigned && deal.funded === deal.amount) return "Locked";
  if (deal.buyerSigned && deal.vendorSigned) return "Signed";
  if (now >= deal.deadline && deal.funded === 0) return "Sealed";
  return "Sealed";
}

export function sign(deal, who) {
  if (who === "buyer" && deal.buyerSigned) return CODES.AlreadySigned;
  if (who === "vendor" && deal.vendorSigned) return CODES.AlreadySigned;
  if (who === "buyer") deal.buyerSigned = true;
  if (who === "vendor") deal.vendorSigned = true;
  return CODES.Ok;
}

export function fund(deal, amount) {
  if (!deal.buyerSigned || !deal.vendorSigned) return { code: CODES.NeedBoth, kept: 0, change: amount };
  if (deal.paid > 0 || deal.refunded > 0) return { code: CODES.AlreadyPaid, kept: 0, change: amount };
  const room = deal.amount - deal.funded;
  const take = Math.min(amount, room);
  deal.funded += take;
  return { code: CODES.Ok, kept: take, change: amount - take };
}

export function decide(deal, recipient, amount, evidence, now) {
  if (deal.paid > 0 || deal.refunded > 0) return CODES.AlreadyPaid;
  if (!(deal.buyerSigned && deal.vendorSigned && deal.funded === deal.amount)) return CODES.NotLocked;
  if (now >= deal.deadline) return CODES.TooLate;
  if (recipient !== deal.recipient) return CODES.Recipient;
  if (amount !== deal.amount) return CODES.Amount;
  if (evidence !== deal.evidence) return CODES.Evidence;
  return CODES.Ok;
}

export function release(deal, recipient, amount, evidence, now) {
  const code = decide(deal, recipient, amount, evidence, now);
  if (code !== CODES.Ok) return { code, moved: 0 };
  deal.paid = amount;
  return { code, moved: amount };
}

export function refund(deal, now) {
  if (deal.paid > 0 || deal.refunded > 0) return { code: CODES.AlreadyPaid, moved: 0 };
  if (!(deal.buyerSigned && deal.vendorSigned) || deal.funded === 0) return { code: CODES.NotLocked, moved: 0 };
  if (now < deal.deadline) return { code: CODES.TooEarly, moved: 0 };
  deal.refunded = deal.funded;
  return { code: CODES.Ok, moved: deal.funded };
}

export function formatUsdc(units) {
  const whole = Math.trunc(units / 1_000_000);
  const frac = String(Math.abs(units % 1_000_000)).padStart(6, "0").slice(0, 2);
  return `${whole}.${frac}`;
}

export function parseUsdc(text) {
  const [a, b = ""] = String(text).trim().split(".");
  if (!/^\d+$/.test(a) || (b && !/^\d+$/.test(b))) return null;
  const frac = (b + "000000").slice(0, 6);
  return Number(a) * 1_000_000 + Number(frac);
}
