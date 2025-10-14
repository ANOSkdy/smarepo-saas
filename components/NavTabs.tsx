'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

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

  return (
    <nav aria-label="主要ページ切り替え" className="flex gap-2 border-b border-border pb-2">
      {TABS.map((tab) => {
        const active = isActivePath(pathname, tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`border-b-2 border-transparent rounded-t px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? 'border-b-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
