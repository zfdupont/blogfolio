# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Personal portfolio and blog site at zfdupont.com, self-hosted on a DigitalOcean droplet behind nginx. Built on the Next.js Portfolio Starter (App Router). The blog is file-based MDX; there is also an interactive WNBA player-ranking page backed by a separate Python stats service.

The Next.js site (`portfolio`) deploys as a Docker container (`ghcr.io/zfdupont/blogfolio`) via the `release` GitHub Actions workflow: push to `release` builds the image, pushes it to GHCR, then SSHes to the droplet and runs `docker compose up -d portfolio`. This replaces the previous `pm2 restart portfolio` flow. Sibling apps on the same droplet (`huskies`, `huskies-server`, the Flask WNBA API) remain on PM2.

## Commands

Package manager is **pnpm** (see `pnpm-lock.yaml`).

- `pnpm dev` — start dev server (Next.js `canary`)
- `pnpm build` — production build
- `pnpm start` — serve the production build

There are no lint, test, or typecheck scripts defined. Prettier is the only dev dependency (`.prettierrc` sets `printWidth: 80`); run it via `pnpm exec prettier`. Note `tsconfig.json` has `strict: false` but `strictNullChecks: true`.

## Architecture

Next.js App Router under `app/`. Everything is a Server Component by default; the only client component is `app/wnba/page.tsx` (`'use client'`).

- `app/layout.tsx` — root layout wiring Geist fonts, Vercel Analytics/SpeedInsights, `Navbar`, and `Footer`. `metadataBase` derives from `baseUrl`.
- `app/sitemap.ts` — exports `baseUrl` (the canonical site URL, currently `http://zfdupont.com`). Many files import `baseUrl` from here, so it is the single source of truth for the site origin.
- `app/og/route.tsx` and `app/rss/route.ts` — dynamic OG image generation and the RSS feed.

### Blog (file-based MDX)

Blog posts are `.mdx` files in `app/blog/posts/`. To add a post, drop in a new `.mdx` file with frontmatter (`title`, `publishedAt`, `summary`, optional `image`) — no config or registry changes needed.

- `app/blog/utils.ts` reads posts at build time with `fs`. It uses a **hand-rolled frontmatter parser** (`parseFrontmatter`), not `gray-matter` — frontmatter must be simple `key: value` lines. `getBlogPosts()` reads from `app/blog/posts` via `process.cwd()`.
- `app/blog/[slug]/page.tsx` renders a post; `generateStaticParams` statically generates one route per file, and `generateMetadata` builds per-post OpenGraph/Twitter tags (falling back to a generated OG image).
- `app/components/mdx.tsx` (`CustomMDX`) renders MDX via `next-mdx-remote/rsc` with custom components: auto-slugged headings with anchor links, `sugar-high` syntax highlighting for code, a `Table` component, and internal/external link handling.

### WNBA feature

`app/wnba/page.tsx` is a client component that fetches player rankings from an **external API** (`https://zfdupont.com/api/players?sort=...&order=...`) via axios, and renders a sortable table (click column headers to change sort key/order). Rows are filtered to players with >250 minutes.

That API is served by `projects/wnba-stats/`, a **git submodule** (`git@github.com:zfdupont/wnba-stats.git`). It is a Flask app (`server/app.py`) that reads `wnbabpm.csv` with pandas and returns JSON; the CSV is produced by the Box Plus/Minus (BPM) pipeline in `bpm.py`/`scrape.py`/`constants.py`. This service is deployed separately — it is not part of the Next.js build. When cloning, use `git submodule update --init` to populate it.

## Notes

- Tailwind CSS v4 (alpha) via `@tailwindcss/postcss`; global styles live in `app/global.css`.
- `next` is pinned to `canary`.
