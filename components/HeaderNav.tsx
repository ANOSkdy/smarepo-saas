'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import type { DefaultSession } from 'next-auth';

export function shouldHideNfcLink(pathname: string | null | undefined): boolean {
  if (!pathname) {
    return false;
  }
  return pathname.startsWith('/nfc');
}

export function shouldHideDashboardLink(pathname: string | null | undefined): boolean {
  if (!pathname) {
    return false;
  }
  return pathname.startsWith('/dashboard');
}

type UserWithOptionalUserName = DefaultSession['user'] & {
  userName?: string | null;
};

export function resolveDisplayName(user: DefaultSession['user'] | undefined): string | null {
  if (!user) {
    return null;
  }

  if (typeof user.name === 'string' && user.name.length > 0) {
    return user.name;
  }

  if (hasUserName(user)) {
    const { userName } = user;
    if (typeof userName === 'string' && userName.length > 0) {
      return userName;
    }
  }

  if (typeof user.email !== 'string' || user.email.length === 0) {
    return null;
  }

  const [localPart] = user.email.split('@');
  return localPart ?? null;
}

function hasUserName(user: DefaultSession['user'] | undefined): user is UserWithOptionalUserName {
  return Boolean(user && 'userName' in user);
}

export default function HeaderNav() {
  const pathname = usePathname();
  const hideDashboard = shouldHideDashboardLink(pathname);
  const hideNfc = shouldHideNfcLink(pathname);
  const isDashboardRoute = hideDashboard;
  const { data } = useSession();
  const displayName = resolveDisplayName(data?.user);

  return (
    <nav
      aria-label="トップナビゲーション"
      role="navigation"
      className="flex w-full flex-wrap items-center gap-4 text-sm font-medium"
    >
      <div className="flex flex-wrap items-center gap-4">
        {!hideDashboard ? (
          <Link href="/dashboard" className="tap-target text-brand-primary hover:text-brand-primary/80">
            ダッシュボード
          </Link>
        ) : null}
        {!hideNfc ? (
          <Link href="/nfc" className="tap-target text-brand-primary hover:text-brand-primary/80">
            打刻ページ
          </Link>
        ) : null}
      </div>
      {isDashboardRoute && displayName ? (
        <div className="ml-auto text-sm text-brand-muted" aria-label="ログインユーザー名">
          {displayName}
        </div>
      ) : null}
    </nav>
  );
}
