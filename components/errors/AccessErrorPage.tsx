'use client';

import ErrorState from './ErrorState';
import { useSaleAccess } from '@/components/sale/SaleAccess';

export default function AccessErrorPage({ code }: { code: 401 | 403 }) {
  const sale = useSaleAccess();
  return <ErrorState code={code} onSignIn={code === 401 ? sale?.openLogin : undefined} />;
}
