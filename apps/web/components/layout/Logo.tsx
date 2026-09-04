import { cn } from "@/lib/cn";

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-card bg-ink text-base",
        className,
      )}
      aria-hidden
    >
      <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 0.5l1.7 4.1 4.1 1.7-4.1 1.7L8 12.1 6.3 8 2.2 6.3 6.3 4.6 8 0.5z" />
        <circle cx="2.4" cy="13.4" r="1.25" />
        <circle cx="13.6" cy="13.4" r="1.25" />
        <circle cx="13.6" cy="2.4" r="1" opacity="0.6" />
      </svg>
    </span>
  );
}
