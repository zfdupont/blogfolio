"use client";

import { useState } from "react";
import { PokerState } from "../api";
import { actionButtons } from "../logic";

const BTN =
  "rounded-lg border border-neutral-300 px-3 py-1.5 text-sm transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800";

export function ActionBar({
  state,
  disabled,
  onAction,
}: {
  state: PokerState;
  disabled: boolean;
  onAction: (action: string, amount?: number) => void;
}) {
  const buttons = actionButtons(state);
  const bet = buttons.find((b) => b.key === "bet");
  const [raiseTo, setRaiseTo] = useState<number | null>(null);
  const raiseValue = raiseTo ?? bet?.min ?? 0;
  const off = disabled || !state.hero.is_actor;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {buttons
        .filter((b) => b.key !== "bet")
        .map((b) => (
          <button key={b.key} className={BTN} disabled={off} onClick={() => onAction(b.key, b.amount)}>
            {b.label}
          </button>
        ))}
      {bet && (
        <span className="flex items-center gap-2">
          <input
            type="range"
            min={bet.min}
            max={bet.max}
            value={raiseValue}
            disabled={off}
            onChange={(e) => setRaiseTo(Number(e.target.value))}
            className="w-32"
          />
          <button className={BTN} disabled={off} onClick={() => onAction("bet", raiseValue)}>
            Raise {raiseValue}
          </button>
        </span>
      )}
    </div>
  );
}
