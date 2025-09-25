import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import ActivityCalendar from './_components/ActivityCalendar';
import NfcLinkButton from './_components/NfcLinkButton';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  return (
    <main className="w-full max-w-6xl space-y-6 px-4 py-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">稼働状況</h1>
          <p className="text-sm text-gray-500">月次カレンダーでチームの打刻状況を確認できます。</p>
        </div>
        <NfcLinkButton />
      </header>
      <section className="rounded-2xl bg-white p-6 shadow-lg">
        <ActivityCalendar />
      </section>
    </main>
  );
}
