import { describe, it, expect } from "vitest";
import {
  parseCard,
  cardLabel,
  actionButtons,
  raisePresets,
  isGameOver,
  gameOverMessage,
  isRedCard,
} from "./logic";

const state = (over: any = {}) => ({
  seq: 0,
  pot: 3,
  big_blind: 2,
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

describe("isRedCard", () => {
  it("is true for hearts and diamonds (backend symbol form)", () => {
    expect(isRedCard("A♥")).toBe(true);
    expect(isRedCard("K♦")).toBe(true);
  });
  it("is false for clubs and spades", () => {
    expect(isRedCard("A♠")).toBe(false);
    expect(isRedCard("K♣")).toBe(false);
  });
  it("also accepts the letter form", () => {
    expect(isRedCard("Ah")).toBe(true);
    expect(isRedCard("Kd")).toBe(true);
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

describe("game over", () => {
  const over = (heroStack: number, botStack: number) => ({
    hand_complete: true,
    hero: { stack: heroStack },
    bot: { stack: botStack },
  });
  it("is not over mid-hand even with a zero stack", () => {
    expect(isGameOver({ hand_complete: false, hero: { stack: 0 }, bot: { stack: 0 } })).toBe(
      false,
    );
  });
  it("is not over while both have chips", () => {
    expect(isGameOver(over(100, 100))).toBe(false);
  });
  it("is over when either stack hits zero", () => {
    expect(isGameOver(over(0, 200))).toBe(true);
    expect(isGameOver(over(200, 0))).toBe(true);
  });
  it("messages the winner correctly", () => {
    expect(gameOverMessage(over(0, 200))).toMatch(/out of chips/);
    expect(gameOverMessage(over(200, 0))).toMatch(/broke the bot/);
  });
});

describe("raisePresets", () => {
  const bet = { min: 4, max: 200 };
  it("includes the five presets clamped to [min, max]", () => {
    const p = raisePresets(state(), bet);
    expect(p.map((x) => x.label)).toEqual([
      "Min raise",
      "1/2 pot",
      "3/4 pot",
      "Pot",
      "All in",
    ]);
    expect(p.find((x) => x.key === "min")!.amount).toBe(4);
    expect(p.find((x) => x.key === "allin")!.amount).toBe(200);
  });
  it("computes a pot-sized raise-to (current_bet + pot + to_call)", () => {
    // current_bet 2 + (pot 3 + to_call 1) = 6
    expect(raisePresets(state(), bet).find((x) => x.key === "pot")!.amount).toBe(
      6,
    );
  });
  it("clamps the half-pot preset up to the minimum", () => {
    // 2 + 0.5*(3+1) = 4, exactly the min
    expect(
      raisePresets(state(), bet).find((x) => x.key === "half")!.amount,
    ).toBe(4);
  });
});
