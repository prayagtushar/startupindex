import { cn } from "@/lib/cn";
import { Slot } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "outline" | "ghost" | "subtle";
type Size = "sm" | "md" | "icon" | "iconSm";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-base hover:opacity-90",
  outline: "border border-line text-ink hover:border-line-strong hover:bg-panel-2",
  ghost: "text-muted hover:text-ink hover:bg-panel-2",
  subtle: "bg-panel-2 text-ink hover:bg-line-strong",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-sm rounded-card gap-1.5",
  md: "h-9 px-4 text-sm rounded-card gap-2",
  icon: "h-9 w-9 rounded-card",
  iconSm: "h-7 w-7 rounded-card",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
}

export function Button({
  variant = "outline",
  size = "md",
  className,
  type = "button",
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      type={asChild ? undefined : type}
      className={cn(
        "inline-flex select-none items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base disabled:pointer-events-none disabled:opacity-40",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}
