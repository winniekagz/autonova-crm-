import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  // Trace workspace packages when running from the monorepo root.
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
  poweredByHeader: false,
  reactStrictMode: true,
};

export default config;
