import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingExcludes: {
    '/api/research': ['./next.config.ts'],
  },
}

export default nextConfig
