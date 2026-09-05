"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { CommandPalette } from "./CommandPalette";
import { readStored, writeStored } from "@/lib/storage";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";

const COLLAPSE_KEY = "sidebar-collapsed";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);

  const closeDrawer = useCallback(() => setMobileOpen(false), []);
  useFocusTrap(drawerRef, mobileOpen, closeDrawer);

  useEffect(() => {
    setCollapsed(readStored(COLLAPSE_KEY) === "1");
  }, []);

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      const next = !c;
      writeStored(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });

  return (
    <div className="flex h-dvh overflow-hidden bg-base text-ink">
      {!collapsed && (
        <aside className="hidden w-[264px] shrink-0 border-r border-line lg:block">
          <Sidebar />
        </aside>
      )}

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]"
            onClick={closeDrawer}
          />
          <aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute left-0 top-0 h-full w-[280px] border-r border-line bg-base shadow-[var(--shadow-panel)]"
          >
            <Sidebar onNavigate={closeDrawer} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setMobileOpen(true)} onToggleSidebar={toggleCollapsed} />
        {/* No standing footer. What it said was one-time framing, and it now
            lives on the arrival screen where a first-time visitor reads it. */}
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>

      <CommandPalette />
    </div>
  );
}
