import type { Metadata } from 'next';
import AccessErrorPage from '@/components/errors/AccessErrorPage';

export const metadata: Metadata = { title: 'Đăng nhập để tiếp tục', robots: { index: false, follow: false } };

// Informational access screen; authentication and HTTP statuses remain owned by the API.
export default function UnauthorizedPage() { return <AccessErrorPage code={401} />; }
