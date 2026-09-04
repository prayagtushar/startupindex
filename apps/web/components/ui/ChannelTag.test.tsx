import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChannelTag } from "./ChannelTag";
import { ScoreBar } from "./ScoreBar";
import { CHANNEL_LABELS, CHANNEL_SIGILS } from "@/lib/channels";

/**
 * The four channel hues sit at equal luminance by design, so colour alone
 * cannot tell them apart in grayscale or to a colour-blind reader. These
 * assertions are what stop the sigil from being "tidied away" later.
 */
describe("ChannelTag", () => {
  it("carries the channel in text, not only in colour", () => {
    render(<ChannelTag channel="keyword" />);
    expect(screen.getByText(CHANNEL_SIGILS.keyword)).toBeInTheDocument();
  });

  it("names the channel for a reader who cannot see the sigil either", () => {
    render(<ChannelTag channel="fusion" />);
    expect(screen.getByText(CHANNEL_LABELS.fusion)).toBeInTheDocument();
  });

  it("gives each channel a distinct sigil", () => {
    const sigils = Object.values(CHANNEL_SIGILS);
    expect(new Set(sigils).size).toBe(sigils.length);
  });
});

describe("ScoreBar", () => {
  it("exposes its value, so the bar length is not the only way to read it", () => {
    render(
      <ScoreBar score={0.42} maxScore={0.84} channel="vector" label="Vector score for Ola" />,
    );
    const meter = screen.getByRole("meter", { name: "Vector score for Ola" });
    expect(meter).toHaveAttribute("aria-valuenow", "0.42");
    expect(meter).toHaveAttribute("aria-valuemax", "0.84");
  });
});
