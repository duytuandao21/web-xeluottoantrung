import type { NextConfig } from "next";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import versionedImages from "./config/versioned-images.json";
import versionedFonts from "./config/versioned-fonts.json";

const nextConfig: NextConfig = {
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  devIndicators: false,
  images: { unoptimized: true },
  poweredByHeader: false,
  async headers() {
    // Exact, append-only image versions. Changed pixels require a NEW filename
    // and manifest entry; never update a published version's expected hash.
    const imageHeaders = versionedImages.map(image => {
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
    const fontHeaders = versionedFonts.map(font => {
      if (!/^\/assets\/fonts\/[A-Za-z0-9-]+\.[a-f0-9]{12}\.woff2$/.test(font.src) || !font.src.includes(font.sha256.slice(0, 12))) {
        throw new Error(`Invalid versioned font path: ${font.src}`);
      }
      const file = path.join(process.cwd(), "public", font.src.slice(1));
      if (createHash("sha256").update(readFileSync(file)).digest("hex") !== font.sha256) {
        throw new Error(`Published font changed: ${font.src}. Create a new fingerprinted file instead.`);
      }
      return { source: font.src, headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] };
    });
    return [...imageHeaders, ...fontHeaders];
  },
  async rewrites() {
    const apiOrigin = (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');
    return [{ source: '/api/v1/:path*', destination: `${apiOrigin}/api/v1/:path*` }];
  },
};

export default nextConfig;
