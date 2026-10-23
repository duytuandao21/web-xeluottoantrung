import type { ReactNode } from 'react';
import './tv.css';

/** Separate root: no storefront shell, authentication, popup or footer requests. */
export default function DisplayLayout({ children }: { children: ReactNode }) {
  return <html lang="vi"><body className="tv-body">{children}</body></html>;
}
