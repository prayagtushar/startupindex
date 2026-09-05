import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readStored, removeStored, writeStored } from "./storage";

/**
 * Node 25 defines its own global `localStorage`, which shadows jsdom's and is
 * inert without `--localstorage-file`. An in-memory stand-in keeps these tests
 * about the migration rather than about the runtime.
 */
function memoryStorage(): Storage {
  let map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => void (map = new Map()),
  } as Storage;
}

/**
 * The app was renamed from ISRA, and its localStorage keys with it. Anyone who
 * had used it before would have lost every conversation on the next deploy, so
 * the fallback below is the part that actually matters.
 */
describe("storage", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads and writes under the current namespace", () => {
    writeStored("theme", "dark");
    expect(localStorage.getItem("startupindex:theme")).toBe("dark");
    expect(readStored("theme")).toBe("dark");
  });

  it("falls back to the pre-rename key", () => {
    localStorage.setItem("isra-conversations", '[{"id":"1"}]');
    expect(readStored("conversations")).toBe('[{"id":"1"}]');
  });

  it("migrates the old key on first read, so the fallback is paid once", () => {
    localStorage.setItem("isra-settings", '{"topK":8}');
    readStored("settings");

    expect(localStorage.getItem("startupindex:settings")).toBe('{"topK":8}');
    expect(localStorage.getItem("isra-settings")).toBeNull();
  });

  it("prefers a current value over a stale legacy one", () => {
    localStorage.setItem("isra-theme", "light");
    localStorage.setItem("startupindex:theme", "dark");
    expect(readStored("theme")).toBe("dark");
  });

  it("returns null when neither key is set", () => {
    expect(readStored("nothing-here")).toBeNull();
  });

  it("clears both spellings on remove", () => {
    localStorage.setItem("isra-admin-key", "old");
    writeStored("admin-key", "new");
    removeStored("admin-key");

    expect(localStorage.getItem("startupindex:admin-key")).toBeNull();
    expect(localStorage.getItem("isra-admin-key")).toBeNull();
  });
});
