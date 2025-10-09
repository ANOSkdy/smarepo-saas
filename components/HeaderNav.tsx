'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function shouldHideDashboardLink(pathname: string | null | undefined): boolean {
  if (!pathname) {
    return false;
  }
  return pathname.startsWith('/dashboard');
}

export function shouldHideNfcLink(pathname: string | null | undefined): boolean {
  if (!pathname) {
    return false;
  }
  return pathname.startsWith('/nfc');
}

export function resolveNfcHref(pathname: string | null | undefined): string {
  return shouldHideDashboardLink(pathname) ? '/nfc?machineid=1001' : '/nfc';
}

export default function HeaderNav() {
  const pathname = usePathname();
  const hideDashboard = shouldHideDashboardLink(pathname);
  const hideNfc = shouldHideNfcLink(pathname);
  const nfcHref = resolveNfcHref(pathname);

  return (
    <nav
      aria-label="保護エリア内ナビゲーション"
      role="navigation"
      className="flex items-center gap-4 text-sm font-medium"
    >
      {!hideDashboard ? (
        <Link href="/dashboard" className="tap-target text-brand-primary hover:text-brand-primary/80">
          ダッシュボード
        </Link>
      ) : null}
      {!hideNfc ? (
        <Link href={nfcHref} className="tap-target text-brand-primary hover:text-brand-primary/80">
          打刻ページ
        </Link>
      ) : null}
    </nav>
  );
}
