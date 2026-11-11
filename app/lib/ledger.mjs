function units(amount) {
  try {
    return BigInt(amount && /^-?\d+$/.test(String(amount)) ? String(amount) : "0");
  } catch {
    return BigInt(0);
  }
}

// A paid or returned mark counts only when the step names a transaction hash.
export function tallyUnits(steps) {
  let paid = BigInt(0);
  let back = BigInt(0);
  let stopped = 0;
  for (const step of steps) {
    if (step.code === "OK" && /paid/i.test(step.label) && step.hash) paid += units(step.moved);
    else if (/return/i.test(step.label) && step.hash) back += units(step.moved);
    else if (String(step.code).startsWith("ERR_")) stopped += 1;
  }
  return { paid, back, stopped };
}
