import Link from 'next/link';
import type { ReactNode } from 'react';

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <nav
        aria-label="保護エリア内ナビゲーション"
        role="navigation"
        className="flex flex-wrap items-center gap-3 rounded-lg border border-brand-border bg-brand-surface-alt px-4 py-3 text-sm font-medium"
      >
        <Link href="/dashboard" className="tap-target text-brand-primary hover:text-brand-primary/80">
          ダッシュボード
        </Link>
        <span aria-hidden="true" className="text-brand-muted">
          /
        </span>
        <Link href="/nfc" className="tap-target text-brand-primary hover:text-brand-primary/80">
          NFC打刻
        </Link>
      </nav>
      <div className="flex-1">{children}</div>
    </div>
  );
}
