/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Overridable so a Playwright e2e server can use its own build dir and not
  // clobber a concurrently running `pnpm dev` (two dev servers sharing .next
  // corrupt each other's chunks).
  distDir: process.env.NEXT_DIST_DIR || '.next',
}

module.exports = nextConfig
