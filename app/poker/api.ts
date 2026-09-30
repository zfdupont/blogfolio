import axios from "axios";

// API origin override for local dev; defaults to the deployed service.
export const POKER_API =
  process.env.NEXT_PUBLIC_POKER_API ?? "https://poker.zfdupont.com";

export interface LegalAction {
  action: string;
  amount?: number;
  min?: number;
  max?: number;
}

export interface PokerEvent {
  type: string;
  [k: string]: unknown;
}

export interface PokerState {
  seq: number;
  street: string;
  community_cards: string[];
  pot: number;
  current_bet: number;
  hero: {
    seat: number;
    position: string | null;
    hole_cards: string[];
    stack: number;
    current_bet: number;
    is_actor: boolean;
  };
  bot: { stack: number; current_bet: number };
  legal_actions: LegalAction[];
  hand_complete: boolean;
  result: { pot: number; winners: { actor: string }[] } | null;
  session: {
    start_stack: number;
    stack: number;
    net: number;
    hands_played: number;
  };
}

export interface SessionResponse {
  token: string;
  events: PokerEvent[];
  state: PokerState;
}

export async function createSession(): Promise<SessionResponse> {
  return (await axios.post(`${POKER_API}/api/session`)).data;
}

export async function getSession(token: string): Promise<SessionResponse> {
  return (await axios.get(`${POKER_API}/api/session/${token}`)).data;
}

export async function postAction(
  token: string,
  seq: number,
  action: string,
  amount?: number,
): Promise<{ events: PokerEvent[]; state: PokerState }> {
  return (
    await axios.post(`${POKER_API}/api/session/${token}/action`, {
      seq,
      action,
      amount,
    })
  ).data;
}

export async function nextHand(token: string) {
  return (
    await axios.post(`${POKER_API}/api/session/${token}/next-hand`)
  ).data;
}

export async function rebuy(token: string) {
  return (await axios.post(`${POKER_API}/api/session/${token}/rebuy`)).data;
}

export async function cashOut(token: string) {
  return (await axios.delete(`${POKER_API}/api/session/${token}`)).data;
}
