import type { Metadata } from 'next';
import ErrorState from '@/components/errors/ErrorState';

export const metadata: Metadata = { title: 'Tạm thời chưa tải được trang', robots: { index: false, follow: false } };

export default function ServerErrorPage() { return <ErrorState code={500} />; }
