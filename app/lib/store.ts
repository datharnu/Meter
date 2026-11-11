"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Attempt, Meter } from "./types";

type Desk = {
  ready: boolean;
  meters: Meter[];
  setReady: () => void;
  add: (meter: Meter) => void;
  patch: (id: string, next: Partial<Meter>) => void;
  pushAttempt: (id: string, attempt: Attempt) => void;
  clear: () => void;
};

export const useDesk = create<Desk>()(
  persist(
    (set) => ({
      ready: false,
      meters: [],
      setReady: () => set({ ready: true }),
      add: (meter) => set((s) => ({ meters: [meter, ...s.meters] })),
      patch: (id, next) =>
        set((s) => ({
          meters: s.meters.map((m) => (m.id === id ? { ...m, ...next } : m)),
        })),
      pushAttempt: (id, attempt) =>
        set((s) => ({
          meters: s.meters.map((m) => (m.id === id ? { ...m, attempts: [...m.attempts, attempt] } : m)),
        })),
      clear: () => set({ meters: [] }),
    }),
    {
      name: "meter-desk",
      partialize: (s) => ({ meters: s.meters }),
      onRehydrateStorage: () => (state) => state?.setReady(),
    },
  ),
);
