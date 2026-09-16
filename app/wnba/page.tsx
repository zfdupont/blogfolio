"use client";

import { useState, useEffect } from "react";
import Loader from "app/components/loader";
import Dropdown from "app/components/dropdown";
import axios from "axios";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "https://wnba.zfdupont.com";
const MIN_POSSESSIONS = 500;

interface IPlayer {
  player_id: number;
  player_name: string;
  teams: string;
  possessions: number;
  o_epm: number;
  d_epm: number;
  epm: number;
}

interface IPrediction {
  game_id: number;
  date: string;
  home_name: string;
  away_name: string;
  pred_margin: number;
  home_win_prob: number;
}

interface IMeta {
  season?: number;
}

type SortKey =
  | "player_name"
  | "teams"
  | "possessions"
  | "epm"
  | "o_epm"
  | "d_epm";

const COLUMNS: { label: string; key: SortKey | null }[] = [
  { label: "Rk", key: null },
  { label: "Name", key: "player_name" },
  { label: "Teams", key: "teams" },
  { label: "Poss", key: "possessions" },
  { label: "EPM", key: "epm" },
  { label: "O-EPM", key: "o_epm" },
  { label: "D-EPM", key: "d_epm" },
];

type View = "players" | "teams" | "predictions";

const VIEWS: { label: string; value: View }[] = [
  { label: "Player EPM Ratings", value: "players" },
  { label: "Team EPM Ratings", value: "teams" },
  { label: "Game Predictions", value: "predictions" },
];

export default function Page() {
  const [players, setPlayers] = useState<IPlayer[]>([]);
  const [predictions, setPredictions] = useState<IPrediction[]>([]);
  const [season, setSeason] = useState<number | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("epm");
  const [order, setOrder] = useState<"ASC" | "DESC">("DESC");
  const [view, setView] = useState<View>("players");

  useEffect(() => {
    Promise.all([
      axios.get<IPlayer[]>(`${API_BASE}/api/epm`),
      axios.get<IPrediction[]>(`${API_BASE}/api/predictions`),
      axios.get<IMeta>(`${API_BASE}/api/meta`),
    ])
      .then(([epmRes, predRes, metaRes]) => {
        setPlayers(epmRes.data);
        setPredictions(predRes.data);
        setSeason(metaRes.data.season ?? null);
        setLoading(false);
      })
      .catch(() => {
        setError("Ratings are being refreshed. Check back shortly.");
        setLoading(false);
      });
  }, []);

  const handleSort = (key: SortKey | null) => {
    if (key === null) return;
    if (key === sortKey) {
      setOrder(order === "ASC" ? "DESC" : "ASC");
    } else {
      setSortKey(key);
      setOrder("DESC");
    }
  };

  if (isLoading) return <Loader />;

  if (error) {
    return (
      <section className="min-w-full flex flex-col justify-center items-center">
        <p>{error}</p>
      </section>
    );
  }

  const rows = players
    .filter((p) => p.possessions > MIN_POSSESSIONS)
    .sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return order === "ASC" ? cmp : -cmp;
    });

  const headers = COLUMNS.map((col, index) => (
    <th
      key={index}
      onClick={() => handleSort(col.key)}
      className={`${col.key === sortKey ? "underline bg-slate-100/25" : "hover:bg-slate-100/25"} ${col.key ? "cursor-pointer" : ""} p-4`}
    >
      {col.label}
    </th>
  ));

  const body = rows.map((player, index) => (
    <tr
      key={player.player_id}
      className="border-b-1 hover:bg-slate-100/10 text-right"
    >
      <td className="text-left">{index + 1}</td>
      <td className="text-pretty text-left">{player.player_name}</td>
      <td className="text-pretty">{player.teams}</td>
      <td className="text-pretty">{Math.round(player.possessions)}</td>
      <td className="text-pretty">{player.epm.toFixed(1)}</td>
      <td className="text-pretty">{player.o_epm.toFixed(1)}</td>
      <td className="text-pretty">{player.d_epm.toFixed(1)}</td>
    </tr>
  ));

  const upcoming = [...predictions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((g) => (
      <tr
        key={g.game_id}
        className="border-b-1 hover:bg-slate-100/10 text-right"
      >
        <td className="text-left p-2">
          {g.away_name} @ {g.home_name}
        </td>
        <td className="p-2">{g.pred_margin.toFixed(1)}</td>
        <td className="p-2">{(g.home_win_prob * 100).toFixed(0)}%</td>
      </tr>
    ));

  return (
    <section className="min-w-full flex flex-col justify-center items-center">
      <h1 className="text-2xl mb-5">{season ? `${season} ` : ""}WNBA</h1>
      <div className="mb-8">
        <Dropdown<View> options={VIEWS} value={view} onChange={setView} />
      </div>

      {view === "players" && (
        <table className="table-fixed">
          <thead>
            <tr>{headers}</tr>
          </thead>
          <tbody>{body}</tbody>
        </table>
      )}

      {view === "teams" && (
        <p className="text-neutral-500 mt-4">Team EPM ratings coming soon.</p>
      )}

      {view === "predictions" &&
        (upcoming.length > 0 ? (
          <table className="table-fixed">
            <thead>
              <tr>
                <th className="p-2 text-left">Matchup</th>
                <th className="p-2">Pred Margin</th>
                <th className="p-2">Home Win %</th>
              </tr>
            </thead>
            <tbody>{upcoming}</tbody>
          </table>
        ) : (
          <p className="text-neutral-500 mt-4">No upcoming games to predict.</p>
        ))}
    </section>
  );
}
