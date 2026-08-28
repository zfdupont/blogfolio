# Dockerize Next.js Site with GitHub Actions CI/CD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual PM2 deploy of the `portfolio` Next.js app with a Docker image built by GitHub Actions on push to `release`, pushed to ghcr.io, and rolled out to the droplet over SSH via docker compose.

**Architecture:** A multi-stage Dockerfile builds the Next.js standalone server into a small non-root `node:20-alpine` runtime image. A GitHub Actions workflow builds and pushes the image to a public ghcr.io package, then SSHes into the droplet to `docker compose pull && up -d`. Host nginx is unchanged and keeps proxying `127.0.0.1:3000`.

**Tech Stack:** Next.js (canary, App Router), pnpm 9, Docker (multi-stage, buildx), docker compose, GitHub Actions, GitHub Container Registry (ghcr.io), nginx (host, unchanged).

**Spec:** `docs/superpowers/specs/2026-08-27-dockerize-nextjs-cicd-design.md`

## Global Constraints

- Runtime base image: `node:20-alpine`. Run as the non-root `node` user.
- Package manager: **pnpm 9** (repo `pnpm-lock.yaml` is `lockfileVersion: '9.0'`). Install deps with `--frozen-lockfile`.
- Next.js build output: **`output: 'standalone'`**. The runtime image runs `node server.js`, not `next start`.
- Registry: `ghcr.io/zfdupont/blogfolio`, **public** package. Push tags `release` and `<git-sha>`.
- Deploy trigger: push to the **`release`** branch only.
- Container port binding: `127.0.0.1:3000:3000` (localhost only; host nginx fronts it).
- Do NOT modify: the WNBA page or its `https://zfdupont.com/api/players` calls, the `projects/wnba-stats` submodule, or the sibling `huskies` / `huskies-server` PM2 apps.
- The `projects/wnba-stats` submodule and all `.env*` files must be excluded from the image build context.

---

### Task 1: Next.js standalone config + pnpm pin

**Files:**
- Create: `next.config.js`
- Modify: `package.json` (add top-level `packageManager` field)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `next build` emits `.next/standalone/server.js` and `.next/static/`. Later Docker tasks depend on those paths existing.

- [ ] **Step 1: Establish the failing verification**

Run: `pnpm install && pnpm build && test -f .next/standalone/server.js && echo STANDALONE_OK`
Expected: build succeeds but prints nothing for `STANDALONE_OK` (the `.next/standalone` directory does not exist yet because standalone output is off). This confirms the gap.

- [ ] **Step 2: Create `next.config.js`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
}

module.exports = nextConfig
```

- [ ] **Step 3: Pin pnpm in `package.json`**

Add this top-level field (a sibling of `"scripts"`), so Docker's corepack activates the matching pnpm 9:

```json
"packageManager": "pnpm@9.15.4"
```

- [ ] **Step 4: Run the verification and confirm it passes**

Run: `pnpm build && test -f .next/standalone/server.js && echo STANDALONE_OK`
Expected: prints `STANDALONE_OK`. If the canary Next version errors on `output: 'standalone'`, stop and report — do not work around it.

- [ ] **Step 5: Commit**

```bash
git add next.config.js package.json
git commit -m "feat: enable Next.js standalone output and pin pnpm 9"
```

---

### Task 2: Dockerfile + .dockerignore

**Files:**
- Create: `.dockerignore`
- Create: `Dockerfile`

**Interfaces:**
- Consumes: `next.config.js` standalone output and the pinned `packageManager` from Task 1.
- Produces: a runnable image serving the site on container port 3000 as the non-root `node` user, with a working `HEALTHCHECK`. Later tasks reference the image by the tag `ghcr.io/zfdupont/blogfolio:release`.

- [ ] **Step 1: Create `.dockerignore`**

```
node_modules
.next
.git
.gitmodules
projects
docs
.env
.env.*
!.env.example
.DS_Store
.vscode
.idea
npm-debug.log*
.pnpm-debug.log*
Dockerfile
.dockerignore
```

- [ ] **Step 2: Create `Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# node:20-alpine already provides a non-root `node` user
COPY --from=builder /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
```

- [ ] **Step 3: Build the image (this is the test — it must succeed)**

Run: `docker build -t blogfolio:test .`
Expected: build completes through all three stages with no error. The final image should be small (tens of MB, not hundreds) because only standalone output is copied.

- [ ] **Step 4: Run the container and verify it serves**

Run:
```bash
docker run --rm -d -p 3000:3000 --name bf-test blogfolio:test
sleep 3
curl -fsS http://localhost:3000 >/dev/null && echo SERVE_OK
docker inspect --format '{{.Config.User}}' bf-test   # expect: node
docker stop bf-test
```
Expected: `SERVE_OK` prints, and the user is `node` (confirms non-root). If curl fails, check `docker logs bf-test`.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "feat: add multi-stage Dockerfile and dockerignore"
```

---

### Task 3: docker-compose.yml

**Files:**
- Create: `docker-compose.yml`

**Interfaces:**
- Consumes: the image built in Task 2, tagged as `ghcr.io/zfdupont/blogfolio:release`.
- Produces: a `portfolio` compose service the droplet deploy step controls with `docker compose pull/up`.

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
services:
  portfolio:
    image: ghcr.io/zfdupont/blogfolio:release
    container_name: portfolio
    ports:
      - "127.0.0.1:3000:3000"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
```

- [ ] **Step 2: Verify compose config parses**

Run: `docker compose config`
Expected: prints the resolved config with no error.

- [ ] **Step 3: Verify compose runs the local image end-to-end**

Tag the Task 2 build as the compose image name, then bring it up:
```bash
docker tag blogfolio:test ghcr.io/zfdupont/blogfolio:release
docker compose up -d
sleep 5
docker compose ps            # STATUS should show healthy
curl -fsS http://localhost:3000 >/dev/null && echo COMPOSE_OK
docker compose down
```
Expected: `COMPOSE_OK` prints and `docker compose ps` reports the container `healthy`.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add docker-compose service for portfolio"
```

---

### Task 4: GitHub Actions build-and-deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: the Dockerfile (Task 2) and `docker-compose.yml` (Task 3); the repo secrets `DROPLET_HOST`, `DROPLET_USER`, `DROPLET_SSH_KEY` (created by the operator, see end of plan).
- Produces: on push to `release`, a published `ghcr.io/zfdupont/blogfolio:release` + `:<sha>` image and a droplet running the new container.

- [ ] **Step 1: Create `.github/workflows/deploy.yml`**

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
            ghcr.io/zfdupont/blogfolio:release
            ghcr.io/zfdupont/blogfolio:${{ github.sha }}
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
            cd /root/blogfolio
            git fetch origin release
            git checkout release
            git pull --ff-only origin release
            docker compose pull portfolio
            docker compose up -d portfolio
            docker image prune -f
```

Note: `cd /root/blogfolio` is the assumed repo path on the droplet. If the checkout lives elsewhere, change this one line (and the operator section below) to match.

- [ ] **Step 2: Validate the workflow file**

Run (if `actionlint` is installed): `actionlint .github/workflows/deploy.yml`
Otherwise validate YAML: `docker run --rm -i ghcr.io/rhysd/actionlint:latest -color < .github/workflows/deploy.yml` or `python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/deploy.yml')); print('YAML_OK')"`
Expected: no lint/parse errors (`YAML_OK`).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add build-and-deploy workflow for release branch"
```

- [ ] **Step 4: Record what still needs live verification**

The workflow cannot be fully exercised until the operator steps (secrets, droplet Docker install, public package) are done and a commit is pushed to `release`. Do not mark the feature done on green YAML alone; the post-deploy checks in Task 6 are the real gate.

---

### Task 5: Documentation — README and CLAUDE.md

**Files:**
- Modify: `README.md` (Deployment section)
- Modify: `CLAUDE.md` (deploy note)

**Interfaces:**
- Consumes: the workflow, Dockerfile, and compose service from Tasks 2–4.
- Produces: the operator-facing deploy + rollback runbook.

- [ ] **Step 1: Rewrite the `README.md` Deployment section for the `portfolio` app**

Replace the PM2 build/restart instructions for `portfolio` (keep the PM2 notes for the sibling apps) with:
- The CI/CD flow: push to `release` → Actions builds + pushes ghcr image → SSH deploy runs `docker compose pull && up -d`.
- The one-time droplet cutover runbook (see operator steps at the end of this plan).
- The rollback procedure:

```bash
# On the droplet: roll back to a previous image by SHA.
# The ghcr package is public, so no docker login is needed.
cd /root/blogfolio
IMG=ghcr.io/zfdupont/blogfolio:<previous-sha>
docker pull "$IMG"
docker tag "$IMG" ghcr.io/zfdupont/blogfolio:release
docker compose up -d portfolio
```

- Local test instructions: `docker build -t blogfolio . && docker run --rm -p 3000:3000 blogfolio`, then `curl localhost:3000`.

- [ ] **Step 2: Update `CLAUDE.md`**

In the deployment description, note that the `portfolio` site now deploys as a Docker container (`ghcr.io/zfdupont/blogfolio`) via the `release` GitHub Actions workflow and docker compose, replacing the previous `pm2 restart portfolio` flow; the sibling apps remain on PM2.

- [ ] **Step 3: Verify docs are internally consistent**

Run: `grep -n "pm2 restart portfolio" README.md`
Expected: no matches (the old site-restart instruction is gone; sibling-app PM2 references may remain).

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: document Docker/CI-CD deploy and rollback for the site"
```

---

### Task 6: End-to-end deploy verification (after operator steps)

**Files:** none (verification only).

**Interfaces:**
- Consumes: everything above, plus the completed operator steps.
- Produces: a confirmed live deployment; this is the feature's acceptance gate.

- [ ] **Step 1: Confirm operator prerequisites are done**

Checklist (see operator section): Docker + compose plugin installed on droplet; repo checked out at `/root/blogfolio` on `release`; deploy keypair added and secrets set; ghcr package will be made public after first push.

- [ ] **Step 2: Trigger the pipeline**

Push the branch to `release` (via merge/PR of the `dockerize-cicd` work into `release`, per the repo's normal flow).
Run: watch `gh run watch` or the Actions tab.
Expected: `build-and-push` then `deploy` both succeed.

- [ ] **Step 3: Make the ghcr package public (first push only)**

In GitHub → the `blogfolio` package settings → change visibility to Public. Re-run the `deploy` job if it failed earlier due to a private pull.

- [ ] **Step 4: Verify the live site**

Run:
```bash
ssh <droplet> 'cd /root/blogfolio && docker compose ps'   # portfolio: healthy
curl -fsS -o /dev/null -w "%{http_code}\n" https://zfdupont.com   # expect 200
```
Expected: container `healthy`, site returns `200`, and `pm2 list` no longer shows a running `portfolio` (it was deleted during cutover).

- [ ] **Step 5: Commit any doc corrections found during the live run**

If the live run revealed a wrong path or step, fix the README/workflow and commit:
```bash
git add -A
git commit -m "fix: correct deploy docs/workflow after live verification"
```

---

## Operator steps (manual, performed by the human — not automated by this plan)

These run once, on GitHub and on the droplet. They are prerequisites for Task 6.

1. **Droplet: install Docker.** Install Docker Engine + the compose plugin; confirm `docker compose version`.
2. **Droplet: check out the repo** at `/root/blogfolio` on the `release` branch (or adjust the path in `deploy.yml` and the docs).
3. **Deploy key.** Generate a dedicated keypair (`ssh-keygen -t ed25519 -C blogfolio-deploy`), append the public key to the droplet's `~/.ssh/authorized_keys`, and store the private key as the GitHub secret `DROPLET_SSH_KEY`.
4. **GitHub secrets.** Add `DROPLET_HOST` (droplet IP/host) and `DROPLET_USER` (`root`).
5. **Cutover (first deploy).** On the droplet: `pm2 delete portfolio && pm2 save` to free port 3000, then let the workflow's `deploy` job (or a manual `docker compose up -d portfolio`) start the container. Host nginx already proxies `127.0.0.1:3000`, so no nginx change is required.
6. **Make the ghcr package public** after the first successful push (Task 6, Step 3).

---

## Self-Review

**Spec coverage:**
- next.config standalone + strict → Task 1. ✓
- Multi-stage non-root Dockerfile + healthcheck → Task 2. ✓
- .dockerignore excluding submodule/env → Task 2, Step 1. ✓
- docker-compose localhost:3000 service → Task 3. ✓
- GitHub Actions build+push (ghcr, GITHUB_TOKEN, sha+release tags) and SSH deploy → Task 4. ✓
- Public package → operator step 6 / Task 6 Step 3. ✓
- Secrets list → Task 4 interfaces + operator steps 3–4. ✓
- Droplet cutover runbook → operator steps + Task 5. ✓
- Rollback by sha → Task 5, Step 1. ✓
- README + CLAUDE.md updates → Task 5. ✓
- 1 GB resource note → covered in spec; not a code task (documented in README deploy section via Task 5). ✓
- Keep host nginx / don't touch WNBA + huskies → Global Constraints. ✓

**Placeholder scan:** The only intentional fill-ins are `<previous-sha>` (rollback target chosen at rollback time) and `<droplet>` (operator's host) — both are runtime values, not unspecified plan content. No TBD/TODO/"add error handling" placeholders.

**Type/name consistency:** Image name `ghcr.io/zfdupont/blogfolio`, tags `release` + `<sha>`, compose service `portfolio`, container port `3000`, droplet path `/root/blogfolio`, secrets `DROPLET_HOST`/`DROPLET_USER`/`DROPLET_SSH_KEY` are used identically across Tasks 3, 4, 5, 6 and the operator steps.
