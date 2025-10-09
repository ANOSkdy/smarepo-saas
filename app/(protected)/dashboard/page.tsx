import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { ROUTES } from '@/src/constants/routes';
import ActivityCalendar from './_components/ActivityCalendar';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(ROUTES.LOGIN);
  }

  const hasUserName = (
    user: typeof session.user,
  ): user is NonNullable<typeof session.user> & { userName?: string | null } => {
    if (!user) {
      return false;
    }

    const candidate = (user as { userName?: unknown }).userName;
    return typeof candidate === 'string' && candidate.length > 0;
  };

  const displayName =
    session.user?.name ??
    (hasUserName(session.user) ? session.user.userName : undefined) ??
    session.user?.email ??
    'ユーザー';

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <span aria-hidden="true" />
        <div className="text-sm text-brand-muted" aria-label="ログインユーザー名">
          {displayName}
        </div>
      </div>
      <section className="rounded-2xl border border-brand-border bg-brand-surface-alt p-6 shadow-lg">
        <ActivityCalendar />
      </section>
    </section>
  );
}
