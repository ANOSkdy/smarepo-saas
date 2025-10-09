'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function shouldHideNfcLink(pathname: string | null | undefined): boolean {
  if (!pathname) {
    return false;
  }
  return pathname.startsWith('/nfc');
}

export default function HeaderNav() {
  const pathname = usePathname();
  const hideNfc = shouldHideNfcLink(pathname);

  return (
    <nav aria-label="トップナビゲーション" role="navigation" className="flex flex-wrap gap-4 text-sm font-medium">
      <Link href="/dashboard" className="tap-target text-brand-primary hover:text-brand-primary/80">
        ダッシュボード
      </Link>
      {!hideNfc ? (
        <Link href="/nfc" className="tap-target text-brand-primary hover:text-brand-primary/80">
          打刻ページ
        </Link>
      ) : null}
    </nav>
  );
}
