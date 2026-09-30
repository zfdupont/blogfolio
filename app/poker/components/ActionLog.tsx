import { PokerEvent } from "../api";
import { cardLabel } from "../logic";

function label(e: PokerEvent): string {
  switch (e.type) {
    case "hand_start":
      return "— new hand —";
    case "street":
      return `${e.name}: ${(e.board as string[]).map(cardLabel).join(" ")}`;
    case "action":
      return `${e.actor}: ${e.action}${e.amount ? ` ${e.amount}` : ""}`;
    case "showdown":
      return `showdown ${e.actor}: ${(e.cards as string[]).map(cardLabel).join(" ")}`;
    case "hand_result":
      return `result: won by ${(e.winners as { actor: string }[])
        .map((w) => w.actor)
        .join(", ")} (pot ${e.pot})`;
    default:
      return e.type;
  }
}

export function ActionLog({ events }: { events: PokerEvent[] }) {
  return (
    <ol className="max-h-48 space-y-1 overflow-y-auto text-sm text-neutral-600 dark:text-neutral-400">
      {events.map((e, i) => (
        <li key={i}>{label(e)}</li>
      ))}
    </ol>
  );
}
