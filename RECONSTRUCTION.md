# Reconstruction report

## 1. Source analyzed

The complete local mirror was scanned without crawling the Internet. It contained 7,336 files (about 1.05 GB), including 315 HTML files, 2,980 CSS files, 2,388 JavaScript files, 1,506 JPG files, 109 PNG files, 10 SVG files and 31 local font files. No local video or JSON content was present.

HTTrack created a separate filename for every cache-busted query. Hash comparison reduced the apparent frontend code to 10 unique CSS payloads and 12 unique JavaScript payloads. The transfer log was used to recover the original URL and pagination query for each cached HTML response.

The import contains 298 successful page responses mapped to 154 public routes. The invalid `/cuu-ho` response, the robots-blocked admin response, and the HTML fragment under `/ajax/` are not exposed as pages.

## 2. Frameworks and libraries found

The original frontend used:

- Bootstrap CSS/JavaScript
- jQuery and jQuery UI (including touch-punch)
- Slick carousel
- Fancybox 3
- Magic Zoom Plus
- Font Awesome webfonts
- custom `functions.js` and `apps.js`

The reconstructed runtime uses Next.js App Router, React, TypeScript, react-slick and html-react-parser. Original Bootstrap/style/media/login CSS and Font Awesome fonts remain because their class contract controls visual fidelity. Legacy jQuery, Bootstrap JavaScript, Fancybox JavaScript and Magic Zoom JavaScript are not loaded. React components implement the interactions; Magic Zoom's hover magnifier is not reproduced (the gallery supports thumbnails and a full-image lightbox).

GSAP, ScrollTrigger, Three.js, Lenis and Swiper were not found.

## 3. Pages migrated

The route manifest covers:

- `/` home page
- `/san-pham` and its captured pagination query snapshots
- brand, model, body-style and advanced-search listing pages
- all captured vehicle-detail pages
- sell, trade-in and service pages
- news, recruitment, testimonials, policies and about content
- captured showroom pages
- sign-in, sign-up and forgotten-password presentation pages

No route was invented for content absent from the clone. A dynamic App Router segment serves only paths present in `data/routes.json`; unknown paths return the project 404 page.

## 4. Component structure

- `components/layout/Header.tsx`: desktop navigation, dropdowns, mobile drawer, hotline and account links.
- `components/layout/Footer.tsx`: newsletter presentation, social links, service/about/account navigation, showroom addresses and floating contact actions.
- `components/common/LegacyPage.tsx`: typed page boundary.
- `components/common/LegacyContent.tsx` and `Markup.tsx`: CMS content parsed into React nodes, with interactive regions replaced by components.
- `components/common/Carousel.tsx`: react-slick with the original autoplay, fade, speed and responsive settings.
- `components/car/CarCard.tsx`, `CarGallery.tsx`: reusable vehicle cards and synchronized gallery.
- `components/common/SiteInteractions.tsx`: filter sliders, popup lifecycle, keyboard handling, comparison, validation and cleanup.
- `data/cars.json`, `categories.json`, `shared.json`: extracted inventory, category membership, navigation, footer and contacts.
- `lib/pages.ts`: server-only route/query resolution and page-data loading.

Rich CMS-authored page bodies are stored as data snapshots rather than duplicated as hundreds of JSX files. Shared layout and behavior are React source, and the application has no runtime dependency on the mirror HTML.

## 5. Interactions migrated

- desktop dropdown and React-controlled mobile navigation
- local lazy-image hydration
- responsive Slick-compatible carousels with arrows, swipe, autoplay and hero fade
- product gallery thumbnail switching
- filter drawer open/close and selectable filter presentation
- local two-car comparison using captured card fields (not the unavailable server's full comparison response)
- service links to captured destination pages and staff accordion states
- read-more/read-less content
- keyword search navigation
- form validation/presentation with an explicit backend-required notice
- smooth back-to-top control
- Zalo and telephone actions

Custom listeners are removed during effect cleanup; react-slick owns its carousel timers. No legacy jQuery or tracking scripts are loaded.

## 6. External dependencies

Required UI assets are local. Social/profile links, Zalo links and Google Maps direction links remain ordinary external links. The insurance menu entry remains an external link because the original menu intentionally points to that service.

The original Google Analytics/Tag Manager loader, `_osh/collect.js`, Google reCAPTCHA loader and delayed AJAX script injection were classified as tracking/backend integrations and were not migrated. No Facebook/TikTok content was crawled.

## 7. Information unavailable from the frontend clone

The clone does not contain server source, database schema, session/authentication implementation, original CMS models, current inventory endpoint, server-side form processing, reCAPTCHA secret, or AJAX PHP handlers. The mirror also recorded missing jQuery UI sprite requests and a missing `/cuu-ho` page; these cannot be reconstructed faithfully from the supplied public frontend.

The original home page fetched featured cars through an unavailable `ajax/load_them.php` response, so that live payload is absent from the snapshot. The migration does not invent those records.

## 8. Missing API/backend work

- connect login, registration and password recovery to the future authentication service
- connect sell/trade-in/contact/newsletter forms to a backend
- connect dependent make/model selectors
- connect live inventory search and load-more; keyword search and supported filters currently use captured inventory, and captured pagination URLs resolve to their original snapshots
- supply color metadata and live inventory fields missing from captured cards
- connect full vehicle comparison and finance calculations if required
- supply the missing service-tab AJAX payloads; tabs currently navigate to captured service pages
- add a new reCAPTCHA site/secret pair when forms become active

Until then, captured content stays usable and forms clearly report that submission needs a backend instead of silently calling dead PHP URLs.

## 9. Remaining external assets

No visual asset is hotlinked to the old website. External URLs that remain are navigation destinations (social networks, maps, Zalo and insurance), not images/fonts/scripts required for rendering.

## 10. Next TODOs

1. Connect the application to Supabase or the selected backend using a typed service layer.
2. Replace static inventory snapshots with API data while preserving the current `item_sp` markup contract.
3. Add integration tests for filter, auth and submission flows after backend endpoints exist.
4. Review remaining dynamic states with stakeholders before any CSS redesign/refactor.
5. Keep the generated page data and assets under version control so the project stays independent of the removed HTTrack mirror.

## 11. Historical UI fidelity correction pass — 2026-09-22

Restored the source header/menu DOM, route-active states, full footer/contact content, original card layout, real responsive carousels, gallery, filters and popup styling. Removed layout overrides and invented home featured records. Fixed margin collapse around empty listing carousels (15 px) and React Slick thumbnail baseline spacing (6.5 px on mobile).

Automated browser comparison covers 11 representative pages at 375, 768, 1024 and 1440 px: home, listing, vehicle detail, sell, trade-in, about, news, showroom, sign-in, sign-up and testimonials. After targeted corrections all 44 page/viewport pairs have matching document heights. Section geometry and screenshots are also recorded; this is **not a claim of zero pixel difference**, nor exhaustive visual approval of every one of the 154 routes.

The Next pages in this matrix have no uncaught browser exceptions or broken images. All 298 captured route/query URLs passed the HTTP/render smoke check. Existing horizontal overflow in the source on certain mobile pages is retained rather than redesigned. Source-side reCAPTCHA errors are not copied into the application.

Interaction tests exercise desktop dropdown/active state, repeated contact-popup opening and Escape, filter tabs/range keyboard/reset, two-car comparison/removal, keyword results, synchronized gallery/lightbox navigation, and mobile submenu/Escape. Asset validation covers 298 snapshots, shared markup, inventory and CSS (1,531 unique local references); the six missing jQuery UI sprites and `/cuu-ho` are documented source gaps.

The 372 recorded matching section instances have no bounding-box differences greater than 1 px after corrections. Production `npm run build` passes, including TypeScript validation and generation of 157 pages.

The comparison results above were recorded before cleanup and before the later accidental file move. They document the state that existed at that time; they are not a new pixel-equivalence claim for CMS bodies regenerated during recovery. The remaining route, asset and interaction checks can be rerun using the scripts in `scripts/`. AJAX-only states cannot be asserted visually against a payload absent from the mirror.

## 12. Project cleanup — 2026-09-22

After verifying that all 298 page snapshots were referenced by the route manifest and all runtime assets were copied into `public/`, the original HTTrack HTML/cache/logs, HTTrack index and image files, visual comparison output and mirror-dependent import/comparison scripts were removed. `app/`, `components/`, `data/`, `lib/`, `public/`, `types/`, npm dependencies, production build files and the remaining verification scripts were retained. The original mirror can no longer be used for another visual comparison without a separate copy.

## 13. Recovery after accidental move — 2026-09-23

The application directories `app/`, `components/`, `data/` and `lib/` were found missing after an interrupted cut/move. Git contained no earlier project snapshot or dangling object because its first commit was created after the loss. No recoverable copy was present in the Recycle Bin, VS Code history, either searched drive or available shadow-copy view.

The full React/TypeScript source was reconstructed from local Codex file-change history. Generated runtime data was rebuilt from 298 recorded successful request URLs (154 canonical routes), four cached copies of the original home document, the surviving 571 MB local asset library and locally evidenced vehicle records. This restored the original navigation/footer/home structure, six known featured vehicles, 87 routable vehicle records and a self-contained page file for every recorded route.

At the first recovery pass, the deleted generated JSON bodies for CMS/static pages and most vehicle details could not be recovered byte-for-byte. Those routes temporarily used structurally compatible local content while preserving the original CSS class contract and shared UI. The subsequent recovery pass described below replaced most of those temporary bodies with actual website content.

Recovery verification completed successfully:

- TypeScript check and optimized Next.js production build
- 157 generated static pages
- 298/298 recorded pathname/query smoke checks
- zero missing runtime image/font/style assets referenced by recovered data
- desktop and mobile checks for dropdown navigation, contact dialog, filters, compare flow, keyword search, synchronized gallery/lightbox and mobile drawer
- six featured home cards, no broken home images and no mobile horizontal overflow at 390 px

## 14. Page-content recovery follow-up — 2026-09-23

Local Codex session history supplied the original listing filter/sidebar, sort, branch and comparison markup. It was restored on 49 listing/category pages while retaining the captured route inventory and local car-card component. The official website still served 17 previously incomplete information, account and article pages and 77 of the 87 captured vehicle-detail URLs. Their current page bodies and galleries were imported as local data, and 121 missing local thumbnail images were added. The 77 available detail pages also supplied names, prices, specifications and gallery paths for their vehicle cards. `data/car-source-status.json` records which card records came from these pages; `data/recovery-source-status.json` records the detail-page fetch results.

Ten historical vehicle-detail URLs returned no usable original page at recovery time. Their local fallback pages remain, with car-card data from earlier local evidence where available and otherwise inferred. They must not be described as exact copies. The 17 and 77 restored bodies reflect the *currently served* official website, which may differ from the deleted 2026-09-22 mirror. The 298 captured URLs remain routable, but query-specific listing/pagination bodies are not proven identical to the lost snapshots. Backend-only responses and the seven source gaps listed by asset validation also remain unavailable.

After this pass, asset validation and TypeScript checks passed, the production build generated 157 pages, all 298 recorded URLs passed the HTTP/render smoke check, and the desktop/mobile interaction checks passed. These checks establish local functionality and asset completeness, not pixel-perfect equivalence with the lost mirror.
