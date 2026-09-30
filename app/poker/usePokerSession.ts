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
// turns API calls into React state. A `busy` ref guards against double-submits.
export function usePokerSession() {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<PokerState | null>(null);
  const [events, setEvents] = useState<PokerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableClosed, setTableClosed] = useState(false);
  const busy = useRef(false);

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

  const act = useCallback(
    async (action: string, amount?: number) => {
      if (!token || !state || busy.current) return;
      busy.current = true;
      try {
        apply(await postAction(token, state.seq, action, amount));
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          setTableClosed(true);
        } else if (token) {
          await sync(token).catch(() => {});
        }
      } finally {
        busy.current = false;
      }
    },
    [token, state, apply, sync],
  );

  const runStep = useCallback(
    async (fn: (tk: string) => Promise<{ events: PokerEvent[]; state: PokerState }>) => {
      if (!token || busy.current) return;
      busy.current = true;
      try {
        apply(await fn(token));
      } catch {
        await sync(token).catch(() => {});
      } finally {
        busy.current = false;
      }
    },
    [token, apply, sync],
  );

  const nextHand = useCallback(() => runStep(apiNextHand), [runStep]);
  const rebuy = useCallback(() => runStep(apiRebuy), [runStep]);

  const cashOut = useCallback(async () => {
    if (token) await apiCashOut(token).catch(() => {});
    window.localStorage.removeItem(TOKEN_KEY);
    try {
      await startFresh();
    } catch {
      setTableClosed(true);
    }
  }, [token, startFresh]);

  return { state, events, loading, tableClosed, act, nextHand, rebuy, cashOut };
}
