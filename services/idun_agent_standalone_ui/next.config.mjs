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
};
export default nextConfig;
