# Xe Lướt Toàn Trung — frontend reconstruction

Next.js App Router reconstruction of the supplied HTTrack mirror. After an accidental file move removed the application source and generated data, the React source was restored from local change history and the runtime data was rebuilt from the recorded route inventory, cached home document and intact local assets.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Production validation:

```bash
npm run typecheck
npm run build
npm start
```

Development writes its build cache to `.next-dev/`; production build/start use `.next/`. The two modes can run at the same time without overwriting each other's server chunks.

## Project structure

- `app/` — App Router layout, home page, dynamic migrated routes and global migration fixes.
- `components/layout/` — React header, navigation, mobile menu and footer.
- `components/common/` — migrated page renderer and interaction lifecycle.
- `data/pages/` — self-contained build-time page data for every recovered route/query.
- `data/cars.json`, `categories.json`, `shared.json` — recovered vehicle data, category membership and cached original navigation/footer content.
- `components/car/` — vehicle cards and synchronized image gallery.
- `data/route-manifest.json` — exact pathname/query-to-snapshot mapping recovered from the HTTrack transfer log.
- `lib/` and `types/` — typed page loading and shared types.
- `public/` — local images, thumbnails, fonts, icons and the ten deduplicated legacy stylesheets.
- `scripts/` — checks for local assets, routes and browser interactions.

See [RECONSTRUCTION.md](./RECONSTRUCTION.md) for the migration inventory, dependency decisions and backend TODOs.

## Verification

`npm run validate` checks local assets and captured links. With the app running on port 3100 (`npm run dev -- -p 3100`):

```bash
node scripts/interaction-check.mjs
node scripts/route-check.mjs
```

The original HTTrack mirror was removed before the accidental move. All files required to install, build and run the recovered project are now included under `app/`, `components/`, `data/`, `lib/`, `public/` and `types/`. These checks generate temporary reports in `artifacts/` (ignored). Forms/authentication, live inventory and PHP-only responses still need a backend; no successful submission is simulated. The 2026-09-23 recovery restored 17 information/account pages and 77 vehicle-detail pages from the currently available official website, plus the historical listing layout from local change history. Ten historical vehicle URLs no longer returned their original detail pages, and query-specific pagination bodies were not recovered. See [RECONSTRUCTION.md](./RECONSTRUCTION.md) for provenance and limitations.
