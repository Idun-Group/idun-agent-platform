/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  // Temporary while admin pages migrate to the reworked admin API.
  // Flip back to strict once observability/mcp/guardrails/integrations/prompts
  // pages are updated.
  typescript: { ignoreBuildErrors: true },
  // ESLint runs explicitly via `pnpm lint` (advisory in v1 per the Idun
  // coding-guideline rollout — see UI-001/002/003 in docs/team/CODING-GUIDELINES.md).
  // Decoupling from `next build` keeps production builds independent of the
  // PLAN-3 flat-config rule set, which is intentionally stricter than the
  // pre-existing code can satisfy without a dedicated cleanup PR.
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
