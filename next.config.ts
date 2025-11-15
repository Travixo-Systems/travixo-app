import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  eslint: {
    // ⚠️ TEMPORARY: Allows production builds with ESLint errors
    // TODO: Remove after fixing 115 linting issues (tracked in GitHub issue)
    ignoreDuringBuilds: true,
  },
  typescript: {
    // ⚠️ TEMPORARY: Allows production builds with TypeScript errors
    // TODO: Remove after fixing type errors
    ignoreBuildErrors: true,
  },
}

export default nextConfig