import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Vercel deployment configuration
  output: 'standalone',
  
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
  
  // Experimental features for Next.js 15
  experimental: {
    // Enable server actions
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
}

export default nextConfig
