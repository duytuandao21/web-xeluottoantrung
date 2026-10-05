# Frontend Performance Optimization Report

## 1. Summary

Implemented bounded caching for stable public data, parallel homepage requests, request-scoped reuse of legacy page construction, and a lossless default logo. No UI, route, API contract, backend, or admin changes. No commit, push, or deployment.

## 2. Baseline

Source audit: `check.md` (2026-10-04). Root layout awaited about 11 public requests. Home had a policies -> snapshot -> cars -> other data waterfall. Metadata and page rendering each called the full legacy page builder. The user-provided 137 requests and 63.8 MB transfer lack route, viewport, cache state, and environment, so they cannot serve as a controlled before/after measurement.

Before editing, `git status --short` listed only untracked `check.md` and `toi-uu.md`. Baseline `npm` was blocked by the PowerShell script policy; `npm.cmd` ran, but the initial build was stopped before completion.

## 3. Phase 1 ? Public Data Cache

### Changed
`lib/public-api.ts:publicApi` now gives a 60-second Next fetch revalidation policy to brands, non-contact lookups, slides, testimonials, accessory taxonomies, FAQs, and recruitments. Inventory, accessories, services, branch/contact lookups, settings, content, SEO, and user-specific data remain `no-store`.

### Why
Stable lookup requests no longer have to reach EC2 for every SSR request. Next keys fetches by the full URL, including filter and pagination parameters.

### Behavior preserved
Response parsing, errors, and API endpoints are unchanged. Price, stock, and contact data remain fresh per request. Stable edits can be stale for the TTL and one stale-while-revalidate request; immediate admin visibility for those records would need an invalidation channel.

### Validation
Code path review, TypeScript check, and production build passed. Cache-hit rate has not been measured.

## 4. Phase 2 ? Homepage Parallelization

### Changed
`lib/public-pages.ts:getPublicPage('/')` starts the six-car request in the same `Promise.all` as slides, brands, lookups, testimonials, and content groups.

### Why
Those requests do not depend on the car result. The previous code waited for cars before starting the other group.

### Behavior preserved
The same results are awaited before producing the same card markup and section order. No carousel, filter, or fallback logic changed.

### Validation
The request list and DOM construction order were compared in the diff; TypeScript and production build passed. No production timing trace is available.

## 5. Phase 3 ? Root Layout

No layout restructuring. Footer/header data, SiteIntro, and legacy CSS timing make streaming risky without visual regression coverage. The stable lookup cache can shorten part of the layout work; contact and settings stay fresh.

## 6. Phase 4 ? Metadata

`lib/public-pages.ts:getRequestPublicPage` uses React `cache()` with a pathname and normalized search-parameter key. `app/page.tsx` and `app/[...slug]/page.tsx` use this helper for both page and metadata. Before: snapshot reading, Cheerio parsing, and markup construction could run twice in a render. After: both consumers share one request-scoped Promise. SEO calculation still uses the existing `pageMetadata` and page data. TypeScript and production build passed; browser comparison of rendered metadata remains outstanding.

## 7. Phase 5 ? Deferred SSR Content

No below-fold streaming or reduction of the homepage accessory limit. Both could alter hydration order, carousel contents, CLS, or SEO without browser evidence.

## 8. Phase 6 ? Listing/Detail

Stable lookup caching applies to listing. Year facets, pagination, related content, and slug resolution were left unchanged to preserve filter and detail behavior.

## 9. Phase 7 ? Media

`lib/site-branding.ts:DEFAULT_LOGO` now points to `public/upload/photo/logo-tt-gold-6981.webp`. Sharp lossless WebP is 114,634 bytes versus the original 4,103,349-byte PNG (3,988,715 bytes or 97.2% smaller). Both are 1600 x 640. A raw-pixel comparison found identical alpha and identical RGB for every visible pixel; differences occur only in fully transparent pixels. The original PNG remains. CMS-configured logos are unaffected. CSS, displayed dimensions, and SiteIntro animation were unchanged. Gallery image variants require a verified media pipeline.

## 10. Phase 8 ? Fonts

Kept the current SF Pro files. WOFF2/subsetting requires confirmation of license, Vietnamese glyph coverage, and metric/layout stability.

## 11. Phase 9 ? JavaScript

Kept current client boundaries and Supabase session lifecycle. Deferred imports need interaction timing and auth regression checks.

## 12. Phase 10 ? CSS

Kept all legacy stylesheets. Snapshot markup may use their selectors; safe removal or route scoping needs visual evidence.

## 13. Phase 11 ? Runtime Cleanup

Kept legacy searchSnapshot and CSR refresh paths where side effects and freshness are not established. Request-scoped page deduplication is documented in Phase 4.

## 14. Regression Validation

- `npm.cmd run build`: passed; Next reported existing `no-img-element` warnings.
- `tsc --noEmit --incremental false`: passed.
- `npm.cmd run validate`: passed, 1,486 assets, no missing assets. It reported seven existing source gaps.
- `git diff --check`: passed.
- `npm.cmd run lint`: passed after allowing its cache write; it reported existing `no-img-element` warnings. `npm.cmd run typecheck` could not write `tsconfig.tsbuildinfo` in the restricted sandbox; the non-writing TypeScript run passed.
- No production-like browser route, mobile, auth, form, carousel, or lightbox regression run was available. These remain verification limits, not claimed passes.

## 15. Performance Results

No controlled before/after TTFB, LCP, CLS, INP, request-count, or transfer trace was available. The direct measured result is the 3,988,715-byte reduction when the default logo is used. Homepage parallelism removes one avoidable API waterfall stage; real latency savings depend on EC2 response time and require staging measurement.

## 16. Deferred ? Requires Manual Approval

- Admin/backend invalidation if stable data must update instantly.
- Backend year-facet and responsive car/gallery image variants.
- Streaming footer/below-fold sections, font subsetting, client JS splitting, and legacy CSS removal until visual and behavior equivalence can be verified.
- Changes to slug resolution or searchSnapshot until route, SEO, and filter behavior can be proved equivalent.
- API deadlines until failure handling can preserve the existing meaning of critical and non-critical content.

## 17. Files Changed

| File | Function/component | Before -> after | Benefit | Risk and check |
| --- | --- | --- | --- | --- |
| `lib/public-api.ts` | `publicApi` | Broad no-store -> 60-second stable-data TTL | Fewer EC2 GETs | Short staleness; immediate paths reviewed, build passed |
| `lib/public-pages.ts` | Home loader | Cars then other data -> one Promise.all | Removes one waterfall stage | Same request set and output, build passed |
| `lib/public-pages.ts` | `getRequestPublicPage` | Separate page builds -> request cache | Less repeated parse/markup work | Key includes route/query, build passed |
| `app/page.tsx` | Page and metadata | Direct loader -> shared loader | Request deduplication | Existing metadata helper retained |
| `app/[...slug]/page.tsx` | Page and metadata | Direct loader -> shared loader | Request deduplication | Existing params and search retained |
| `lib/site-branding.ts` | `DEFAULT_LOGO` | PNG -> WebP fallback | 3.99 MB less for default logo | Visible pixels and alpha matched |
| `public/upload/photo/logo-tt-gold-6981.webp` | New asset | Added lossless WebP | Lower media transfer | Original PNG preserved |
