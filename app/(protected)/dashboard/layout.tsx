import type { ReactNode } from 'react';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type SessionUser = {
  name?: string | null;
  email?: string | null;
  userName?: string | null;
  displayName?: string | null;
  id?: string | null;
};

type SessionLike = {
  user?: SessionUser | null;
} | null | undefined;

export function resolveDashboardUserName(session: SessionLike): string | null {
  const user = session?.user;
  if (!user) {
    return null;
  }

  const candidates: Array<string | null | undefined> = [
    user.name,
    user.userName,
    user.displayName,
    typeof user.email === 'string' ? user.email.split('@')[0] : undefined,
    typeof user.id === 'string' && user.id ? `user-${user.id.slice(0, 8)}` : undefined,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }

  return null;
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const name = resolveDashboardUserName(session) ?? 'ログイン中';

  return (
    <>
      <div className="mb-2 flex justify-end text-sm text-brand-muted" aria-label="ログインユーザー名">
        {name}
      </div>
      {children}
    </>
  );
}
