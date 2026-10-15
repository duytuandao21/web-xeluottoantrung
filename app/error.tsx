'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Failed required data must never look like a successful empty inventory.
  // The root layout (header/footer) remains mounted; normal pages are unchanged.
  return <main className="main_content main_fix" role="alert" style={{ paddingBlock: 48 }}>
    <h1 style={{ fontSize: 28, marginBottom: 12 }}>Tạm thời chưa tải được dữ liệu</h1>
    <p>Vui lòng thử lại sau ít phút.</p>
    <button type="button" disabled={pending} aria-busy={pending} onClick={() => startTransition(() => { router.refresh(); reset(); })} style={{ marginTop: 16, minHeight: 44, padding: '10px 24px', border: 0,
      borderRadius: 10, background: '#e00000', color: '#fff', font: 'inherit', cursor: 'pointer' }}>Thử lại</button>
  </main>;
}
