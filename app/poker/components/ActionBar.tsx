"use client";

import { useEffect, useState } from "react";
import { PokerState } from "../api";
import { ActionButton, actionButtons, raisePresets } from "../logic";

const BTN =
  "rounded-lg border border-neutral-300 px-3 py-1.5 text-sm transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800";
const BTN_ACTIVE =
  "rounded-lg border border-emerald-500 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-300";
const PRIMARY =
  "rounded-lg bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-50";

function toMap(list: ActionButton[]): Record<string, ActionButton> {
  return Object.fromEntries(list.map((b) => [b.key, b]));
}

export function ActionBar({
  state,
  disabled,
  onAction,
}: {
  state: PokerState;
  disabled: boolean;
  onAction: (action: string, amount?: number) => void;
}) {
  const [sizing, setSizing] = useState(false);
  const byKey = toMap(actionButtons(state));
  const bet = byKey["bet"];
  const off = disabled || !state.hero.is_actor;
  const canRaise =
    !!bet && bet.min !== undefined && bet.max !== undefined;

  if (sizing && canRaise) {
    return (
      <RaisePanel
        state={state}
        bet={bet as { min: number; max: number }}
        disabled={off}
        onBack={() => setSizing(false)}
        onRaise={(amount) => {
          setSizing(false);
          onAction("bet", amount);
        }}
      />
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {byKey["fold"] && (
        <button className={BTN} disabled={off} onClick={() => onAction("fold")}>
          Fold
        </button>
      )}
      {byKey["check"] && (
        <button className={BTN} disabled={off} onClick={() => onAction("check")}>
          Check
        </button>
      )}
      {byKey["call"] && (
        <button className={BTN} disabled={off} onClick={() => onAction("call")}>
          Call {byKey["call"].amount}
        </button>
      )}
      {canRaise && (
        <button className={PRIMARY} disabled={off} onClick={() => setSizing(true)}>
          Raise
        </button>
      )}
    </div>
  );
}

function RaisePanel({
  state,
  bet,
  disabled,
  onBack,
  onRaise,
}: {
  state: PokerState;
  bet: { min: number; max: number };
  disabled: boolean;
  onBack: () => void;
  onRaise: (amount: number) => void;
}) {
  const [amount, setAmount] = useState(bet.min);
  const step = state.big_blind || 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  const bb = (amount / (state.big_blind || 1)).toFixed(1).replace(/\.0$/, "");

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-neutral-300 p-3 dark:border-neutral-700">
      <div className="flex flex-col">
        <span className="text-xs uppercase tracking-wide text-neutral-500">
          Your bet
        </span>
        <span className="flex items-baseline gap-2">
          <span className="rounded bg-emerald-700 px-2 py-0.5 text-2xl font-semibold tabular-nums text-white">
            {amount}
          </span>
          <span className="text-xs text-neutral-500">{bb}BB</span>
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {raisePresets(state, bet).map((p) => (
          <button
            key={p.key}
            className={p.amount === amount ? BTN_ACTIVE : BTN}
            disabled={disabled}
            onClick={() => setAmount(p.amount)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex w-full items-center gap-2">
        <button
          className={BTN}
          disabled={disabled}
          onClick={() => setAmount((v) => Math.max(bet.min, v - step))}
          aria-label="Decrease bet"
        >
          −
        </button>
        <input
          type="range"
          min={bet.min}
          max={bet.max}
          step={1}
          value={amount}
          disabled={disabled}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="flex-1"
          aria-label="Raise amount"
        />
        <button
          className={BTN}
          disabled={disabled}
          onClick={() => setAmount((v) => Math.min(bet.max, v + step))}
          aria-label="Increase bet"
        >
          +
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button className={BTN} onClick={onBack}>
          Back
          <kbd className="ml-1 rounded bg-neutral-200 px-1 text-[10px] dark:bg-neutral-700">
            esc
          </kbd>
        </button>
        <button className={PRIMARY} disabled={disabled} onClick={() => onRaise(amount)}>
          Raise
        </button>
      </div>
    </div>
  );
}
