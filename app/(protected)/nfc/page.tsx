import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import StampCard from '@/components/StampCard';
import { getTodayLogs, getMachineById } from '@/lib/airtable';
import { resolveMachineIdForUserOnDate } from '@/lib/airtable/logs';
import { ROUTES } from '@/src/constants/routes';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function formatJstDate(date: Date) {
  return new Date(date.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

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

  try {
    const rawMachineParam = searchParams.machineid;
    const initialMachineId =
      typeof rawMachineParam === 'string'
        ? rawMachineParam.trim()
        : Array.isArray(rawMachineParam)
        ? (rawMachineParam[0]?.trim() ?? '')
        : '';

    let machineId: string = initialMachineId;
    let machine: Awaited<ReturnType<typeof getMachineById>> | null = null;

    if (machineId) {
      machine = await getMachineById(machineId);
      if (!machine) {
        return (
          <div role="alert" className="rounded-lg border border-brand-border bg-brand-surface-alt p-4 text-brand-text">
            登録されていない機械IDです。
          </div>
        );
      }
    } else {
      const todayJst = formatJstDate(new Date());
      const resolvedMachineId = await resolveMachineIdForUserOnDate(session.user.id, todayJst);
      if (resolvedMachineId) {
        machineId = resolvedMachineId;
        machine = await getMachineById(resolvedMachineId);
      }
      if (!machine) {
        return (
          <div role="alert" className="rounded-lg border border-brand-border bg-brand-surface-alt p-4 text-brand-text">
            機械IDを特定できませんでした。
          </div>
        );
      }
    }

    // 当日のログを取得
    const logs = await getTodayLogs(session.user.id);
    const lastLog = logs.length > 0 ? logs[logs.length - 1] : null;

    // 最後のログが 'IN' なら退勤画面、そうでなければ出勤画面
    const initialStampType = lastLog?.fields.type === 'IN' ? 'OUT' : 'IN';
    const initialWorkDescription = lastLog?.fields.workDescription ?? '';

    const machineIdentifier =
      machineId || ((machine.fields.machineid as string | undefined) ?? null) || null;
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