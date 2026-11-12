"use client";

import { useCallback, useEffect, useState } from "react";
import type { InjectReceipt } from "@/lib/hijack";

type State = "loading" | "empty" | "error" | "ready";

export function useInject() {
  const [state, setState] = useState<State>("loading");
  const [receipt, setReceipt] = useState<InjectReceipt | null>(null);
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => {
    setState("loading");
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/inject.json", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const body = await response.json();
        if (!body?.contract || !Array.isArray(body?.attacks) || !body?.baseline) {
          setReceipt(null);
          setState("empty");
          return;
        }
        setReceipt(body);
        setState("ready");
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setReceipt(null);
        setState("error");
      });
    return () => controller.abort();
  }, [attempt]);

  return { state, receipt, reload };
}
