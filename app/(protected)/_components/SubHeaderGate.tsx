'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

export function shouldHideSubHeader(pathname: string | null | undefined): boolean {
  if (!pathname) {
    return false;
  }
  return (
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/nfc') ||
    pathname.startsWith('/reports')
  );
}

export default function SubHeaderGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (shouldHideSubHeader(pathname)) {
    return null;
  }
  return <>{children}</>;
}
