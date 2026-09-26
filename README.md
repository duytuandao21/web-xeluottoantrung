# Xe Lướt Toàn Trung — frontend reconstruction

Next.js App Router website for Xe Lướt Toàn Trung. The original layout, assets, and information pages come from a recovered snapshot. Vehicle inventory, SEO, several content sections, showrooms, and public forms now use the NestJS API.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev -- -p 3001
```

Open `http://localhost:3001`. Start the API on port 4000 first. Set `API_URL` to the API origin reachable by the Next.js server and `NEXT_PUBLIC_API_URL` to the API origin reachable by visitors' browsers. Include the web origin in the API's `CORS_ORIGINS`.

Production validation:

```bash
npm run lint
npm run typecheck
npm run build
npm start
```

Development writes its build cache to `.next-dev/`; production build/start use `.next/`. The two modes can run at the same time without overwriting each other's server chunks.

## Project structure

- `app/` — App Router layout, home page, dynamic migrated routes and global migration fixes.
- `components/layout/` — React header, navigation, mobile menu and footer.
- `components/common/` — migrated page renderer and interaction lifecycle.
- `data/pages/` — layout and static information snapshots. Snapshot vehicle inventory is no longer rendered.
- `data/shared.json` — recovered navigation and contact markup.
- `lib/public-api.ts`, `lib/public-pages.ts` — public API client, server rendering, and adapters for the existing page markup.
- `components/car/` — vehicle cards and synchronized image gallery.
- `data/route-manifest.json` — exact pathname/query-to-snapshot mapping recovered from the HTTrack transfer log.
- `lib/` and `types/` — typed page loading and shared types.
- `public/` — local images, thumbnails, fonts, icons and the ten deduplicated legacy stylesheets.
- `scripts/` — checks for local assets, routes and browser interactions.

See [RECONSTRUCTION.md](./RECONSTRUCTION.md) for the migration inventory, dependency decisions and backend TODOs.

## Public filter data

The listing and advanced search filters read active API records on each request (no Next.js data cache):

| Filter | Admin/API source |
| --- | --- |
| Brand | `/brands` |
| Branch | `/lookups/branches`; selected slug is passed to `/cars?branch=...` |
| Body style, transmission, color | `/lookups/body-styles`, `/lookups/transmissions`, `/lookups/car-colors` |
| Budget, mileage | `/lookups/filter-options` groups `budget`, `mileage` |
| Year | Only `/content?group=thiet-lap-goi-y-nam-san-xuat` (year suggestions) |
| Price ordering | Fixed ascending/descending controls, applied by `/cars` |

All lookup pages are loaded. Inactive records are excluded by the public API. Refresh the public page after saving in admin. Range records use `minValue`/`maxValue` when provided (budget in millions of VND); older records are interpreted from their displayed names, including mixed units such as `800 triệu - 1 tỷ`. Unrecognizable ranges are shown disabled instead of applying an incorrect filter. Untouched ranges do not restrict results; reset clears all range selections.

## Verification

`node scripts/car-images-check.mjs` (with the local API and web running) checks cover/gallery ownership and simulates slow or failed image downloads while reordering cards. It uses fixture image bytes at the real media URLs; it does not modify database records or CDN assets.

The listing has immediate brand/body-style/branch selection rows. Selections are stored in the URL, preserved across pagination, and reflected in the advanced filter dialog. Clicking a selected option deselects it; an empty row does not restrict results. Changing a quick selection returns to page 1.

The footer groups active branches by their `regionId` and the active branch-region catalog, fetched without a data cache and across all pages. Assign a region in the admin branch form. Existing branches without a region remain under “Showroom khác”; branches in a hidden region are not placed into another region. Run `node scripts/showroom-check.mjs` to verify grouping.

`node scripts/filter-check.mjs` verifies numeric range conversions used by the public filters.

`npm run validate` checks local assets and captured links. With the app running on port 3100 (`npm run dev -- -p 3100`):

```bash
node scripts/interaction-check.mjs
node scripts/route-check.mjs
```

The website requires the API and database for live inventory and public content. An unpublished or deleted car returns 404 at its old URL. The legacy public account pages remain informational because customer authentication is outside the current API scope. See [frontend-integration.md](../api-xeluottoantrung/docs/frontend-integration.md) for route and API mappings.
