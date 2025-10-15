import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import StampCard from '@/components/StampCard';
import { getFirstMachine, getMachineById, getTodayLogs } from '@/lib/airtable';
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

  const requestedMachineId =
    typeof searchParams.machineId === 'string'
      ? searchParams.machineId
      : typeof searchParams.machineid === 'string'
        ? searchParams.machineid
        : null;

  const defaultMachineId = (process.env.NEXT_PUBLIC_DEFAULT_MACHINE_ID || '1001').trim();

  const candidates = [requestedMachineId, defaultMachineId].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );

  let resolvedMachineId: string | null = null;
  let machineRecord: NonNullable<Awaited<ReturnType<typeof getMachineById>>> | null = null;

  const seen = new Set<string>();
  for (const candidate of candidates) {
    const normalized = candidate.trim();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    try {
      const record = await getMachineById(normalized);
      if (record) {
        resolvedMachineId = (record.fields.machineid || normalized).trim();
        machineRecord = record;
        break;
      }
    } catch (error) {
      console.warn('Failed to validate machineId candidate', { candidate: normalized, error });
    }
  }

  if (!machineRecord) {
    try {
      const firstMachine = await getFirstMachine();
      if (firstMachine) {
        resolvedMachineId = (firstMachine.fields.machineid || '').trim() || null;
        machineRecord = firstMachine;
      }
    } catch (error) {
      console.error('Failed to fetch fallback machine', error);
    }
  }

  if (!resolvedMachineId || !machineRecord) {
    return (
      <div role="alert" className="rounded-lg border border-brand-border bg-brand-surface-alt p-4 text-brand-text">
        機械情報を取得できませんでした。時間をおいて再度お試しください。
      </div>
    );
  }

  if (requestedMachineId?.trim() !== resolvedMachineId) {
    redirect(`/nfc?machineId=${resolvedMachineId}`);
  }

  try {
    // 当日のログを取得
    const logs = await getTodayLogs(session.user.id);
    const lastLog = logs.length > 0 ? logs[logs.length - 1] : null;

    // 最後のログが 'IN' なら退勤画面、そうでなければ出勤画面
    const initialStampType = lastLog?.fields.type === 'IN' ? 'OUT' : 'IN';
    const initialWorkDescription = lastLog?.fields.workDescription ?? '';
    const machineLabel =
      machineRecord.fields.machineid?.trim() || resolvedMachineId || requestedMachineId || '不明';

    return (
      <section className="flex flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 space-y-6">
          <div className="flex flex-1 items-center justify-center">
            <StampCard
              initialStampType={initialStampType}
              initialWorkDescription={initialWorkDescription}
              userName={session.user.name ?? 'ゲスト'}
              machineName={machineLabel}
            />
          </div>
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
