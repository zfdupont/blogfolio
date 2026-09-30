// Pure helpers for the poker page. No React/DOM imports so they unit-test in a
// plain node environment.

export interface ActionButton {
  key: string;
  label: string;
  min?: number;
  max?: number;
  amount?: number;
}

export interface RaisePreset {
  key: string;
  label: string;
  amount: number;
}

const SUIT_SYMBOL: Record<string, string> = {
  h: "♥",
  d: "♦",
  c: "♣",
  s: "♠",
};

export function parseCard(card: string): { rank: string; suit: string } {
  return { rank: card[0], suit: card[1] };
}

export function cardLabel(card: string): string {
  const { rank, suit } = parseCard(card);
  return `${rank}${SUIT_SYMBOL[suit] ?? suit}`;
}

export function formatNet(net: number): string {
  return `${net >= 0 ? "+" : ""}${net}`;
}

export function clampAmount(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

// Raise-to for a pot-fraction raise: call first, then raise the resulting pot.
// The server only enforces [min, max], so any value in range is legal.
export function potRaiseTo(state: any, fraction: number): number {
  const toCall = state.current_bet - state.hero.current_bet;
  return state.current_bet + fraction * (state.pot + toCall);
}

export function raisePresets(
  state: any,
  bet: { min: number; max: number },
): RaisePreset[] {
  const { min, max } = bet;
  const raw: RaisePreset[] = [
    { key: "min", label: "Min raise", amount: min },
    { key: "half", label: "1/2 pot", amount: potRaiseTo(state, 0.5) },
    { key: "threeq", label: "3/4 pot", amount: potRaiseTo(state, 0.75) },
    { key: "pot", label: "Pot", amount: potRaiseTo(state, 1) },
    { key: "allin", label: "All in", amount: max },
  ];
  return raw.map((p) => ({ ...p, amount: clampAmount(p.amount, min, max) }));
}

// Map the server's legal_actions into render-ready buttons.
export function actionButtons(state: any): ActionButton[] {
  return (state?.legal_actions ?? []).map((a: any) => {
    if (a.action === "call") {
      return { key: "call", label: `Call ${a.amount}`, amount: a.amount };
    }
    if (a.action === "check") return { key: "check", label: "Check" };
    if (a.action === "fold") return { key: "fold", label: "Fold" };
    if (a.action === "all_in") {
      return { key: "all_in", label: `All-in ${a.amount}`, amount: a.amount };
    }
    if (a.action === "bet") {
      return { key: "bet", label: "Raise", min: a.min, max: a.max };
    }
    return { key: a.action, label: a.action };
  });
}
