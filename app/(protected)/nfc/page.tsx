import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import StampCard from '@/components/StampCard';
import { getTodayLogs } from '@/lib/airtable';
import { ROUTES } from '@/src/constants/routes';
import NavTabs from '@/components/NavTabs';

// ページが動的にレンダリングされるように設定
export const dynamic = 'force-dynamic';

type NFCPageProps = {
  searchParams: { [key: string]: string | string[] | undefined };
};

function resolveMachineId(searchParams: NFCPageProps['searchParams']): string | null {
  const candidate = searchParams.machineId ?? searchParams.machineid;
  if (Array.isArray(candidate)) {
    return candidate[0] ?? null;
  }
  return candidate ?? null;
}

export default async function NFCPage({ searchParams }: NFCPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(ROUTES.LOGIN);
  }

  const machineIdParam = resolveMachineId(searchParams);
  if (typeof machineIdParam !== 'string') {
    return (
      <div role="alert" className="rounded-lg border border-brand-border bg-brand-surface-alt p-4 text-brand-text">
        無効な機械IDです。
      </div>
    );
  }

  try {
    // 当日のログを取得
    const logs = await getTodayLogs(session.user.id);
    const lastLog = logs.length > 0 ? logs[logs.length - 1] : null;

    // 最後のログが 'IN' なら退勤画面、そうでなければ出勤画面
    const initialStampType = lastLog?.fields.type === 'IN' ? 'OUT' : 'IN';
    const initialWorkDescription = lastLog?.fields.workDescription ?? '';
    const machineName = machineIdParam.trim().length > 0 ? machineIdParam.trim() : '未登録';

    return (
      <section className="flex flex-1 flex-col gap-4">
        <NavTabs />
        <div className="flex flex-1 items-center justify-center">
          <StampCard
            initialStampType={initialStampType}
            initialWorkDescription={initialWorkDescription}
            userName={session.user.name ?? 'ゲスト'}
            machineName={machineName}
          />
        </div>
      </section>
    );
  } catch (error) {
    console.error('Failed to fetch initial data:', error);
    return (
      <div role="alert" className="rounded-lg border border-brand-border bg-brand-surface-alt p-4 text-brand-text">
        エラーが発生しました。時間をおいて再度お試しください。
      </div>
    );
  }
}