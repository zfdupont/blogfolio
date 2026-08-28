# Dockerize Next.js site with GitHub Actions CI/CD

**Date:** 2026-08-27
**Status:** Approved (design), pending implementation plan
**Scope owner:** zfdupont

## Summary

Containerize the `portfolio` Next.js app and replace its manual PM2 deploy with
an automated pipeline: a push to `release` builds a Docker image in GitHub
Actions, pushes it to the GitHub Container Registry (ghcr.io) as a **public**
package, then SSHes into the DigitalOcean droplet to pull the image and restart
the container via docker compose. Host nginx is unchanged and continues to
reverse-proxy `127.0.0.1:3000`.

## Goals

- One-command-equivalent, reproducible production deploys triggered by pushing to `release`.
- Build work happens on GitHub runners, not the 1 GB droplet.
- Small, non-root runtime image using Next.js standalone output.
- No downtime tolerance beyond a brief container swap; simple rollback by image tag.

## Non-goals / out of scope

- Containerizing the WNBA Flask API (`projects/wnba-stats`) — it is being replaced separately.
- The sibling `huskies` / `huskies-server` apps — they stay on PM2, untouched.
- Containerizing nginx — the host nginx is shared across apps and stays as-is.
- TLS / certificate changes.
- Any change to the WNBA page or its runtime `https://zfdupont.com/api/players` calls.

## Context / current state

- Repo: `git@github.com:zfdupont/blogfolio.git`. Production deploy branch: `release`.
- Host: DigitalOcean droplet `ubuntu-s-1vcpu-1gb-nyc3-01` (1 vCPU / 1 GB), Ubuntu, root access.
- Current run model: PM2 (as root) manages `portfolio` (Next.js `next start`, canary
  `next-server v14.2.0-canary`, port 3000), plus `FLASK_APP=app`, `huskies`, `huskies-server`.
- Host nginx terminates TLS and proxies `/` → `127.0.0.1:3000`.
- No `next.config.*` and no `.dockerignore` currently exist.
- The Next.js build has no build-time dependency on the `projects/wnba-stats` submodule
  (the WNBA page calls the API over HTTP at runtime), so the submodule is excluded from
  the image build context.

## Architecture

```
 developer ──push release──▶ GitHub
                                │
                    ┌───────────┴───────────────┐
                    │ Actions: deploy.yml        │
                    │                            │
                    │ job build-and-push         │
                    │   checkout                 │
                    │   docker buildx build      │
                    │   login ghcr (GITHUB_TOKEN)│
                    │   push :release + :<sha>   │
                    │            │               │
                    │ job deploy │ (needs build) │
                    │   ssh droplet ─────────────┼──▶ droplet
                    └────────────────────────────┘      │
                                                         ▼
                              cd <repo> && git pull
                              docker compose pull portfolio
                              docker compose up -d portfolio
                              docker image prune -f
                                         │
                                         ▼
                     container portfolio  ⇄  127.0.0.1:3000
                                         ▲
                              host nginx (unchanged) ── zfdupont.com
```

## Components

### 1. `next.config.js` (new)

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
}
module.exports = nextConfig
```

- `output: 'standalone'` makes `next build` emit `.next/standalone/server.js` with a
  minimal traced `node_modules`, so the runtime image needs no `pnpm install`.
- `reactStrictMode: true` aligns with the global Next.js standard.
- Risk: `next` is pinned to `canary`. Standalone output is stable in Next 14, but the
  build must be verified against the pinned canary during implementation.

### 2. `Dockerfile` (new) — multi-stage, non-root, healthcheck

Stages:

- **`deps`** (`node:20-alpine`): enable pnpm via `corepack`, copy `package.json` +
  `pnpm-lock.yaml`, run `pnpm install --frozen-lockfile`.
- **`builder`** (`node:20-alpine`): copy `deps` `node_modules` + full source, run
  `pnpm build`.
- **`runner`** (`node:20-alpine`): create/keep non-root `node` user, set
  `NODE_ENV=production`, copy from builder:
  - `.next/standalone` → app root
  - `.next/static` → `.next/static`
  - `public` → `public`
  Then `EXPOSE 3000`, `USER node`, a `HEALTHCHECK` that requests `http://localhost:3000/`,
  and `CMD ["node", "server.js"]`.

Notes:
- Node 20 alpine LTS is used for the image regardless of the droplet's system Node 18.
- `HOSTNAME=0.0.0.0` and `PORT=3000` env set so the standalone server binds correctly
  inside the container.
- Healthcheck uses a lightweight HTTP request (node one-liner or `wget`, whichever the
  alpine base provides without extra packages).

### 3. `.dockerignore` (new)

Excludes at minimum: `node_modules`, `.next`, `.git`, `projects/`, `.env`, `.env.*`
(except `.env.example`), `docs/`, `**/*.md` build noise as appropriate, `.DS_Store`,
`.vscode`, `.idea`. Keeps the build context small and guarantees the Python submodule
and any local env files never enter the image.

### 4. `docker-compose.yml` (new, repo root)

```yaml
services:
  portfolio:
    image: ghcr.io/zfdupont/blogfolio:release
    ports:
      - "127.0.0.1:3000:3000"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
```

- Port bound to `127.0.0.1` so only host nginx reaches the container.
- Lives in the repo; the droplet has the repo checked out, so `git pull` refreshes the
  compose file before `docker compose pull`.
- `:release` is a moving tag updated on each deploy; the immutable `:<sha>` tag is used
  for rollback.

### 5. `.github/workflows/deploy.yml` (new)

Trigger: `push` to `release`. (Optionally `workflow_dispatch` for manual re-runs.)

- **Job `build-and-push`**
  - `permissions: { contents: read, packages: write }`
  - checkout (no submodules)
  - `docker/setup-buildx-action`
  - `docker/login-action` to `ghcr.io` with `${{ github.actor }}` / `${{ secrets.GITHUB_TOKEN }}`
  - `docker/build-push-action`: push tags `ghcr.io/zfdupont/blogfolio:release` and
    `ghcr.io/zfdupont/blogfolio:${{ github.sha }}`, with GitHub Actions layer cache.
- **Job `deploy`** (`needs: build-and-push`)
  - SSH to the droplet using `appleboy/ssh-action` (or raw ssh) with secrets
    `DROPLET_HOST`, `DROPLET_USER`, `DROPLET_SSH_KEY`.
  - Remote script:
    ```
    cd <DROPLET_APP_DIR>
    git pull --ff-only
    docker compose pull portfolio
    docker compose up -d portfolio
    docker image prune -f
    ```

### Registry visibility

The ghcr package `ghcr.io/zfdupont/blogfolio` is **public**. Consequence: the droplet
pulls with no `docker login`. Justification: the image contains only the built, publicly
served site — no secrets (guaranteed by `.dockerignore` excluding `.env*`). Making the
package public is a one-time setting in the GitHub package settings after the first push.

### GitHub secrets required

| Secret | Purpose |
|--------|---------|
| `DROPLET_HOST` | droplet IP / hostname for SSH |
| `DROPLET_USER` | SSH user (`root`) |
| `DROPLET_SSH_KEY` | private key of a dedicated deploy keypair; public key added to droplet `authorized_keys` |
| `DROPLET_APP_DIR` | (optional) path to the repo checkout on the droplet; can be hardcoded in the workflow instead |

`GITHUB_TOKEN` is built in and used for pushing to ghcr — no manual secret needed.

## Data flow

Runtime request path is unchanged from today: `zfdupont.com` → host nginx (TLS) →
`127.0.0.1:3000` → Next.js server (now the container instead of the PM2 process). Blog
content is baked into the image at build time (MDX read from `app/blog/posts` during
`next build`). The WNBA page still fetches `https://zfdupont.com/api/players` at runtime
from whatever serves `/api` (out of scope here).

## One-time droplet cutover (documented runbook, not automated)

1. Install Docker Engine + compose plugin on the droplet.
2. Generate a dedicated deploy SSH keypair; add the public key to the droplet's
   `authorized_keys`; store the private key as `DROPLET_SSH_KEY`.
3. Ensure the repo is checked out on the droplet at `DROPLET_APP_DIR` on the `release` branch.
4. Free port 3000: `pm2 delete portfolio && pm2 save`.
5. First deploy: `docker compose pull portfolio && docker compose up -d portfolio`.
6. Verify container healthy and `https://zfdupont.com` serves. Host nginx needs **no**
   change (still proxies `127.0.0.1:3000`).

Zero-downtime variant (optional, documented): run the new container on `127.0.0.1:3001`,
switch the nginx upstream to 3001, confirm, then remove the PM2 `portfolio` and move the
container back to 3000. For a personal site the brief swap in steps 4–5 is acceptable.

## Rollback

- Every build pushes an immutable `:<sha>` tag.
- To roll back: on the droplet, `docker compose` pull/run pinned to the previous
  `ghcr.io/zfdupont/blogfolio:<previous-sha>` (temporarily override the image tag or set
  it via an env var in compose), or re-run the workflow from the previous commit.
- Document the exact command in the README deploy section.

## Resource considerations (1 GB droplet)

- Image builds run on GitHub runners — no build-time memory pressure on the droplet.
- Runtime: standalone Next server ~60–100 MB replaces the retired ~53 MB PM2 `portfolio`;
  Docker daemon adds ~30–50 MB idle. Net roughly neutral.
- Disk is the main new cost (accumulated images/layers); mitigated by `docker image prune -f`
  after each deploy.
- huskies / Java apps remain on PM2 and are untouched.

## Testing / verification

- **Local build:** `docker build -t blogfolio .` succeeds against the pinned canary Next.
- **Local run:** `docker run --rm -p 3000:3000 blogfolio`, then `curl -f localhost:3000`
  returns the homepage; container reports healthy.
- **CI:** the `build-and-push` job succeeds (serves as the de-facto build check for `release`).
- **Post-deploy:** compose healthcheck goes healthy; `curl -f https://zfdupont.com` returns 200.
- **Rollback drill:** deploy a known-good `:<sha>` and confirm the site serves it.

## Documentation updates

- Update `README.md` Deployment section: replace the PM2 build/restart flow for the
  `portfolio` app with the Docker/compose + GitHub Actions flow, keep the PM2 notes for
  the sibling apps, and add the rollback command.
- Update `CLAUDE.md` to note the container-based deploy for the site.

## Open items / assumptions

- Assumes Docker Engine + compose plugin can be installed on the droplet (root available — yes).
- Assumes the repo is (or will be) checked out on the droplet for compose-file refresh.
  Alternative considered and rejected for simplicity: `scp` the compose file from CI.
- Node 20-alpine chosen for the image; revisit only if a native dependency needs glibc.

## Files changed / added

| Path | Change |
|------|--------|
| `next.config.js` | new — standalone output + strict mode |
| `Dockerfile` | new — multi-stage build |
| `.dockerignore` | new |
| `docker-compose.yml` | new |
| `.github/workflows/deploy.yml` | new |
| `README.md` | edit — deploy section |
| `CLAUDE.md` | edit — deploy note |
