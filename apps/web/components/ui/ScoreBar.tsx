import { cn } from "@/lib/cn";
import { channelStyle, type Channel } from "@/lib/channels";

/** The score meter, the same shape everywhere so bar lengths compare across surfaces. */
export function ScoreBar({
  score,
  maxScore,
  channel,
  label,
  className,
}: {
  score: number;
  maxScore: number;
  channel: Channel;
  /** What this bar measures, for anyone who can't see its length. */
  label?: string;
  className?: string;
}) {
  const pct = maxScore > 0 ? Math.max(2, Math.round((score / maxScore) * 100)) : 0;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={Math.round(score * 1000) / 1000}
      aria-valuemin={0}
      aria-valuemax={Math.round(maxScore * 1000) / 1000}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-panel-2", className)}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%`, ...channelStyle(channel) }}
      />
    </div>
  );
}
