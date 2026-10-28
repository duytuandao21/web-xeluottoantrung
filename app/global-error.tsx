'use client';

import ErrorState from '@/components/errors/ErrorState';

export default function GlobalError() {
  return <html lang="vi"><head><title>Tạm thời gián đoạn | Xe Lướt Toàn Trung</title><meta name="robots" content="noindex, nofollow" /></head>
    <body style={{ margin: 0 }}><ErrorState code={500} standalone onRetry={() => window.location.reload()} /></body></html>;
}
