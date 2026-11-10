"use client";

import { use } from "react";
import { Invoice } from "@/components/Invoice";

export default function MeterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Invoice id={id} />;
}
