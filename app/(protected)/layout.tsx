import type { ReactNode } from 'react';
import SubHeaderGate from './_components/SubHeaderGate';
import { auth } from '@/lib/auth';

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const displayName = session?.user?.name ?? session?.user?.email ?? '';
  const headerText = displayName ? `ログイン中: ${displayName}` : 'ログイン中';

  return (
    <div className="flex flex-1 flex-col gap-6">
      <SubHeaderGate>
        <header className="flex flex-wrap items-center justify-end gap-4 rounded-lg border border-brand-border bg-brand-surface-alt px-4 py-3">
          <span className="text-sm font-medium text-brand-text">{headerText}</span>
        </header>
      </SubHeaderGate>
      <div className="flex-1">{children}</div>
    </div>
  );
}
