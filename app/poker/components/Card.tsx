import { cardLabel, isRedCard } from "../logic";

export function Card({
  card,
  hidden = false,
}: {
  card?: string;
  hidden?: boolean;
}) {
  if (hidden || !card) {
    return (
      <div className="flex h-16 w-11 items-center justify-center rounded-md border border-indigo-900 bg-gradient-to-br from-indigo-700 to-indigo-950 text-indigo-300 shadow">
        🂠
      </div>
    );
  }
  const red = isRedCard(card);
  return (
    <div
      className={`flex h-16 w-11 items-center justify-center rounded-md border border-neutral-300 bg-white text-lg font-semibold shadow transition-transform duration-200 dark:border-neutral-600 ${
        red ? "text-red-600" : "text-neutral-900"
      }`}
    >
      {cardLabel(card)}
    </div>
  );
}
