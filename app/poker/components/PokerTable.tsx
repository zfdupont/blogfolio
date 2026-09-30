import { PokerState } from "../api";
import { Card } from "./Card";
import { Seat } from "./Seat";

export function PokerTable({ state }: { state: PokerState }) {
  const botIsActor = state.hero.is_actor === false && !state.hand_complete;
  return (
    <div className="rounded-3xl bg-gradient-to-b from-emerald-700 to-emerald-900 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.08),transparent_70%)] p-6 shadow-inner dark:from-emerald-900 dark:to-emerald-950">
      <div className="flex flex-col items-center gap-4">
        <Seat
          name="Bot"
          stack={state.bot.stack}
          currentBet={state.bot.current_bet}
          hidden
          isActor={botIsActor}
        />
        <div className="flex min-h-[4rem] items-center gap-1">
          {state.community_cards.length > 0 ? (
            state.community_cards.map((c, i) => <Card key={i} card={c} />)
          ) : (
            <span className="text-sm text-emerald-100/70">preflop</span>
          )}
        </div>
        <div className="text-sm text-emerald-50">Pot {state.pot}</div>
        <Seat
          name="You"
          stack={state.hero.stack}
          currentBet={state.hero.current_bet}
          cards={state.hero.hole_cards}
          isActor={state.hero.is_actor}
          position={state.hero.position ?? undefined}
        />
      </div>
    </div>
  );
}
