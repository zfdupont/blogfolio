import { describe, it, expect } from "vitest";
import { parseCard, cardLabel, actionButtons } from "./logic";

const state = (over: any = {}) => ({
  seq: 0,
  current_bet: 2,
  hero: { current_bet: 1, stack: 199, is_actor: true },
  legal_actions: [
    { action: "fold" },
    { action: "call", amount: 1 },
    { action: "bet", min: 4, max: 200 },
    { action: "all_in", amount: 200 },
  ],
  ...over,
});

describe("cards", () => {
  it("parses a backend card string", () => {
    expect(parseCard("Ah")).toEqual({ rank: "A", suit: "h" });
  });
  it("labels a card", () => {
    expect(cardLabel("Ts")).toBe("T♠");
  });
});

describe("actionButtons", () => {
  it("includes a labeled call with its amount", () => {
    const btns = actionButtons(state());
    const call = btns.find((b) => b.key === "call");
    expect(call?.label).toBe("Call 1");
  });
  it("labels check when there is nothing to call", () => {
    const s = state({
      current_bet: 0,
      hero: { current_bet: 0, stack: 200, is_actor: true },
      legal_actions: [
        { action: "check" },
        { action: "bet", min: 2, max: 200 },
      ],
    });
    expect(actionButtons(s).find((b) => b.key === "check")?.label).toBe(
      "Check",
    );
  });
  it("carries bet min/max", () => {
    const bet = actionButtons(state()).find((b) => b.key === "bet");
    expect(bet?.min).toBe(4);
    expect(bet?.max).toBe(200);
  });
});
