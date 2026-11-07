import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  // Trace workspace packages when running from the monorepo root.
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        // Everything except build assets: pages behind sign-in must never be stored by a shared cache.
        source: '/((?!_next/static|_next/image|favicon.ico).*)',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ];
  },
};

export default config;
