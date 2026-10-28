import type { Metadata } from 'next';
import ErrorState from '@/components/errors/ErrorState';

export const metadata: Metadata = { title: 'Vui lòng chờ ít phút', robots: { index: false, follow: false } };

export default function TooManyRequestsPage() { return <ErrorState code={429} />; }
