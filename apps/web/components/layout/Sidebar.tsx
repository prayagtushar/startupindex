"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { NAV, activeNav } from "./nav";
import { Logo } from "./Logo";
import { ConversationList } from "./ConversationList";
import { ThemeToggle } from "./ThemeToggle";
import { ModeSelector } from "@/components/ui/ModeSelector";
import { TopKControl } from "@/components/ui/TopKControl";
import { useConversations } from "@/lib/store/conversations";
import { useSettings } from "@/lib/store/settings";
import { cn } from "@/lib/cn";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { newConversation } = useConversations();
  const { mode, topK, setMode, setTopK, showRetrievalTrace, setShowRetrievalTrace } = useSettings();
  const active = activeNav(pathname);

  // Only pages that retrieve get the controls. Matched on path, since activeNav maps chat to "/".
  const showRetrievalControls =
    pathname === "/" || pathname.startsWith("/chat") || pathname.startsWith("/search");

  const startNewChat = () => {
    newConversation();
    router.push("/chat");
    onNavigate?.();
  };

  return (
    <div className="flex h-full w-full flex-col bg-base">
      <div className="flex h-13 items-center gap-2 px-4">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-card transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base"
        >
          <Logo />
          <span className="label text-ink">StartupIndex</span>
        </Link>
      </div>

      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={startNewChat}
          className="flex h-9 w-full items-center gap-2 rounded-card border border-line px-3 text-sm font-medium text-ink transition-colors hover:bg-panel-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base"
        >
          <Plus size={15} className="text-faint" />
          New chat
        </button>
      </div>

      <nav className="flex flex-col gap-0.5 px-3 pb-1">
        {NAV.map((item) => {
          const isActive = active?.href === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-card px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-panel-2 font-medium text-ink"
                  : "text-muted hover:bg-panel-2 hover:text-ink",
              )}
            >
              <Icon
                size={15}
                className={isActive ? "text-ink" : "text-faint"}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-1 min-h-0 flex-1 overflow-y-auto px-3">
        <p className="label px-3 pb-1 pt-3">History</p>
        <ConversationList onNavigate={onNavigate} />
      </div>

      <div className="space-y-3 border-t border-line p-3">
        {showRetrievalControls && (
        <div className="space-y-1.5">
          <p className="label px-0.5">Retrieval</p>
          <ModeSelector value={mode} onChange={setMode} />
          <div className="flex items-center justify-between px-0.5">
            <span className="label">Top K</span>
            <TopKControl value={topK} onChange={setTopK} />
          </div>
          <div className="flex items-center justify-between px-0.5 pt-2">
            <span id="trace-toggle-label" className="label">Trace</span>
            <button
              type="button"
              role="switch"
              aria-checked={showRetrievalTrace}
              aria-labelledby="trace-toggle-label"
              onClick={() => setShowRetrievalTrace(!showRetrievalTrace)}
              className={cn(
                "inline-flex h-6 w-10 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base",
                showRetrievalTrace ? "bg-ink" : "bg-line",
              )}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 rounded-full bg-base transition-transform",
                  showRetrievalTrace ? "translate-x-5" : "translate-x-1",
                )}
              />
            </button>
          </div>
        </div>
        )}
        <div
          className={cn(
            "flex items-center justify-between",
            showRetrievalControls && "border-t border-line pt-3",
          )}
        >
          <span className="label">Theme</span>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
