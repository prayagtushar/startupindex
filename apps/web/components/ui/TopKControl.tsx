"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/cn";

export function TopKControl({
  value,
  onChange,
  min = 1,
  max = 20,
  className,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  className?: string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <div
      className={cn(
        "flex items-center gap-0.5 rounded-card border border-line bg-panel p-0.5",
        className,
      )}
    >
      <Step
        label="Fewer results"
        disabled={value <= min}
        onClick={() => onChange(clamp(value - 1))}
      >
        <Minus size={13} />
      </Step>
      <span className="min-w-7 text-center font-mono text-sm tabular-nums text-ink">
        {value}
      </span>
      <Step
        label="More results"
        disabled={value >= max}
        onClick={() => onChange(clamp(value + 1))}
      >
        <Plus size={13} />
      </Step>
    </div>
  );
}

function Step({
  children,
  label,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-6 w-6 items-center justify-center rounded-card text-muted transition-colors hover:bg-panel-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}
