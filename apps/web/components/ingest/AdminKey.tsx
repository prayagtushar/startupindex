"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { readStored, removeStored, writeStored } from "@/lib/storage";

const STORAGE_KEY = "admin-key";

export function getAdminKey(): string {
  try {
    return readStored(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Holds the key that unlocks re-ingest. A shared secret in a browser, not authentication. */
export function AdminKey() {
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const existing = getAdminKey();
    setKey(existing);
    setSaved(Boolean(existing));
  }, []);

  const save = () => {
    try {
      if (key) writeStored(STORAGE_KEY, key);
      else removeStored(STORAGE_KEY);
      setSaved(Boolean(key));
    } catch {
      // Private browsing with storage disabled: the key just won't persist.
    }
  };

  return (
    <div className="border border-line bg-panel p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="label">admin key</span>
        <span className="font-mono text-xs text-faint">
          {saved ? "key set" : "read-only"}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Re-ingesting rewrites the corpus and runs the scrapers, so it needs the
        key. Reading is open to everyone.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="paste key"
          className="min-w-0 flex-1 border border-line bg-base px-3 py-2 font-mono text-sm text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base"
        />
        <Button variant="primary" size="sm" onClick={save}>
          Save
        </Button>
      </div>
    </div>
  );
}
