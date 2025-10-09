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

  return (
    <section className="space-y-6">
      <section className="rounded-2xl border border-brand-border bg-brand-surface-alt p-6 shadow-lg">
        <ActivityCalendar />
      </section>
    </section>
  );
}
