"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  SlidersHorizontal,
  SunMoon,
  type LucideIcon,
} from "lucide-react";
import { NAV } from "./nav";
import { Kbd } from "@/components/ui/Kbd";
import { useConversations } from "@/lib/store/conversations";
import { useSettings } from "@/lib/store/settings";
import { useTheme } from "@/lib/theme";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { RETRIEVAL_MODES } from "@/lib/types";
import { cn } from "@/lib/cn";

interface Action {
  id: string;
  label: string;
  icon: LucideIcon;
  run: () => void;
}

const LISTBOX_ID = "command-palette-list";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const router = useRouter();
  const { newConversation } = useConversations();
  const { setMode } = useSettings();
  const { toggle: toggleTheme } = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  // Holds Tab inside the dialog, handles Escape, and restores focus on close.
  useFocusTrap(dialogRef, open, close);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  const actions = useMemo<Action[]>(() => {
    return [
      {
        id: "new",
        label: "New chat",
        icon: Plus,
        run: () => {
          newConversation();
          router.push("/chat");
          close();
        },
      },
      ...NAV.map((n) => ({
        id: `nav-${n.href}`,
        label: `Go to ${n.label}`,
        icon: n.icon,
        run: () => {
          router.push(n.href);
          close();
        },
      })),
      ...RETRIEVAL_MODES.map((m) => ({
        id: `mode-${m}`,
        label: `Set mode: ${m}`,
        icon: SlidersHorizontal,
        run: () => {
          setMode(m);
          close();
        },
      })),
      {
        id: "theme",
        label: "Toggle theme",
        icon: SunMoon,
        run: () => {
          toggleTheme();
          close();
        },
      },
    ];
  }, [router, newConversation, setMode, toggleTheme, close]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? actions.filter((a) => a.label.toLowerCase().includes(q)) : actions;
  }, [actions, query]);

  useEffect(() => setIndex(0), [query]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[index]?.run();
    }
  };

  const activeId = filtered[index] ? `cmd-${filtered[index].id}` : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]" onClick={close} />
      <div
        ref={dialogRef}
        className="relative w-full max-w-lg overflow-hidden rounded-card border border-line bg-panel shadow-[var(--shadow-panel)] animate-rise-in"
      >
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search size={15} className="text-faint" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a command…"
            aria-label="Command"
            // The list is elsewhere in the DOM, so the input has to name what it drives.
            role="combobox"
            aria-expanded
            aria-controls={LISTBOX_ID}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            className="h-11 w-full bg-transparent text-base text-ink placeholder:text-faint focus:outline-none"
          />
          <Kbd>ESC</Kbd>
        </div>
        <ul id={LISTBOX_ID} role="listbox" aria-label="Commands" className="max-h-72 overflow-y-auto p-1.5">
          {filtered.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-faint">
              No matching commands.
            </li>
          )}
          {filtered.map((a, i) => {
            const Icon = a.icon;
            const selected = i === index;
            return (
              <li key={a.id} id={`cmd-${a.id}`} role="option" aria-selected={selected}>
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseEnter={() => setIndex(i)}
                  onClick={a.run}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-card px-3 py-2 text-left text-sm transition-colors",
                    selected ? "bg-panel-2 text-ink" : "text-muted",
                  )}
                >
                  <Icon size={15} className="text-faint" aria-hidden />
                  {a.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
