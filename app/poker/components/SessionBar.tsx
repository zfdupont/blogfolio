import { PokerState } from "../api";
import { formatNet } from "../logic";

export function SessionBar({
  session,
  onCashOut,
}: {
  session: PokerState["session"];
  onCashOut: () => void;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="tabular-nums text-neutral-600 dark:text-neutral-400">
        Stack {session.stack} · Net {formatNet(session.net)} · Hands{" "}
        {session.hands_played}
      </span>
      <button
        onClick={onCashOut}
        className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        Cash out
      </button>
    </div>
  );
}
