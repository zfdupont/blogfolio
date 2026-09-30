"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  PokerEvent,
  PokerState,
  cashOut as apiCashOut,
  createSession,
  getSession,
  nextHand as apiNextHand,
  postAction,
  rebuy as apiRebuy,
} from "./api";

const TOKEN_KEY = "pokerbot.session";

// Owns the session token (persisted so a reload resumes the same stack) and
// turns API calls into React state. `busyRef` synchronously guards against
// double-submits; `busy` mirrors it for disabling buttons.
export function usePokerSession() {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<PokerState | null>(null);
  const [events, setEvents] = useState<PokerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tableClosed, setTableClosed] = useState(false);
  const busyRef = useRef(false);

  const apply = useCallback(
    (res: { events: PokerEvent[]; state: PokerState }) => {
      setEvents(res.events);
      setState(res.state);
    },
    [],
  );

  const sync = useCallback(async (tk: string) => {
    const res = await getSession(tk);
    setEvents(res.events);
    setState(res.state);
  }, []);

  const startFresh = useCallback(async () => {
    const res = await createSession();
    window.localStorage.setItem(TOKEN_KEY, res.token);
    setToken(res.token);
    apply(res);
  }, [apply]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const saved = window.localStorage.getItem(TOKEN_KEY);
      try {
        const res = saved ? await getSession(saved) : await createSession();
        if (cancelled) return;
        window.localStorage.setItem(TOKEN_KEY, res.token);
        setToken(res.token);
        apply(res);
      } catch (err) {
        if (cancelled) return;
        // Expired token (404) -> transparently start a fresh session.
        if (axios.isAxiosError(err) && err.response?.status === 404 && saved) {
          try {
            await startFresh();
          } catch {
            if (!cancelled) setTableClosed(true);
          }
        } else if (!cancelled) {
          setTableClosed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [apply, startFresh]);

  const withBusy = useCallback(async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await fn();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const act = useCallback(
    (action: string, amount?: number) => {
      if (!token || !state) return;
      return withBusy(async () => {
        try {
          apply(await postAction(token, state.seq, action, amount));
        } catch (err) {
          if (axios.isAxiosError(err) && err.response?.status === 404) {
            setTableClosed(true);
          } else {
            await sync(token).catch(() => {});
          }
        }
      });
    },
    [token, state, apply, sync, withBusy],
  );

  const runStep = useCallback(
    (
      fn: (tk: string) => Promise<{
        events: PokerEvent[];
        state: PokerState;
      }>,
    ) => {
      if (!token) return;
      return withBusy(async () => {
        try {
          apply(await fn(token));
        } catch {
          await sync(token).catch(() => {});
        }
      });
    },
    [token, apply, sync, withBusy],
  );

  const nextHand = useCallback(() => runStep(apiNextHand), [runStep]);
  const rebuy = useCallback(() => runStep(apiRebuy), [runStep]);

  // Start a fresh table (new token, stacks back to the starting amount).
  const newGame = useCallback(async () => {
    window.localStorage.removeItem(TOKEN_KEY);
    setBusy(true);
    try {
      await startFresh();
    } catch {
      setTableClosed(true);
    } finally {
      setBusy(false);
    }
  }, [startFresh]);

  const cashOut = useCallback(async () => {
    if (token) await apiCashOut(token).catch(() => {});
    await newGame();
  }, [token, newGame]);

  return {
    state,
    events,
    loading,
    busy,
    tableClosed,
    act,
    nextHand,
    rebuy,
    cashOut,
    newGame,
  };
}
