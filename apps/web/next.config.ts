import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Railway's Docker build performs `npm run typecheck` explicitly after
  // next build; CI and local builds retain Next.js built-in type checking.
  typescript: {
    ignoreBuildErrors: process.env.BREWLITE_SEPARATE_TYPECHECK === '1',
  },
  devIndicators: false,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
};

export default nextConfig;