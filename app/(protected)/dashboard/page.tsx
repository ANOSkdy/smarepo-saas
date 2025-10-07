import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { ROUTES } from '@/src/constants/routes';
import ActivityCalendar from './_components/ActivityCalendar';
import NfcLinkButton from './_components/NfcLinkButton';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(ROUTES.LOGIN);
  }

  return (
    <section className="space-y-6">
      <nav aria-label="breadcrumb" className="text-sm text-brand-muted">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <span className="text-brand-primary" aria-current="false">
              ホーム
            </span>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-medium text-brand-text">
            稼働状況
          </li>
        </ol>
      </nav>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-brand-text">稼働状況</h1>
          <p className="text-sm text-brand-muted">月次カレンダーでチームの打刻状況を確認できます。</p>
        </div>
        <NfcLinkButton />
      </header>
      <section className="rounded-2xl border border-brand-border bg-brand-surface-alt p-6 shadow-lg">
        <ActivityCalendar />
      </section>
    </section>
  );
}
