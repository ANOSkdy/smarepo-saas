import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import ProjectsTable from './_components/ProjectsTable';
import CalendarMonth from './_components/CalendarMonth';

export const dynamic = 'force-dynamic';

type DashboardPageProps = {
  searchParams: Record<string, string | string[] | undefined>;
};

const tabs = [
  { id: 'projects', label: '案件進捗' },
  { id: 'calendar', label: '稼働状況' },
] as const;

type TabId = (typeof tabs)[number]['id'];

function resolveTab(value: string | string[] | undefined): TabId {
  if (value === 'calendar') {
    return 'calendar';
  }
  return 'projects';
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const activeTab = resolveTab(searchParams.tab);

  return (
    <main className="w-full max-w-6xl px-4 py-6">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>
          <p className="mt-1 text-sm text-gray-500">案件の進捗と稼働状況をまとめて確認できます。</p>
        </div>
      </div>
      <div className="rounded-2xl bg-white shadow-lg">
        <div className="border-b border-gray-100 px-6">
          <nav className="-mb-px flex space-x-6" aria-label="ダッシュボードの表示切り替え">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const href = `/dashboard${tab.id === 'projects' ? '' : `?tab=${tab.id}`}`;
              return (
                <Link
                  key={tab.id}
                  href={href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`py-4 text-sm font-medium transition-colors ${
                    isActive
                      ? 'border-b-2 border-blue-500 text-blue-600'
                      : 'border-b-2 border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="px-6 py-6">
          <Suspense fallback={<div className="text-sm text-gray-500">読み込み中...</div>}>
            {activeTab === 'projects' ? <ProjectsTable /> : <CalendarMonth />}
          </Suspense>
        </div>
      </div>
    </main>
  );
}
