import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@nothing/shared'],
  experimental: { typedRoutes: true },
};

export default nextConfig;
