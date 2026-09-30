"use client";

import Loader from "app/components/loader";
import { ActionBar } from "./components/ActionBar";
import { ActionLog } from "./components/ActionLog";
import { PokerTable } from "./components/PokerTable";
import { SessionBar } from "./components/SessionBar";
import { usePokerSession } from "./usePokerSession";

const PRIMARY =
  "rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-50";

export default function PokerPage() {
  const {
    state,
    events,
    loading,
    busy,
    tableClosed,
    act,
    nextHand,
    rebuy,
    cashOut,
  } = usePokerSession();

  if (loading) return <Loader />;

  if (tableClosed || !state) {
    return (
      <section className="flex flex-col items-center gap-2 py-16 text-center">
        <h1 className="text-xl font-semibold">Poker</h1>
        <p className="text-neutral-500">
          Table closed — the bot is off duty. Check back shortly.
        </p>
      </section>
    );
  }

  const busted = state.session.stack <= 0;

  return (
    <section className="mx-auto w-full max-w-4xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        Heads-up vs. the bot
      </h1>
      <SessionBar session={state.session} onCashOut={cashOut} />
      <PokerTable state={state} />
      {state.hand_complete ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-neutral-600 dark:text-neutral-400">
            {state.result
              ? `Won by ${state.result.winners
                  .map((w) => w.actor)
                  .join(", ")} · pot ${state.result.pot}`
              : "Hand complete"}
          </span>
          {busted ? (
            <button className={PRIMARY} disabled={busy} onClick={rebuy}>
              Rebuy
            </button>
          ) : (
            <button className={PRIMARY} disabled={busy} onClick={nextHand}>
              Next hand
            </button>
          )}
        </div>
      ) : (
        <ActionBar key={state.seq} state={state} disabled={busy} onAction={act} />
      )}
      <ActionLog events={events} />
    </section>
  );
}
