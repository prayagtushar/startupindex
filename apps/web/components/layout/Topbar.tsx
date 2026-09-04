"use client";

import { usePathname } from "next/navigation";
import { Menu, PanelLeft } from "lucide-react";
import { activeNav } from "./nav";
import { ThemeToggle } from "./ThemeToggle";
import { Kbd } from "@/components/ui/Kbd";

export function Topbar({
  onMenu,
  onToggleSidebar,
}: {
  onMenu: () => void;
  onToggleSidebar: () => void;
}) {
  const pathname = usePathname();
  const active = activeNav(pathname);

  return (
    <header className="flex h-13 shrink-0 items-center justify-between gap-3 border-b border-line px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onMenu}
          aria-label="Open navigation"
          className="inline-flex h-8 w-8 items-center justify-center rounded-card text-muted transition-colors hover:bg-panel-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base lg:hidden"
        >
          <Menu size={16} />
        </button>
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
          className="hidden h-8 w-8 items-center justify-center rounded-card text-muted transition-colors hover:bg-panel-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base lg:inline-flex"
        >
          <PanelLeft size={16} />
        </button>
        <span className="label ml-1 truncate">
          {active?.label ?? "StartupIndex"}
        </span>
      </div>

      {/* The retrieval mode lives in the sidebar, where it can also be changed.
          Showing it here as well put the same state on screen twice. */}
      <div className="flex items-center gap-2">
        <span className="hidden items-center gap-1 md:flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
        <ThemeToggle />
      </div>
    </header>
  );
}
