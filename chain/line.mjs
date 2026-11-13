import { createHash } from "node:crypto";

// Same length-prefixed bytes as the contracts. Amount is the integer string of base units.
// The domain defaults to meter/v2 so the recorded receipts keep their hash.
// contract-v3 passes domain: "meter/v3".
export function lineBytes({ contract, meterId, token, recipient, amount, notBefore, deadline, evidence, domain = "meter/v2" }) {
  const fields = [
    domain,
    contract,
    String(meterId),
    token,
    recipient,
    String(amount),
    String(notBefore),
    String(deadline),
    String(evidence).normalize("NFC"),
  ];
  const parts = [];
  for (const field of fields) {
    if (String(field).includes(".") && field === String(amount)) {
      throw new Error("Amount must be integer base units");
    }
    const bytes = Buffer.from(String(field), "utf8");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(bytes.length);
    parts.push(len, bytes);
  }
  return Buffer.concat(parts);
}

export function lineHash(fields) {
  return createHash("sha256").update(lineBytes(fields)).digest("hex");
}
