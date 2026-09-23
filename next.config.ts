import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  devIndicators: false,
  images: { unoptimized: true },
  poweredByHeader: false,
};

export default nextConfig;
