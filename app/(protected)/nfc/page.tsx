import { auth } from '@/lib/auth';
import StampCard from '@/components/StampCard';
import { getTodayLogs, getMachineById } from '@/lib/airtable';
import { redirect } from 'next/navigation';

// ページが動的にレンダリングされるように設定
export const dynamic = 'force-dynamic';

type NFCPageProps = {
  searchParams: { [key: string]: string | string[] | undefined };
};

export default async function NFCPage({ searchParams }: NFCPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const machineId = searchParams.machineid;
  if (typeof machineId !== 'string') {
    return <div>無効な機械IDです。</div>;
  }

  try {
    // ### 修正点 1: machineIdから機械情報を取得 ###
    const machine = await getMachineById(machineId);
    if (!machine) {
      return <div>登録されていない機械IDです。</div>;
    }

    // 当日のログを取得
    const logs = await getTodayLogs(session.user.id);
    const lastLog = logs.length > 0 ? logs[logs.length - 1] : null;

    // 最後のログが 'IN' なら退勤画面、そうでなければ出勤画面
    const initialStampType = lastLog?.fields.type === 'IN' ? 'OUT' : 'IN';
    const initialWorkDescription = lastLog?.fields.workDescription ?? '';

    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
        <StampCard
          initialStampType={initialStampType}
          initialWorkDescription={initialWorkDescription}
          userName={session.user.name ?? 'ゲスト'}
          // ### 修正点 2: 取得した機械名をStampCardに渡す ###
          machineName={searchParams.machineid as string}
        />
      </main>
    );
  } catch (error) {
    console.error("Failed to fetch initial data:", error);
    return <div>エラーが発生しました。時間をおいて再度お試しください。</div>
  }
}