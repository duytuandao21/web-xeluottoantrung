import type { NextConfig } from "next";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import versionedImages from "./config/versioned-images.json";

const nextConfig: NextConfig = {
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  devIndicators: false,
  images: { unoptimized: true },
  poweredByHeader: false,
  async headers() {
    // Exact, append-only image versions. Changed pixels require a NEW filename
    // and manifest entry; never update a published version's expected hash.
    return versionedImages.map(image => {
      if (!/^\/images\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.lossless-v[1-9]\d*\.webp$/.test(image.src)) {
        throw new Error(`Invalid versioned image path: ${image.src}`);
      }
      const file = path.join(process.cwd(), "public", image.src.slice(1));
      const digest = createHash("sha256").update(readFileSync(file)).digest("hex");
      if (digest !== image.sha256) {
        throw new Error(`Published image version changed: ${image.src}. Create a new version instead.`);
      }
      return {
        source: image.src,
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      };
    });
  },
  async rewrites() {
    const apiOrigin = (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');
    return [{ source: '/api/v1/:path*', destination: `${apiOrigin}/api/v1/:path*` }];
  },
};

export default nextConfig;
