import { z } from "zod";

const account = z.string().trim().min(2, "Enter a NEAR account").max(64).regex(/^[a-z0-9._-]+$/, "Use a lowercase NEAR account");
const money = z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Use a USDC amount like 48.00");

export const mandateSchema = z.object({
  buyerName: z.string().trim().min(2).max(48),
  buyer: account,
  buyerMax: money,
  vendorName: z.string().trim().min(2).max(48),
  vendor: account,
  vendorMin: money,
  recipient: account,
  evidence: z.string().trim().min(8, "Name the evidence both sides will accept").max(180),
  minutes: z.coerce.number().int().min(1).max(24 * 60),
});

export type MandateInput = z.infer<typeof mandateSchema>;
