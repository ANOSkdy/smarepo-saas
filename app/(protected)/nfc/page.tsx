import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { logsTable } from '@/lib/airtable';
import StampCard from '@/components/StampCard';

// 変更点1: 関数名を変更し、作業内容も返すように修正
async function getUserLastLog(userId: string) {
  try {
    const records = await logsTable
      .select({
        filterByFormula: `{user} = '${userId}'`,
        maxRecords: 1,
        sort: [{ field: 'timestamp', direction: 'desc' }],
      })
      .firstPage();

    if (records.length === 0) {
      // 打刻履歴がなければ未出勤状態
      return { type: 'OUT' as const, workDescription: '' };
    }
    const lastLog = records[0].fields;
    return {
      type: lastLog.type,
      workDescription: lastLog.workDescription ?? '',
    };
  } catch (error) {
    console.error('Failed to fetch last log:', error);
    // エラー時は安全のためOUT状態とみなす
    return { type: 'OUT' as const, workDescription: '' };
  }
}

export default async function NfcPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return null;
  }

  // 変更点2: 新しい関数を呼び出す
  const lastLog = await getUserLastLog(session.user.userId);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-100 p-4">
      <StampCard
        initialStampType={lastLog.type}
        // 変更点3: StampCardに作業内容を渡す
        initialWorkDescription={lastLog.workDescription}
        userName={session.user.name ?? 'ゲスト'}
      />
    </div>
  );
}