import type { NextConfig } from "next";


const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.jsdelivr.net',
        pathname: '/gh/spothq/cryptocurrency-icons@master/**',
      },
      {
        protocol: 'https',
        hostname: 'cryptoicons.org',
        pathname: '/api/icon/**',
      },
    ],
  },
  async rewrites() {
    const api = (process.env.NEXT_PUBLIC_API_BASE ?? "").trim().replace(/\/$/, "");
    if (!api) return [];
    return [
      // Proxya cualquier request del browser a /v1/* hacia tu API Gateway
      { source: "/v1/:path*", destination: `${api}/v1/:path*` },
    ];
  },
};

export default nextConfig;
