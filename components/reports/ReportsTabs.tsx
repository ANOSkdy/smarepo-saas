'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const REPORT_TABS = [
  { href: '/reports', label: '個別集計' },
  { href: '/reports/sites', label: '現場別集計' },
] as const;

export default function ReportsTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-3 border-b border-gray-200 pb-2" aria-label="レポート切替タブ">
      {REPORT_TABS.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={
              isActive
                ? 'border-b-2 border-indigo-500 pb-1 text-sm font-semibold text-indigo-600'
                : 'pb-1 text-sm text-gray-500 transition hover:text-gray-900'
            }
            prefetch
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
