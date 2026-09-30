# Poker Page Implementation Plan (blogfolio)

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/poker` page to the portfolio (zfdupont.com) where a visitor plays a heads-up cash session against the bot, talking to the `pokerbot-web` REST service.

**Architecture:** A Next.js App Router client component under `app/poker/`. Presentation is split into small components; all server-derived state comes from the `pokerbot-web` API (Plan 1). A session token is kept in `localStorage` so a reload resumes the same stack. Pure logic lives in `app/poker/logic.ts` and is unit-tested with Vitest (the repo has no test infra, so this plan adds a minimal Vitest setup).

**Tech Stack:** Next.js (App Router, `canary`), React 18, Tailwind v4, `axios` (already a dependency), Vitest (added).

**Spec:** `/Users/zfdupont/pokerbot/docs/superpowers/specs/2026-09-30-poker-web-design.md`

## Global Constraints

- Client components only where interactivity is needed (`"use client"`), matching `app/wnba/page.tsx`.
- Styling is Tailwind v4 via `app/global.css`; support light and dark (`dark:` + `prefers-color-scheme`).
- API origin from `NEXT_PUBLIC_POKER_API`, default `https://poker.zfdupont.com` (mirrors the WNBA page's `NEXT_PUBLIC_API_BASE`).
- The bot's hole cards must never be rendered before showdown (the API never sends them; the UI must not infer them).
- Table stack is 200 chips at BB=2 (100 BB); display chips as-is, show net in BB where useful.
- No new runtime dependencies beyond `axios` (already present); Vitest is dev-only.

## Review Focus

Input classes the happy path won't cover:
1. **Service unreachable** — page must show a clear "table closed" state, not crash or hang.
2. **Session expired (404 on resume)** — transparently create a fresh session.
3. **Reload mid-hand** — must re-render the current pause state from `GET` (including the board and stacks), not restart the hand.
4. **Illegal/stale action (409)** — surface it and re-sync from `GET` rather than leaving the UI stuck.
5. **Hand complete / bust** — show result, offer next hand; when the hero is at 0 chips, offer rebuy instead.
6. **Double-submit** — disable action buttons while a request is in flight.

---

### Task 1: API client and pure logic (+ Vitest setup)

**Files:**
- Create: `app/poker/api.ts`, `app/poker/logic.ts`, `app/poker/logic.test.ts`, `vitest.config.mts`
- Modify: `package.json` (add `vitest` devDep + `"test": "vitest run"` script)

**Interfaces:**
- Produces:
  - `api.ts`: `POKER_API`, types `PokerState`, `PokerEvent`, `LegalAction`, `SessionResponse`; functions `createSession()`, `getSession(token)`, `postAction(token, seq, action, amount?)`, `nextHand(token)`, `rebuy(token)`, `cashOut(token)` — all `async` returning the parsed JSON, throwing on non-2xx.
  - `logic.ts`: `parseCard(card: string): { rank: string; suit: string }`, `cardLabel(card: string): string`, `actionButtons(state: PokerState): ActionButton[]`, `isHeroTurn(state: PokerState): boolean`, `formatNet(net: number): string`.

- [ ] **Step 1: Write the failing tests**

```ts
// app/poker/logic.test.ts
import { describe, it, expect } from "vitest";
import { parseCard, cardLabel, actionButtons } from "./logic";

const state = (over: any = {}) => ({
  seq: 0, current_bet: 2, hero: { current_bet: 1, stack: 199, is_actor: true },
  legal_actions: [{ action: "fold" }, { action: "call", amount: 1 },
                  { action: "bet", min: 4, max: 200 }, { action: "all_in", amount: 200 }],
  ...over,
});

describe("cards", () => {
  it("parses a backend card string", () => {
    expect(parseCard("Ah")).toEqual({ rank: "A", suit: "h" });
  });
  it("labels a card", () => {
    expect(cardLabel("Ts")).toBe("T♠");
  });
});

describe("actionButtons", () => {
  it("includes a labeled call with its amount", () => {
    const btns = actionButtons(state());
    const call = btns.find((b) => b.key === "call");
    expect(call?.label).toBe("Call 1");
  });
  it("labels check when there is nothing to call", () => {
    const s = state({ current_bet: 0, hero: { current_bet: 0, stack: 200, is_actor: true },
                      legal_actions: [{ action: "check" }, { action: "bet", min: 2, max: 200 }] });
    expect(actionButtons(s).find((b) => b.key === "check")?.label).toBe("Check");
  });
  it("carries bet min/max", () => {
    const bet = actionButtons(state()).find((b) => b.key === "bet");
    expect(bet?.min).toBe(4);
    expect(bet?.max).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — `vitest: command not found` / module missing.

- [ ] **Step 3: Add Vitest and implement**

`package.json`: add `"vitest": "^2.1.9"` to `devDependencies` and `"test": "vitest run"` to `scripts`. Run `pnpm install`.

`vitest.config.mts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node" } });
```

`app/poker/logic.ts`:
```ts
export interface ActionButton { key: string; label: string; min?: number; max?: number; amount?: number; }
const SUIT_SYMBOL: Record<string, string> = { h: "♥", d: "♦", c: "♣", s: "♠" };

export function parseCard(card: string) {
  return { rank: card[0], suit: card[1] };
}
export function cardLabel(card: string) {
  const { rank, suit } = parseCard(card);
  return `${rank}${SUIT_SYMBOL[suit] ?? suit}`;
}

export function actionButtons(state: any): ActionButton[] {
  const toCall = state.current_bet - state.hero.current_bet;
  return (state.legal_actions ?? []).map((a: any) => {
    if (a.action === "call") return { key: "call", label: `Call ${a.amount}`, amount: a.amount };
    if (a.action === "check") return { key: "check", label: "Check" };
    if (a.action === "fold") return { key: "fold", label: "Fold" };
    if (a.action === "all_in") return { key: "all_in", label: `All-in ${a.amount}`, amount: a.amount };
    if (a.action === "bet") return { key: "bet", label: "Raise", min: a.min, max: a.max };
    return { key: a.action, label: a.action };
  });
}
```

`app/poker/api.ts`:
```ts
import axios from "axios";

export const POKER_API =
  process.env.NEXT_PUBLIC_POKER_API ?? "https://poker.zfdupont.com";

export interface LegalAction { action: string; amount?: number; min?: number; max?: number; }
export interface PokerEvent { type: string; [k: string]: unknown; }
export interface PokerState {
  seq: number; street: string; community_cards: string[]; pot: number; current_bet: number;
  hero: { seat: number; position: string; hole_cards: string[]; stack: number; current_bet: number; is_actor: boolean };
  bot: { stack: number; current_bet: number };
  legal_actions: LegalAction[]; hand_complete: boolean;
  result: { pot: number; winners: { actor: string }[] } | null;
  session: { start_stack: number; stack: number; net: number; hands_played: number };
}
export interface SessionResponse { token: string; events: PokerEvent[]; state: PokerState; }

export async function createSession(): Promise<SessionResponse> {
  return (await axios.post(`${POKER_API}/api/session`)).data;
}
export async function getSession(token: string): Promise<SessionResponse> {
  return (await axios.get(`${POKER_API}/api/session/${token}`)).data;
}
export async function postAction(token: string, seq: number, action: string, amount?: number) {
  return (await axios.post(`${POKER_API}/api/session/${token}/action`, { seq, action, amount })).data;
}
export async function nextHand(token: string) {
  return (await axios.post(`${POKER_API}/api/session/${token}/next-hand`)).data;
}
export async function rebuy(token: string) {
  return (await axios.post(`${POKER_API}/api/session/${token}/rebuy`)).data;
}
export async function cashOut(token: string) {
  return (await axios.delete(`${POKER_API}/api/session/${token}`)).data;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/poker/api.ts app/poker/logic.ts app/poker/logic.test.ts vitest.config.mts package.json pnpm-lock.yaml
git commit -m "feat(poker): add API client, pure logic, and Vitest setup"
```

---

### Task 2: Session hook

**Files:**
- Create: `app/poker/usePokerSession.ts`

**Interfaces:**
- Consumes: `api.ts`.
- Produces: `usePokerSession()` returning `{ state, events, loading, error, act, nextHand, rebuy, cashOut, tableClosed }`.

- [ ] **Step 1: Implement the hook** (no unit test — it is IO glue; exercised by the e2e in Task 5 and manually against a local service)

Requirements:
- On mount, read `pokerbot.session` from `localStorage`; `getSession(token)` to resume; on 404, `createSession()` and store the new token; on network error set `tableClosed=true`.
- `act(action, amount?)` → `postAction(token, state.seq, action, amount)`; on success replace `state`/`events`; on 409 re-sync via `getSession`; ignore if a request is already in flight (`busy` ref).
- `nextHand()`/`rebuy()`/`cashOut()` similarly; `cashOut` clears the token.
- `events` is the ordered event list (rendered by the log; the table renders from `state`).

- [ ] **Step 2: Typecheck/build**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/poker/usePokerSession.ts
git commit -m "feat(poker): add session hook (token resume, act/next-hand/rebuy/cash-out)"
```

---

### Task 3: Presentational components

**Files:**
- Create: `app/poker/components/Card.tsx`, `Seat.tsx`, `PokerTable.tsx`, `ActionBar.tsx`, `ActionLog.tsx`, `SessionBar.tsx`

**Interfaces:**
- Consumes: `logic.ts` (`cardLabel`, `actionButtons`), `api.ts` types.
- Produces: `Card({ card?, hidden? })`, `Seat({ name, stack, currentBet, cards, hidden, isActor, position })`, `PokerTable({ state })`, `ActionBar({ state, onAction, disabled })`, `ActionLog({ events })`, `SessionBar({ session, onCashOut })`.

- [ ] **Step 1: `Card.tsx`**

Renders a 2-char card (`cardLabel`) or a face-down back (`hidden`). Rounded, white face, suit-colored rank; a subtle CSS flip transition keyed on the card value.

- [ ] **Step 2: `PokerTable.tsx`**

Felt (`bg-emerald-800 dark:bg-emerald-950 rounded-3xl`), board cards centered, pot in the middle, hero and bot `Seat`s opposite each other, dealer button marker by `state.hero.position`.

- [ ] **Step 3: `ActionBar.tsx`**

For each `actionButtons(state)`: a button. `bet` opens a range input bounded by `min`/`max` with a confirm. Buttons are `disabled` when `disabled` (in-flight) or `!state.hero.is_actor`.

- [ ] **Step 4: `ActionLog.tsx` / `SessionBar.tsx`**

`ActionLog` lists events readably (`hand_start`, `action`, `street`, `hand_result`). `SessionBar` shows `session.stack`, `formatNet(session.net)`, `hands_played`, and a "Cash out" button.

- [ ] **Step 5: Build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add app/poker/components
git commit -m "feat(poker): add table, seat, card, action, log, session components"
```

---

### Task 4: Page, nav, sitemap

**Files:**
- Create: `app/poker/page.tsx`
- Modify: `app/components/nav.tsx` (add `/poker`), `app/sitemap.ts` (add `/poker`)

- [ ] **Step 1: `app/poker/page.tsx`** (`"use client"`)

Compose `SessionBar`, `PokerTable`, `ActionBar`, `ActionLog` from `usePokerSession()`. Handle:
- `tableClosed` → "Table closed — the bot is off duty." message.
- `hand_complete` → result banner + "Next hand"; if `state.session.stack <= 0` → "Rebuy".
- loading spinner while resuming.

- [ ] **Step 2: nav + sitemap**

Add `'/poker': { name: 'poker' }` to `navItems`; add `'/poker'` to the `routes` array in `sitemap.ts`.

- [ ] **Step 3: Build + lint-by-eye**

Run: `pnpm build`
Expected: succeeds; navigating to `/poker` renders (manual).

- [ ] **Step 4: Commit**

```bash
git add app/poker/page.tsx app/components/nav.tsx app/sitemap.ts
git commit -m "feat(poker): add /poker page, nav link, sitemap entry"
```

---

### Task 5: Polish and responsive

**Files:**
- Modify: the Task 3 components + `app/poker/page.tsx`

- [ ] **Step 1: Polish**

Card flip + chip/pot transitions (`transition-all`, `duration-200`), a muted-by-default sound toggle using a tiny `AudioContext` click on action (no asset files), and a felt texture via a CSS gradient. Keep it within the site's palette.

- [ ] **Step 2: Responsive**

Table stacks vertically under `sm:`; action buttons wrap; the page breaks out of `max-w-3xl` with a wider inner container (`max-w-4xl`).

- [ ] **Step 3: Build**

Run: `pnpm build` (succeeds).

- [ ] **Step 4: Commit**

```bash
git add app/poker
git commit -m "feat(poker): polish — animations, sound toggle, responsive table"
```

---

### Task 6: Playwright end-to-end tests

**Files:**
- Create: `playwright.config.ts`, `e2e/poker.spec.ts`
- Modify: `package.json` (add `@playwright/test` devDep + `"test:e2e": "playwright test"`)

**Interfaces:**
- Consumes: the built `/poker` page. The API is mocked in-browser via `page.route` (same-origin), so no running service is required and the tests run in CI.

- [ ] **Step 1: Add Playwright**

`package.json`: `"@playwright/test"` devDep + `"test:e2e": "playwright test"`; `pnpm install`; `pnpm exec playwright install chromium`.

- [ ] **Step 2: `playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:3000" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Same-origin API so the mocked routes need no CORS/preflight handling.
    command: "NEXT_PUBLIC_POKER_API=http://127.0.0.1:3000 pnpm dev",
    url: "http://127.0.0.1:3000/poker",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 3: `e2e/poker.spec.ts`**

A tiny stateful mock for `**/api/session**`:
- `POST /api/session` → paused preflop state, hero to act (fold/call/bet/all-in).
- `GET /api/session/:token` → the current mocked state.
- `POST .../action` → bot calls, hand completes, result = hero win.

Tests:
1. **deal renders** — hole cards visible, bot seat shows no cards, action buttons present.
2. **hero action** — click "Call", assert the event log / state updates.
3. **reload resume** — seed `localStorage["pokerbot.session"]`, mock `GET` to a mid-hand flop state, reload, assert the board renders.
4. **service down** — `page.route("**/api/**", r => r.abort())`, assert "Table closed" shows.

- [ ] **Step 4: Run**

Run: `pnpm test && pnpm test:e2e`
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts e2e/poker.spec.ts package.json pnpm-lock.yaml
git commit -m "test(poker): add Playwright e2e for the /poker page"
```

---

### Task 7: Manual e2e against the real service

- [ ] **Step 1: Run the service** (pokerbot worktree)

```bash
cd /Users/zfdupont/pokerbot/.worktrees/poker-web
POKERBOT_CHECKPOINT=/Users/zfdupont/pokerbot/sixmax/checkpoints/blueprint.bin \
  uv run python -m web.main --port 8100
```

- [ ] **Step 2: Run the site against it**

`NEXT_PUBLIC_POKER_API=http://127.0.0.1:8100 pnpm dev`; open `/poker`, play a few hands, reload mid-hand, finish a hand, force a bust/rebuy. Record the result in the ledger.

---

## Self-Review

**Spec coverage:** UI in blogfolio (Tasks 3–4), session resume via localStorage (Task 2), polished UX (Task 5), API client (Task 1). Deployment of the page is Plan 4.

**Placeholders:** none.

**Type consistency:** `PokerState`/`LegalAction` in `api.ts` match Plan 1's `snapshot()` keys; `actionButtons` consumes those exact keys.

**Known constraint:** the root layout wraps children in `max-w-3xl`; the table uses a wider inner container and is verified responsive in Task 5.

## Execution Handoff

**Native** (executing-plans). Tasks 1–4 are buildable without a running service; Task 5 requires the local service from the pokerbot worktree.
