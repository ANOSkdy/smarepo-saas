'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_TABS = [
  // ダッシュボードが月次カレンダーを代替
  { href: '/dashboard', label: 'カレンダー' },
  { href: '/reports', label: '稼働集計' },
  { href: '/nfc?machineId=1001', label: '打刻ページ' },
] as const;

function isActivePath(currentPath: string | null, href: string): boolean {
  if (!currentPath) return false;
  const baseHref = href.split('?')[0];
  return currentPath === baseHref || currentPath.startsWith(`${baseHref}/`);
}

export default function NavTabs() {
  const pathname = usePathname();

  return (
    <nav role="navigation" aria-label="主要タブナビゲーション" className="flex items-center gap-1 text-sm font-medium">
      {NAV_TABS.map((tab) => {
        const active = isActivePath(pathname, tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-md px-3 py-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-focus/40 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface ${
              active
                ? 'bg-brand-primary text-brand-primaryText shadow-sm'
                : 'text-brand-primary hover:bg-brand-primary/10'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export { NAV_TABS, isActivePath };
