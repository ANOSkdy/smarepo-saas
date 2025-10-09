import type { ReactNode } from 'react';
import HeaderNav from '@/components/HeaderNav';
import SubHeaderGate from './_components/SubHeaderGate';
import { auth } from '@/lib/auth';

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const displayName = session?.user?.name ?? session?.user?.email ?? '';

  return (
    <div className="flex flex-1 flex-col gap-6">
      <SubHeaderGate>
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-brand-border bg-brand-surface-alt px-4 py-3">
          <HeaderNav />
          {displayName ? <span className="text-sm font-medium text-brand-text">{displayName}</span> : null}
        </header>
      </SubHeaderGate>
      <div className="flex-1">{children}</div>
    </div>
  );
}
