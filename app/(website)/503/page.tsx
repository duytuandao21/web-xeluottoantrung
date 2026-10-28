import type { Metadata } from 'next';
import ErrorState from '@/components/errors/ErrorState';

export const metadata: Metadata = { title: 'Dịch vụ tạm gián đoạn', robots: { index: false, follow: false } };

export default function UnavailablePage() { return <ErrorState code={503} />; }
