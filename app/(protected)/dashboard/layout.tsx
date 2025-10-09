import type { ReactNode } from 'react';
import { auth } from '@/lib/auth';

type SessionUser = {
  name?: string | null;
  email?: string | null;
  userName?: string | null;
};

type SessionLike = {
  user?: SessionUser | null;
} | null | undefined;

export function resolveDashboardUserName(session: SessionLike): string | null {
  const user = session?.user;
  if (!user) {
    return null;
  }

  if (typeof user.name === 'string' && user.name.trim()) {
    return user.name;
  }

  if (typeof user.userName === 'string' && user.userName.trim()) {
    return user.userName;
  }

  if (typeof user.email === 'string') {
    const [localPart] = user.email.split('@');
    if (localPart && localPart.trim()) {
      return localPart.trim();
    }
  }

  return null;
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const name = resolveDashboardUserName(session);

  return (
    <>
      {name ? (
        <div className="mb-2 flex justify-end text-sm text-brand-muted" aria-label="ログインユーザー名">
          {name}
        </div>
      ) : null}
      {children}
    </>
  );
}
