import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  if (process.env.HOME_CMS_COMPOSITION !== 'true') return NextResponse.next();
  // Routing hint only, never an authentication or rate-limit exemption. Always
  // overwrite client input so non-home pages cannot accidentally fetch the view.
  const headers = new Headers(request.headers);
  headers.delete('x-tt-home-content');
  if (request.nextUrl.pathname === '/') headers.set('x-tt-home-content', '1');
  return NextResponse.next({ request: { headers } });
}
// Stable in Next 15.5. Keep routing in the existing Node server, avoiding a
// separate Edge sandbox for this small self-hosted SSR routing hint.
export const config = { runtime: 'nodejs', matcher: ['/((?!api|_next|.*\\..*).*)'] };
