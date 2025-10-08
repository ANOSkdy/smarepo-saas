import Link from 'next/link';
import type { ReactNode } from 'react';
import { auth } from '@/lib/auth';

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const displayName = session?.user?.name ?? session?.user?.email ?? '';

  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-brand-border bg-brand-surface-alt px-4 py-3">
        <nav aria-label="保護エリア内ナビゲーション" role="navigation" className="flex items-center gap-4 text-sm font-medium">
          <Link href="/dashboard" className="tap-target text-brand-primary hover:text-brand-primary/80">
            ダッシュボード
          </Link>
        </nav>
        {displayName ? <span className="text-sm font-medium text-brand-text">{displayName}</span> : null}
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
