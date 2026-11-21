import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    // CV uploads go through a server action (default limit is 1 MB).
    // Vercel caps request bodies at 4.5 MB; the app allows 4 MB files.
    serverActions: { bodySizeLimit: "4.5mb" },
  },
  images: {
    // GitHub profile pictures
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
