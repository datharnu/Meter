"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { mandateSchema, type MandateInput } from "@/app/utils/SchemaData";
import { parseUsdc, slip } from "@/lib/rule.mjs";
import { useDesk } from "@/lib/store";

const defaults: MandateInput = {
  buyerName: "Marlow Studio",
  buyer: "marlow.testnet",
  buyerMax: "60.00",
  vendorName: "Sable Field",
  vendor: "sable.testnet",
  vendorMin: "48.00",
  recipient: "sable.testnet",
  evidence: "Field report 04, price column at most 100",
  minutes: 15,
};

export default function NewMeter() {
  const router = useRouter();
  const add = useDesk((s) => s.add);
  const form = useForm<MandateInput>({ resolver: zodResolver(mandateSchema), defaultValues: defaults });
  const error = form.formState.errors;

  function onSubmit(values: MandateInput) {
    const max = parseUsdc(values.buyerMax);
    const min = parseUsdc(values.vendorMin);
    if (max == null || min == null) return;
    const agreed = slip(
      { account: values.buyer, max, evidence: values.evidence, recipient: values.recipient, deadline: Date.now() + values.minutes * 60_000 },
      { account: values.vendor, min, evidence: values.evidence, recipient: values.recipient },
    );
    if (!agreed) {
      form.setError("root", { message: "No slip. The ceiling, the floor, the evidence, or the recipient do not meet." });
      return;
    }
    const id = crypto.randomUUID();
    add({
      id,
      buyerName: values.buyerName,
      vendorName: values.vendorName,
      buyer: agreed.buyer,
      vendor: agreed.vendor,
      recipient: agreed.recipient,
      amount: agreed.amount,
      evidence: agreed.evidence,
      deadline: agreed.deadline,
      buyerSigned: false,
      vendorSigned: false,
      funded: 0,
      paid: 0,
      refunded: 0,
      clock: Date.now(),
      attempts: [],
    });
    router.push(`/m/${id}`);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">New slip</h1>
          <p className="lede">Each company writes a limit. The sheet that follows shows only the price they both can live with.</p>
        </div>
      </div>
      <form className="panel form-narrow" onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <div className="form-grid">
          <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
            <legend>Buyer</legend>
            <label>Name<input {...form.register("buyerName")} /></label>
            <label>Account<input {...form.register("buyer")} spellCheck={false} /></label>
            <label>Ceiling, USDC<input {...form.register("buyerMax")} inputMode="decimal" /></label>
          </fieldset>
          <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
            <legend>Vendor</legend>
            <label>Name<input {...form.register("vendorName")} /></label>
            <label>Account<input {...form.register("vendor")} spellCheck={false} /></label>
            <label>Floor, USDC<input {...form.register("vendorMin")} inputMode="decimal" /></label>
          </fieldset>
        </div>
        <label>Recipient<input {...form.register("recipient")} spellCheck={false} /></label>
        <label>Evidence both will accept<input {...form.register("evidence")} /></label>
        <label>Deadline, minutes<input type="number" {...form.register("minutes")} /></label>
        {error.root && <p className="alert" role="alert">{error.root.message}</p>}
        {Object.values(error).filter((e) => e?.message && e !== error.root).slice(0, 1).map((e) => (
          <p className="alert" role="alert" key={e.message}>{e.message}</p>
        ))}
        <button className="btn" type="submit">Seal</button>
        <p className="note">The ceiling and the floor are not copied onto the meter. This overlap is computed in the browser. It is not an enclave attestation.</p>
      </form>
    </>
  );
}
