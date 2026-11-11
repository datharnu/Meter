import { createHash } from "node:crypto";

// Same bytes as contract-v2/src/rule.rs `line_bytes`. Amount is the integer string of base units.
export function lineBytes({ contract, meterId, token, recipient, amount, notBefore, deadline, evidence }) {
  const fields = [
    "meter/v2",
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
