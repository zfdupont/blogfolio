import { test, expect, type Page } from "@playwright/test";

// Canned API states — the /poker page is driven entirely by the pokerbot-web
// REST contract, so mocking it lets us exercise every UI flow deterministically
// without running the Python service (and in CI).

const preflop = {
  seq: 0,
  hand_id: 1,
  street: "preflop",
  community_cards: [] as string[],
  pot: 3,
  current_bet: 2,
  big_blind: 2,
  hero: {
    seat: 0,
    position: "SB",
    hole_cards: ["A♥", "K♠"],
    stack: 199,
    current_bet: 1,
    is_actor: true,
  },
  bot: { stack: 198, current_bet: 2 },
  legal_actions: [
    { action: "fold" },
    { action: "call", amount: 1 },
    { action: "bet", min: 4, max: 200 },
    { action: "all_in", amount: 200 },
  ],
  hand_complete: false,
  result: null,
  session: { start_stack: 200, stack: 199, net: -1, hands_played: 0 },
};

const flop = {
  ...preflop,
  seq: 2,
  street: "flop",
  community_cards: ["A♦", "K♣", "2♠"],
  current_bet: 0,
  hero: { ...preflop.hero, current_bet: 0 },
  bot: { ...preflop.bot, current_bet: 0 },
  legal_actions: [
    { action: "check" },
    { action: "bet", min: 2, max: 200 },
    { action: "all_in", amount: 200 },
  ],
};

const done = {
  ...preflop,
  seq: 3,
  street: "river",
  community_cards: ["A♦", "K♣", "2♠", "7♥", "9♠"],
  pot: 4,
  current_bet: 0,
  hero: { ...preflop.hero, stack: 202, current_bet: 0, is_actor: false },
  bot: { stack: 198, current_bet: 0 },
  legal_actions: [] as unknown[],
  hand_complete: true,
  result: { pot: 4, winners: [{ actor: "hero" }] },
  session: { start_stack: 200, stack: 202, net: 2, hands_played: 1 },
};

const botBust = {
  ...done,
  bot: { stack: 0, current_bet: 0 },
  result: { pot: 400, winners: [{ actor: "hero" }] },
  session: { start_stack: 200, stack: 400, net: 200, hands_played: 1 },
};

const preflopEvents = [
  { type: "hand_start", button: 0, hero_pos: "SB" },
  { type: "street", name: "preflop", board: [] },
];

async function mockApi(
  page: Page,
  opts: { state?: unknown; after?: unknown; abort?: boolean } = {},
) {
  const state = opts.state ?? preflop;
  await page.route("**/api/session**", (route) => {
    if (opts.abort) return route.abort();
    const req = route.request();
    const url = req.url();
    const json = (obj: unknown) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(obj),
      });
    if (req.method() === "POST" && url.endsWith("/api/session")) {
      return json({ token: "test-token", events: preflopEvents, state });
    }
    if (req.method() === "POST" && url.includes("/action")) {
      return json({
        events: [
          ...preflopEvents,
          { type: "action", actor: "hero", action: "call", amount: 1 },
        ],
        state: opts.after ?? done,
      });
    }
    if (req.method() === "POST" && url.includes("/next-hand")) {
      return json({ token: "test-token", events: preflopEvents, state: preflop });
    }
    return json({ token: "test-token", events: preflopEvents, state });
  });
}

test("deals a hand, shows hero cards and action buttons", async ({ page }) => {
  await mockApi(page);
  await page.goto("/poker");
  await expect(
    page.getByRole("heading", { name: "Heads-up vs. the bot" }),
  ).toBeVisible();
  // Backend sends suit symbols; hearts/diamonds must render red (text-red-600),
  // clubs/spades dark (text-neutral-900).
  const redCard = page.getByText("A♥", { exact: true });
  await expect(redCard).toBeVisible();
  await expect(redCard).toHaveCSS("color", "rgb(220, 38, 38)");
  await expect(page.getByText("K♠", { exact: true })).toHaveCSS(
    "color",
    "rgb(23, 23, 23)",
  );
  await expect(page.getByRole("button", { name: "Call 1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fold" })).toBeVisible();
});

test("submits a hero action and shows the result", async ({ page }) => {
  await mockApi(page);
  await page.goto("/poker");
  await page.getByRole("button", { name: "Call 1" }).click();
  await expect(page.getByText("hero: call 1").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Next hand" })).toBeVisible();
});

test("raise opens a sizing panel with presets, back, and escape", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/poker");
  await page.getByRole("button", { name: "Raise", exact: true }).click();
  await expect(page.getByText("Your bet")).toBeVisible();
  for (const label of ["Min raise", "1/2 pot", "3/4 pot", "Pot", "All in"]) {
    await expect(
      page.getByRole("button", { name: label, exact: true }),
    ).toBeVisible();
  }
  // Escape closes it and the main bar returns.
  await page.keyboard.press("Escape");
  await expect(page.getByText("Your bet")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Raise", exact: true }),
  ).toBeVisible();
  // Reopen, pick a preset, and submit.
  await page.getByRole("button", { name: "Raise", exact: true }).click();
  await page.getByRole("button", { name: "Pot", exact: true }).click();
  await page.getByRole("button", { name: "Raise", exact: true }).click();
  await expect(page.getByRole("button", { name: "Next hand" })).toBeVisible();
});

test("shows a game-over message and New game when a stack hits zero", async ({
  page,
}) => {
  await mockApi(page, { after: botBust });
  await page.goto("/poker");
  await page.getByRole("button", { name: "Call 1" }).click();
  await expect(page.getByText(/broke the bot/)).toBeVisible();
  await page.getByRole("button", { name: "New game" }).click();
  // Fresh session -> a new preflop hand with the hero to act.
  await expect(page.getByRole("button", { name: "Call 1" })).toBeVisible();
});

test("resumes a mid-hand session on reload", async ({ page }) => {
  await mockApi(page, { state: flop });
  await page.addInitScript(() =>
    window.localStorage.setItem("pokerbot.session", "test-token"),
  );
  await page.goto("/poker");
  await expect(page.getByText("A♦", { exact: true })).toBeVisible(); // board
  await expect(page.getByText("K♣", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check" })).toBeVisible();
});

test("shows table closed when the service is down", async ({ page }) => {
  await mockApi(page, { abort: true });
  await page.goto("/poker");
  await expect(page.getByText(/Table closed/).first()).toBeVisible();
});
