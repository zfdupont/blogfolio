import { Card } from "./Card";

export function Seat({
  name,
  stack,
  currentBet,
  cards = [],
  hidden = false,
  isActor = false,
  position,
}: {
  name: string;
  stack: number;
  currentBet: number;
  cards?: string[];
  hidden?: boolean;
  isActor?: boolean;
  position?: string;
}) {
  return (
    <div
      className={`w-full max-w-xs rounded-2xl border p-3 ${
        isActor
          ? "border-emerald-400 ring-2 ring-emerald-400/40"
          : "border-neutral-300 dark:border-neutral-700"
      }`}
    >
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">
          {name}
          {position ? ` · ${position}` : ""}
        </span>
        <span className="tabular-nums">{stack}</span>
      </div>
      <div className="mt-2 flex gap-1">
        {(hidden ? ["x", "x"] : cards).map((c, i) => (
          <Card key={i} card={hidden ? undefined : c} hidden={hidden} />
        ))}
      </div>
      {currentBet > 0 && (
        <div className="mt-1 text-xs text-neutral-500">bet {currentBet}</div>
      )}
    </div>
  );
}
