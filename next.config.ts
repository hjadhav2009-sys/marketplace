import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    middlewareClientMaxBodySize: "100mb",
    serverActions: {
      bodySizeLimit: "100mb"
    }
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images-r.meesho.com"
      }
    ]
  }
};

export default nextConfig;
