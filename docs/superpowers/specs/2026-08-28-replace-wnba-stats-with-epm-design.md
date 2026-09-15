# Replace `wnba-stats` submodule with `wnba-epm` — Design

Date: 2026-08-28
Status: Approved
Repos touched: `zfdupont/wnba-epm` (this repo), `zfdupont/blogfolio`

## Goal

Retire the legacy Box Plus/Minus service (`zfdupont/wnba-stats`, a Flask +
pandas app reading a CSV) that currently backs the `/wnba` page on
zfdupont.com, and replace it with this project's EPM pipeline and read-only
FastAPI service. The portfolio's `/wnba` page gains both an EPM ratings table
(replacing the BPM table) and a new upcoming-game predictions view. This
project ships its own GitHub Actions deploy workflow so pushes auto-deploy to
the droplet.

## Background / current state

- `blogfolio` is a Next.js App Router site deployed as a GHCR Docker container
  via a `release` GitHub Actions workflow (build image, push to GHCR, SSH to
  the droplet, `docker compose up -d portfolio`).
- `app/wnba/page.tsx` is a `'use client'` axios component that calls
  `https://zfdupont.com/api/players?sort=&order=` and renders a sortable table
  of BPM metrics, filtered to `minutes > 250`.
- That endpoint is served by `projects/wnba-stats/`, a git submodule
  (`git@github.com:zfdupont/wnba-stats.git`) running as a separate Flask
  process on the droplet under PM2, proxied by nginx `location /api` to
  `127.0.0.1:5000/api`.
- This repo (`wnba-epm`) already exposes a read-only FastAPI service
  (`src/wnba_epm/api/`) over three JSON artifacts in `data/serve/`
  (`epm.json`, `predictions.json`, `meta.json`), with a Docker Compose stack
  (`api` + daily `refresh` loop) using host bind mounts. Both underlying plans
  (prediction-api, in-season-rating-refresh) are implemented and merged.
- This repo has no GitHub remote yet. `data/` and `models/` are gitignored, so
  neither the repo nor the built image contains any artifacts.

### API contract gap (why this is not a drop-in swap)

| | Old `wnba-stats` (Flask) | New `wnba-epm` (FastAPI) |
|---|---|---|
| Endpoint | `GET /api/players?sort=&order=` | `GET /epm`, `/predictions`, `/meta`, `/health` |
| Player fields | `name, minutes, mpg, bpm, obpm, dbpm, vorp` | `player_name, teams, possessions, o_epm, d_epm, epm` |
| Sorting | server-side | none (client sorts) |
| Deploy | PM2, single process | Docker Compose (`api` + `refresh`), bind-mounted `data/` + `models/` |

The frontend renders BPM/OBPM/DBPM/VORP columns that do not exist in EPM, so
the page must be rewritten; a compatibility shim is not viable.

## Design decisions (locked)

1. Coupling: swap the blogfolio submodule from `wnba-stats` to `wnba-epm`.
2. Deploy topology: `wnba-epm` deploys as an independent Compose stack in its
   own droplet directory via its own GitHub Actions workflow. The blogfolio
   submodule only pins source version; blogfolio's `release` workflow is
   unchanged.
3. Ratings freshness: the `refresh` loop runs live on the droplet, writing to a
   bind-mounted `data/` the `api` service reads.
4. nginx: repoint `location /api/` to the new container and strip the `/api`
   prefix so FastAPI keeps its native paths.
5. Frontend scope: EPM ratings table plus a new predictions section.

## Work breakdown

### A. Publish `wnba-epm` to GitHub

- Add remote `git@github.com:zfdupont/wnba-epm.git`, create the repo, push
  `main` (and a `release` branch used by the deploy workflow).
- Pre-push check: no secrets in tree. `.env` is gitignored, `.env.example`
  holds placeholders only.

### B. Swap the submodule in `blogfolio`

- `git submodule deinit -f projects/wnba-stats`, `git rm projects/wnba-stats`,
  remove `.git/modules/projects/wnba-stats`, delete the `.gitmodules` entry.
- `git submodule add git@github.com:zfdupont/wnba-epm.git projects/wnba-epm`.
- Update `.gitmodules` and the blogfolio `CLAUDE.md` prose that describes the
  old Flask/BPM service. Nothing in the Next.js build imports the submodule
  (it is referenced only by URL at runtime), so the path rename is safe.

### C. Rewrite `app/wnba/page.tsx` (ratings + predictions)

- Keep it a `'use client'` axios component.
- Ratings: `GET /api/epm`. New `IPlayer` interface:
  `{ player_id, player_name, teams, possessions, o_epm, d_epm, epm }`.
  Columns: `Rk, Name, Teams, Poss, EPM, O-EPM, D-EPM`. Client-side sort
  (the API returns unsorted); default sort desc by `epm`. Replace the
  `minutes > 250` filter with a possessions threshold (`possessions > 500`).
- Predictions: `GET /api/predictions`. New section below the table listing
  `Away @ Home`, predicted margin (`pred_margin`, one decimal), and home win %
  (`home_win_prob` as a percentage), sorted by `date`.
- Add loading and empty/`503`-tolerant states. The first deploy returns `503`
  until `refresh` has produced artifacts; the page must degrade gracefully
  rather than render `undefined` cells.
- Replace the hardcoded "2024" heading with the season from `GET /api/meta`.
- Replace the basketball-reference BPM methodology link with an EPM writeup or
  remove it.

### D. Deployment + nginx

- GitHub Actions workflow in `wnba-epm` (`.github/workflows/`), triggered on
  push to `release` plus `workflow_dispatch`:
  1. Build and push `ghcr.io/zfdupont/wnba-epm:release` and `:<sha>`.
  2. SSH to the droplet, `cd /var/www/wnba-epm`, `git pull` (to refresh the
     compose file), `docker compose pull`, `docker compose up -d`.
  - Reuses the `DROPLET_HOST`, `DROPLET_USER`, `DROPLET_SSH_KEY` secrets;
    these must be added to this repo's Actions secrets. Mirrors blogfolio's
    workflow structure.
- Compose on the droplet: `api` publishes `127.0.0.1:8000:8000` with
  `ALLOWED_ORIGINS=https://zfdupont.com`; `refresh` runs the daily loop over
  bind-mounted `./models` (ro) and `./data`. Prerequisite: seed `models/`
  (frozen `spm.json` + `winprob_model.json` via `wnba-epm retrain` +
  `wnba-epm winprob`) and prior-season `data/` on the host once.
- nginx: replace the current block with a prefix-stripping proxy so the app
  keeps native paths:
  ```nginx
  location /api/ { proxy_pass http://127.0.0.1:8000/; }
  ```
  `/api/epm` maps to `:8000/epm`, `/api/predictions` to `:8000/predictions`.
  Then retire the old Flask app on `:5000` (PM2).

## Testing / verification

- `wnba-epm`: the existing `pytest` suite stays green. Add a test asserting the
  configured `ALLOWED_ORIGINS` is honored by the app's CORS middleware. Verify
  endpoints locally via `docker compose up` and hitting `/health`, `/epm`,
  `/predictions`.
- `blogfolio`: no test runner exists. Verify `/wnba` by running the API locally
  and pointing the page at it via `pnpm dev`, exercising loading, populated,
  and `503`/empty states. Run `pnpm exec prettier` on the changed file.
- Deploy: first cut via `workflow_dispatch`; confirm `GET /api/health` then
  `GET /api/epm` and `GET /api/predictions` through nginx.

## Risks / prerequisites

1. The nginx config shared listens only on `:80`; the frontend calls `https://`.
   Assumes a `:443`/TLS block proxies the same way. Confirm before cutover.
2. First deploy returns `503` until `refresh` seeds `data/serve/*.json`;
   handled by the frontend's `503`-tolerant states.
3. The droplet host must have `models/` and prior-season `data/` seeded, plus
   outbound network access for ingest during `refresh`.
4. The old `zfdupont/wnba-stats` repo and its PM2 process get decommissioned as
   a manual follow-up (not deleted by this work).

## Out of scope

- Rewriting the `wnba-rookie-ranking.mdx` blog post.
- Any change to blogfolio's `release` workflow or the `portfolio` container.
- Deleting the old `wnba-stats` GitHub repository.
