import { cn } from "@/lib/cn";
import { CHANNEL_LABELS, CHANNEL_SIGILS, channelStyle, type Channel } from "@/lib/channels";

/** The channel's mark: hue for the glance, two letters for everything else. */
export function ChannelTag({
  channel,
  className,
}: {
  channel: Channel;
  className?: string;
}) {
  return (
    <span
      className={cn("sigil", className)}
      style={channelStyle(channel)}
      title={CHANNEL_LABELS[channel]}
    >
      <span className="sr-only">{CHANNEL_LABELS[channel]}</span>
      <span aria-hidden>{CHANNEL_SIGILS[channel]}</span>
    </span>
  );
}
