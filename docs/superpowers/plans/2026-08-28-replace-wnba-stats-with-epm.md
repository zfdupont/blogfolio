# Replace `wnba-stats` with `wnba-epm` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the legacy `wnba-stats` Flask/BPM service behind zfdupont.com/wnba and replace it with this project's EPM FastAPI service, giving the portfolio an EPM ratings table plus a new upcoming-game predictions view, with a self-contained GitHub Actions deploy.

**Architecture:** This repo is published to GitHub and deploys to the droplet as an independent Docker Compose stack (`api` + daily `refresh`) via its own Actions workflow. nginx repoints `/api/` to the new container (prefix stripped). The `blogfolio` repo swaps its `projects/wnba-stats` submodule for `projects/wnba-epm` and rewrites `app/wnba/page.tsx` to consume `/api/epm`, `/api/predictions`, and `/api/meta`.

**Tech Stack:** Python 3.12 / FastAPI / uvicorn / Docker Compose / GitHub Actions (GHCR + SSH deploy); Next.js App Router / TypeScript / axios (blogfolio).

**Spec:** `docs/superpowers/specs/2026-08-28-replace-wnba-stats-with-epm-design.md`

## Global Constraints

- No secrets committed to git. `.env` is gitignored; `.env.example` holds placeholders only.
- No emojis, no em-dashes in code, docs, or commit messages. Commit messages brief. Do NOT add `Co-Authored-By`, `Claude-Session`, or "Generated with" trailers.
- `data/` and `models/` are gitignored: neither the repo nor the image contains artifacts. The droplet host supplies them via bind mounts.
- FastAPI native paths have no `/api` prefix; nginx strips `/api/` before proxying to `127.0.0.1:8000`.
- Frontend must tolerate a `503` "artifacts not ready" response (first deploy) without rendering broken cells.
- Two repos are involved. Tasks 1-4 run in `wnba-epm` (this repo). Tasks 5-7 run in a local clone of `blogfolio`. Task 8 runs on the droplet.
- Git plumbing tasks (remote add, push, submodule add/deinit) change repo/branch state. Run these directly; do NOT delegate them to a restricted implementer subagent that may only add+commit.

---

### Task 1: Harden Compose port binding to loopback

The droplet exposes the site only through nginx. The API container must bind to `127.0.0.1`, not all interfaces.

**Files:**
- Modify: `docker-compose.yml` (the `api` service `ports:`)
- Test: `tests/test_deployment_files.py`

**Interfaces:**
- Consumes: nothing.
- Produces: a compose file whose `api` service publishes `127.0.0.1:${PORT:-8000}:8000`.

- [ ] **Step 1: Add the failing assertion**

Append to `tests/test_deployment_files.py` inside `test_deployment_files_present` (after the existing compose asserts):

```python
    # API binds to loopback only; nginx is the public edge.
    assert "127.0.0.1:${PORT:-8000}:8000" in compose
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_deployment_files.py::test_deployment_files_present -v`
Expected: FAIL (assertion error; compose still has `"${PORT:-8000}:8000"`).

- [ ] **Step 3: Update the compose port mapping**

In `docker-compose.yml`, under `api:` `ports:`, change:

```yaml
    ports:
      - "${PORT:-8000}:8000"
```

to:

```yaml
    ports:
      - "127.0.0.1:${PORT:-8000}:8000"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_deployment_files.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml tests/test_deployment_files.py
git commit -m "fix: bind api container to loopback for nginx edge"
```

---

### Task 2: GitHub Actions deploy workflow

Add a workflow mirroring blogfolio's `release` flow: build and push the image to GHCR, then SSH to the droplet and restart the stack.

**Files:**
- Create: `.github/workflows/deploy.yml`
- Test: `tests/test_deployment_files.py`

**Interfaces:**
- Consumes: repo secrets `DROPLET_HOST`, `DROPLET_USER`, `DROPLET_SSH_KEY` (configured in Task 4's runbook, not in code).
- Produces: an image `ghcr.io/zfdupont/wnba-epm:release` and `:<sha>`; a droplet stack restarted from `/var/www/wnba-epm`.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_deployment_files.py`:

```python
def test_deploy_workflow_present():
    wf = Path(".github/workflows/deploy.yml")
    assert wf.exists()
    text = wf.read_text()
    assert "ghcr.io/zfdupont/wnba-epm" in text
    assert "docker compose up -d" in text
    assert "workflow_dispatch" in text
    assert "/var/www/wnba-epm" in text
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_deployment_files.py::test_deploy_workflow_present -v`
Expected: FAIL (file missing).

- [ ] **Step 3: Create the workflow**

Create `.github/workflows/deploy.yml`:

```yaml
name: Build and Deploy

on:
  push:
    branches: [release]
  workflow_dispatch:

concurrency:
  group: deploy-release
  cancel-in-progress: true

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            ghcr.io/zfdupont/wnba-epm:release
            ghcr.io/zfdupont/wnba-epm:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - name: Deploy over SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DROPLET_HOST }}
          username: ${{ secrets.DROPLET_USER }}
          key: ${{ secrets.DROPLET_SSH_KEY }}
          script: |
            set -e
            cd /var/www/wnba-epm
            git fetch origin release
            git checkout release
            git pull --ff-only origin release
            docker compose pull
            docker compose up -d
            docker image prune -f
```

Note: the droplet compose builds from source today. To consume the GHCR image instead, Task 3's runbook documents replacing `build: .` with `image: ghcr.io/zfdupont/wnba-epm:release` on the droplet's copy; keeping `build: .` also works (the `git pull` + `docker compose up -d --build` path). The workflow above uses `docker compose pull`, so the droplet compose must reference the GHCR image. This is reconciled in Task 3.

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_deployment_files.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy.yml tests/test_deployment_files.py
git commit -m "ci: add GHCR build + droplet SSH deploy workflow"
```

---

### Task 3: Reconcile compose for GHCR image + deployment runbook

Make the compose consumable by `docker compose pull` (GHCR image) while keeping local `build`, and write the droplet runbook (seeding, nginx, secrets, cutover).

**Files:**
- Modify: `docker-compose.yml` (add `image:` alongside `build:` on `api` and `refresh`)
- Modify: `README.md` (deployment section) or Create: `docs/DEPLOY.md`
- Test: `tests/test_deployment_files.py`

**Interfaces:**
- Consumes: the workflow from Task 2.
- Produces: a compose file where `api`/`refresh` reference `ghcr.io/zfdupont/wnba-epm:release`; a runbook covering host seeding, nginx, secrets.

- [ ] **Step 1: Add the failing assertion**

Append to `test_deployment_files_present` in `tests/test_deployment_files.py`:

```python
    # Compose references the GHCR image so `docker compose pull` works on deploy.
    assert "ghcr.io/zfdupont/wnba-epm:release" in compose
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_deployment_files.py::test_deployment_files_present -v`
Expected: FAIL.

- [ ] **Step 3: Add `image:` to both services**

In `docker-compose.yml`, add an `image:` line to each service so `pull` resolves and `build` still works locally:

```yaml
  api:
    build: .
    image: ghcr.io/zfdupont/wnba-epm:release
```

```yaml
  refresh:
    build: .
    image: ghcr.io/zfdupont/wnba-epm:release
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_deployment_files.py -v`
Expected: PASS.

- [ ] **Step 5: Write the deployment runbook**

Create `docs/DEPLOY.md` with these exact sections (fill commands as shown):

````markdown
# Droplet Deployment Runbook: wnba-epm API

## One-time droplet setup

```bash
sudo mkdir -p /var/www/wnba-epm
sudo chown "$USER" /var/www/wnba-epm
git clone git@github.com:zfdupont/wnba-epm.git /var/www/wnba-epm
cd /var/www/wnba-epm
git checkout release
cp .env.example .env   # set ALLOWED_ORIGINS=https://zfdupont.com
```

### Seed models/ and data/ (required for the refresh loop)

`models/` and `data/` are gitignored and absent from the image. Build the
frozen prior once and stage prior-season EPM:

```bash
uv sync
uv run wnba-epm retrain     # writes models/spm.json
uv run wnba-epm winprob     # writes models/winprob_model.json
uv run wnba-epm refresh     # first artifacts into data/serve/*.json
```

These host directories are bind-mounted by compose (`./models:ro`, `./data`).

## GitHub Actions secrets (repo Settings -> Secrets -> Actions)

- `DROPLET_HOST` - droplet IP/hostname
- `DROPLET_USER` - deploy user
- `DROPLET_SSH_KEY` - private key authorized on the droplet

## nginx

Replace the existing `location /api` block so the prefix is stripped and
requests reach the FastAPI container on loopback:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8000/;
}
```

`/api/epm` -> `:8000/epm`, `/api/predictions` -> `:8000/predictions`.
Reload: `sudo nginx -t && sudo systemctl reload nginx`.

## Cutover

```bash
cd /var/www/wnba-epm
docker compose pull
docker compose up -d
curl -s http://127.0.0.1:8000/health
curl -s https://zfdupont.com/api/epm | head -c 200
curl -s https://zfdupont.com/api/predictions | head -c 200
```

Then stop the old Flask service: `pm2 stop wnba-stats && pm2 delete wnba-stats`.
````

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml docs/DEPLOY.md tests/test_deployment_files.py
git commit -m "docs: droplet deploy runbook; compose references GHCR image"
```

---

### Task 4: Publish `wnba-epm` to GitHub

Create the GitHub repo, push `main` and a `release` branch. Run directly (repo/branch state change).

**Files:** none (git/remote operations).

**Interfaces:**
- Produces: `git@github.com:zfdupont/wnba-epm.git` with `main` and `release` branches; enables blogfolio's submodule (Task 5) and the deploy workflow (Task 2).

- [ ] **Step 1: Verify no secrets are tracked**

Run: `git ls-files | grep -E '\.env$|\.pem$|_key$' ; git grep -niE 'password|secret|api[_-]?key|token' -- ':!*.md' ':!uv.lock' | head`
Expected: no `.env`/key files tracked; no real secrets in source. `.env.example` placeholders are fine.

- [ ] **Step 2: Create the remote repo**

Run: `gh repo create zfdupont/wnba-epm --private --source=. --remote=origin`
(Use `--public` instead of `--private` if the portfolio links should be public.)

- [ ] **Step 3: Push main**

Run: `git push -u origin main`

- [ ] **Step 4: Create and push the release branch**

Run: `git checkout -b release && git push -u origin release && git checkout main`
Expected: both branches on the remote.

- [ ] **Step 5: Verify**

Run: `git ls-remote --heads origin`
Expected: `refs/heads/main` and `refs/heads/release` present.

- [ ] **Step 6: Configure Actions secrets**

Per `docs/DEPLOY.md`, add `DROPLET_HOST`, `DROPLET_USER`, `DROPLET_SSH_KEY` in the repo's Actions secrets (via `gh secret set` or the web UI). No commit; this is a GitHub-side step.

---

### Task 5: Swap the submodule in `blogfolio`

Replace `projects/wnba-stats` with `projects/wnba-epm`. Run in a local `blogfolio` clone. Run directly (submodule/index changes beyond add+commit).

**Files (in blogfolio):**
- Modify: `.gitmodules`
- Remove: `projects/wnba-stats`
- Add: `projects/wnba-epm`

**Interfaces:**
- Consumes: the published repo from Task 4.
- Produces: `projects/wnba-epm` submodule; `.gitmodules` pointing at `wnba-epm`.

- [ ] **Step 1: Ensure a clean blogfolio working copy**

Run (from your blogfolio clone root):
`git status --porcelain` -> expected empty. If you only have the ephemeral `/tmp/blogfolio-probe`, clone fresh: `git clone git@github.com:zfdupont/blogfolio.git`.

- [ ] **Step 2: Remove the old submodule**

Run:
```bash
git submodule deinit -f projects/wnba-stats
git rm -f projects/wnba-stats
rm -rf .git/modules/projects/wnba-stats
```

- [ ] **Step 3: Add the new submodule**

Run: `git submodule add git@github.com:zfdupont/wnba-epm.git projects/wnba-epm`

- [ ] **Step 4: Verify**

Run: `cat .gitmodules && git submodule status`
Expected: `.gitmodules` has one entry, `path = projects/wnba-epm`, `url = ...wnba-epm.git`; `git submodule status` lists `projects/wnba-epm` at a commit.

- [ ] **Step 5: Commit**

```bash
git add .gitmodules projects/wnba-epm
git commit -m "chore: swap wnba-stats submodule for wnba-epm"
```

---

### Task 6: Rewrite `app/wnba/page.tsx` (ratings + predictions)

Replace the BPM table with an EPM ratings table plus a predictions section, consuming the new API.

**Files (in blogfolio):**
- Modify: `app/wnba/page.tsx` (full rewrite)

**Interfaces:**
- Consumes: `GET {API_BASE}/api/epm` -> `IPlayer[]`; `GET {API_BASE}/api/predictions` -> `IPrediction[]`; `GET {API_BASE}/api/meta` -> `{ season?: number }`.
- Produces: the `/wnba` page UI.

- [ ] **Step 1: Replace the file contents**

Overwrite `app/wnba/page.tsx` with:

```tsx
'use client'

import { useState, useEffect } from "react";
import Loader from "app/components/loader";
import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "https://zfdupont.com";
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

type SortKey = "player_name" | "teams" | "possessions" | "epm" | "o_epm" | "d_epm";

const COLUMNS: { label: string; key: SortKey | null }[] = [
    { label: "Rk", key: null },
    { label: "Name", key: "player_name" },
    { label: "Teams", key: "teams" },
    { label: "Poss", key: "possessions" },
    { label: "EPM", key: "epm" },
    { label: "O-EPM", key: "o_epm" },
    { label: "D-EPM", key: "d_epm" },
];

export default function Page() {
    const [players, setPlayers] = useState<IPlayer[]>([]);
    const [predictions, setPredictions] = useState<IPrediction[]>([]);
    const [season, setSeason] = useState<number | null>(null);
    const [isLoading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sortKey, setSortKey] = useState<SortKey>("epm");
    const [order, setOrder] = useState<"ASC" | "DESC">("DESC");

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
        <tr key={player.player_id} className="border-b-1 hover:bg-slate-100/10 text-right">
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
            <tr key={g.game_id} className="border-b-1 hover:bg-slate-100/10 text-right">
                <td className="text-left p-2">
                    {g.away_name} @ {g.home_name}
                </td>
                <td className="p-2">{g.pred_margin.toFixed(1)}</td>
                <td className="p-2">{(g.home_win_prob * 100).toFixed(0)}%</td>
            </tr>
        ));

    return (
        <section className="min-w-full flex flex-col justify-center items-center">
            <h1 className="text-2xl mb-5">
                {season ? `${season} ` : ""}WNBA Player Ranking (EPM)
            </h1>
            <table className="table-fixed">
                <thead>
                    <tr>{headers}</tr>
                </thead>
                <tbody>{body}</tbody>
            </table>

            {upcoming.length > 0 && (
                <>
                    <h2 className="text-xl mt-10 mb-3">Upcoming Game Predictions</h2>
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
                </>
            )}
        </section>
    );
}
```

- [ ] **Step 2: Format**

Run: `pnpm exec prettier --write app/wnba/page.tsx`

- [ ] **Step 3: Verify the build compiles**

Run: `pnpm build`
Expected: build succeeds with no type errors in `app/wnba/page.tsx`.

- [ ] **Step 4: Manual smoke against a local API**

In the `wnba-epm` checkout: `uv run uvicorn wnba_epm.api.app:app --port 8000` (with seeded `data/serve`). In blogfolio: `NEXT_PUBLIC_API_BASE=http://localhost:8000 pnpm dev`, open `/wnba`. Note the API here serves `/epm` not `/api/epm`; for local-only testing set `NEXT_PUBLIC_API_BASE` to a proxy that adds `/api`, or temporarily test against the deployed origin. Confirm: ratings table populates, sorting works, predictions render, and stopping the API shows the "being refreshed" message rather than broken cells.

- [ ] **Step 5: Commit**

```bash
git add app/wnba/page.tsx
git commit -m "feat: point /wnba at EPM API with ratings + predictions"
```

---

### Task 7: Update blogfolio docs and methodology link

Bring blogfolio's `CLAUDE.md` and the page's external link in line with the new service.

**Files (in blogfolio):**
- Modify: `CLAUDE.md` (WNBA feature section)

**Interfaces:**
- Consumes: nothing.
- Produces: accurate docs describing the `wnba-epm` FastAPI submodule.

- [ ] **Step 1: Update the WNBA feature description**

In blogfolio `CLAUDE.md`, replace the paragraph describing `projects/wnba-stats` (Flask + BPM + `wnbabpm.csv` + pandas) with a description of `projects/wnba-epm`: a git submodule (`git@github.com:zfdupont/wnba-epm.git`), a FastAPI read-only service exposing `/epm`, `/predictions`, `/meta`, `/health` over JSON artifacts produced by the EPM pipeline, deployed independently as a Docker Compose stack behind nginx `/api/`. Update the `app/wnba/page.tsx` description to note it fetches `/api/epm` and `/api/predictions`.

- [ ] **Step 2: Verify no stale references remain**

Run: `grep -rniE 'wnba-stats|bpm|wnbabpm|/api/players' CLAUDE.md app/wnba/page.tsx`
Expected: no matches (the methodology link and BPM copy are gone). If the old basketball-reference BPM link still exists in the page from Task 6, remove it (the rewrite already drops it; this confirms).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: describe wnba-epm submodule and EPM api"
```

---

### Task 8: Droplet cutover and end-to-end verification

Execute the runbook on the droplet and verify the live site. Operational; run on the droplet.

**Files:** none (droplet operations per `docs/DEPLOY.md`).

**Interfaces:**
- Consumes: the published repo (Task 4), the deploy workflow (Task 2), the runbook (Task 3), the swapped submodule + frontend (Tasks 5-6).
- Produces: a live `/wnba` page backed by the EPM API; the old Flask service retired.

- [ ] **Step 1: One-time droplet setup + seed**

Follow `docs/DEPLOY.md` "One-time droplet setup" and "Seed models/ and data/". Confirm `data/serve/epm.json`, `predictions.json`, `meta.json` exist on the host.

- [ ] **Step 2: Repoint nginx**

Apply the `location /api/` block from the runbook. Run: `sudo nginx -t && sudo systemctl reload nginx`. Expected: config test OK.

- [ ] **Step 3: Bring up the stack**

Run: `cd /var/www/wnba-epm && docker compose pull && docker compose up -d`
Then: `docker compose ps` -> `api` healthy.

- [ ] **Step 4: Verify endpoints through nginx**

Run:
```bash
curl -s http://127.0.0.1:8000/health
curl -s https://zfdupont.com/api/health
curl -s https://zfdupont.com/api/epm | head -c 200
curl -s https://zfdupont.com/api/predictions | head -c 200
```
Expected: `/health` returns `{"status":"ok",...}`; `/api/epm` returns a JSON array starting with a player object (e.g. `A'ja Wilson`); `/api/predictions` returns a JSON array of games.

- [ ] **Step 5: Verify the page**

Open `https://zfdupont.com/wnba`. Expected: EPM ratings table populated and sortable; "Upcoming Game Predictions" table rendered.

- [ ] **Step 6: Retire the old service**

Run: `pm2 stop wnba-stats && pm2 delete wnba-stats && pm2 save`. Confirm `/wnba` still works (now served by the new stack). The old `zfdupont/wnba-stats` GitHub repo can be archived separately (out of scope).

---

## Self-Review

**Spec coverage:**
- A. Publish to GitHub -> Task 4.
- B. Swap submodule -> Task 5.
- C. Rewrite `app/wnba/page.tsx` (ratings + predictions, 503-tolerant, season from meta, drop BPM link) -> Task 6 (+ Task 7 for docs/link cleanup).
- D. Deploy workflow + compose + nginx -> Tasks 2, 3; loopback binding -> Task 1; cutover -> Task 8.
- Testing/verification -> Tasks 1-3 (pytest), 6 (build + manual), 8 (curl smoke).
- Risks/prereqs (TLS `:443`, first-deploy 503, host seeding, retire Flask) -> covered in Task 3 runbook and Task 8; 503-tolerance in Task 6.

**Placeholder scan:** No TBD/TODO. All code steps contain full content. The one deliberately manual detail (dev `NEXT_PUBLIC_API_BASE` prefix caveat in Task 6 Step 4) is described with the reason, not left vague.

**Type consistency:** `IPlayer` fields (`player_id, player_name, teams, possessions, o_epm, d_epm, epm`) match `data/serve/epm.json`. `IPrediction` fields (`game_id, date, home_name, away_name, pred_margin, home_win_prob`) match `predictions.json`. `SortKey` union matches the sortable `IPlayer` numeric/string fields and the `COLUMNS` keys. `season` from `/api/meta` matches `meta.json`'s `season`. Compose image tag `ghcr.io/zfdupont/wnba-epm:release` is identical across Tasks 2 and 3 and the workflow.
