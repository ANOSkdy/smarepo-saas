import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import StampCard from '@/components/StampCard';
import { getTodayLogs, getMachineById } from '@/lib/airtable';
import { ROUTES } from '@/src/constants/routes';

// ページが動的にレンダリングされるように設定
export const dynamic = 'force-dynamic';

type NFCPageProps = {
  searchParams: { [key: string]: string | string[] | undefined };
};

export default async function NFCPage({ searchParams }: NFCPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(ROUTES.LOGIN);
  }

  const machineId = searchParams.machineid;
  if (typeof machineId !== 'string') {
    return (
      <div role="alert" className="rounded-lg border border-brand-border bg-brand-surface-alt p-4 text-brand-text">
        無効な機械IDです。
      </div>
    );
  }

  try {
    // ### 修正点 1: machineIdから機械情報を取得 ###
    const machine = await getMachineById(machineId);
    if (!machine) {
      return (
        <div role="alert" className="rounded-lg border border-brand-border bg-brand-surface-alt p-4 text-brand-text">
          登録されていない機械IDです。
        </div>
      );
    }

    // 当日のログを取得
    const logs = await getTodayLogs(session.user.id);
    const lastLog = logs.length > 0 ? logs[logs.length - 1] : null;

    // 最後のログが 'IN' なら退勤画面、そうでなければ出勤画面
    const initialStampType = lastLog?.fields.type === 'IN' ? 'OUT' : 'IN';
    const initialWorkDescription = lastLog?.fields.workDescription ?? '';

    const machineIdentifier = (machine.fields.machineid as string | undefined) ?? null;
    const machineName = machineIdentifier && machineIdentifier.length > 0 ? machineIdentifier : '未登録';

    return (
      <section className="flex flex-1 items-center justify-center">
        <StampCard
          initialStampType={initialStampType}
          initialWorkDescription={initialWorkDescription}
          userName={session.user.name ?? 'ゲスト'}
          machineName={machineName}
        />
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