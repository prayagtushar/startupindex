"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { RetrievalMode } from "@/lib/types";
import { readStored, writeStored } from "@/lib/storage";

const STORAGE_KEY = "settings";

interface Settings {
  mode: RetrievalMode;
  topK: number;
  showRetrievalTrace: boolean;
}

const DEFAULTS: Settings = { mode: "vector", topK: 5, showRetrievalTrace: true };

interface SettingsContextValue extends Settings {
  setMode: (mode: RetrievalMode) => void;
  setTopK: (topK: number) => void;
  setShowRetrievalTrace: (show: boolean) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function persist(next: Settings) {
  writeStored(STORAGE_KEY, JSON.stringify(next));
}

function clampTopK(n: number): number {
  if (Number.isNaN(n)) return DEFAULTS.topK;
  return Math.min(20, Math.max(1, Math.round(n)));
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);

  useEffect(() => {
    try {
      const raw = readStored(STORAGE_KEY);
      if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {
      
    }
  }, []);

  const setMode = useCallback((mode: RetrievalMode) => {
    setSettings((prev) => {
      const next = { ...prev, mode };
      persist(next);
      return next;
    });
  }, []);

  const setTopK = useCallback((topK: number) => {
    setSettings((prev) => {
      const next = { ...prev, topK: clampTopK(topK) };
      persist(next);
      return next;
    });
  }, []);

  const setShowRetrievalTrace = useCallback((showRetrievalTrace: boolean) => {
    setSettings((prev) => {
      const next = { ...prev, showRetrievalTrace };
      persist(next);
      return next;
    });
  }, []);

  return (
    <SettingsContext.Provider value={{ ...settings, setMode, setTopK, setShowRetrievalTrace }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within <SettingsProvider>");
  return ctx;
}
