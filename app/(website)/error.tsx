'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import ErrorState from '@/components/errors/ErrorState';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <ErrorState code={500} pending={pending} onRetry={() => startTransition(() => { router.refresh(); reset(); })} />;
}
