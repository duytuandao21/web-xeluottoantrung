import type { Metadata } from 'next';
import AccessErrorPage from '@/components/errors/AccessErrorPage';

export const metadata: Metadata = { title: 'Bạn chưa có quyền truy cập', robots: { index: false, follow: false } };

export default function ForbiddenPage() { return <AccessErrorPage code={403} />; }
