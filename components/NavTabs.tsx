'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const TABS = [
  { href: '/calendar/month', label: 'カレンダー' },
  { href: '/reports/work', label: '稼働集計' },
  { href: '/nfc?machineId=1001', label: '打刻ページ' },
];

function isActivePath(currentPath: string | null, targetHref: string): boolean {
  if (!currentPath) {
    return false;
  }
  const [targetPath] = targetHref.split('?');
  return currentPath.startsWith(targetPath);
}

export default function NavTabs() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  return (
    <nav aria-label="主要ページ切り替え" className="border-b border-border pb-2">
      <div className="flex items-center justify-between md:hidden">
        <span className="text-sm font-semibold text-muted-foreground">主要メニュー</span>
        <button
          type="button"
          aria-expanded={isMenuOpen}
          aria-label={isMenuOpen ? 'タブメニューを閉じる' : 'タブメニューを開く'}
          onClick={() => setIsMenuOpen((prev) => !prev)}
          className="rounded-md border border-border p-2 transition-colors hover:bg-muted"
        >
          <span className="sr-only">メニュー</span>
          <span className="block h-0.5 w-5 bg-current" aria-hidden="true" />
          <span className="mt-1 block h-0.5 w-5 bg-current" aria-hidden="true" />
          <span className="mt-1 block h-0.5 w-5 bg-current" aria-hidden="true" />
        </button>
      </div>
      <div
        className={`mt-2 flex-col gap-2 md:mt-0 md:flex md:flex-row md:items-center md:gap-2 ${
          isMenuOpen ? 'flex' : 'hidden'
        }`}
      >
        {TABS.map((tab) => {
          const active = isActivePath(pathname, tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-md border border-transparent px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
