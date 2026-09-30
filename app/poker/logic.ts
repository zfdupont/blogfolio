// Pure helpers for the poker page. No React/DOM imports so they unit-test in a
// plain node environment.

export interface ActionButton {
  key: string;
  label: string;
  min?: number;
  max?: number;
  amount?: number;
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
