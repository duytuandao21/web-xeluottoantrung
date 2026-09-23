import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import manifestJson from "@/data/route-manifest.json";
import routesJson from "@/data/routes.json";
import type { LegacyPageData, SearchParams } from "@/types/legacy";
import {searchSnapshot} from './search';

const manifest = manifestJson as Record<string, string>;

function searchString(searchParams: SearchParams) {
  const pairs: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) value.forEach((item) => pairs.push([key, item]));
    else if (value !== undefined) pairs.push([key, value]);
  }
  pairs.sort(([a], [b]) => a.localeCompare(b));
  return new URLSearchParams(pairs).toString();
}

export async function getLegacyPage(pathname: string, searchParams: SearchParams = {}) {
  const normalizedPath = pathname.replace(/\/$/, "") || "/";
  const search = searchString(searchParams);
  const exactKey = `${normalizedPath}${search ? `?${search}` : ""}`;
  const localSearch=(normalizedPath==='/san-pham' && Boolean(searchParams.keyword)) || (normalizedPath==='/tim-kiem-nang-cao' && !manifest[exactKey]);
  const file = localSearch ? manifest['/san-pham'] : manifest[exactKey] ?? manifest[normalizedPath];
  if (!file) return null;
  const raw = await readFile(path.join(process.cwd(), "data", "pages", file), "utf8");
  const page=JSON.parse(raw) as LegacyPageData;
  return localSearch?searchSnapshot(page,searchParams):page;
}

export function getStaticRoutes() {
  return (routesJson as string[]).filter((route) => route !== "/");
}
