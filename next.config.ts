import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
