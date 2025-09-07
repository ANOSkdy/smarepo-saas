'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { WorkTypeFields } from '@/types';
import { Record } from 'airtable';
import LogoutButton from './LogoutButton'; // LogoutButtonをインポート

type StampCardProps = {
  initialStampType: 'IN' | 'OUT';
  initialWorkDescription: string;
  userName: string;
  machineName: string; 
};

// 完了・エラー・待機時の汎用表示コンポーネント
const CardState = ({ title, message }: { title: string; message: string }) => (
    <div className="flex min-h-[calc(100vh-61px)] w-full items-center justify-center p-4">
        <div className="w-full max-w-md rounded-lg bg-white p-8 text-center shadow-md">
            <h2 className="text-xl font-bold">{title}</h2>
            <p className="mt-4 text-gray-700">{message}</p>
        </div>
    </div>
);

export default function StampCard({
  initialStampType,
  initialWorkDescription,
  userName,
  machineName,
}: StampCardProps) {
  const [stampType, setStampType] = useState<'IN' | 'OUT' | 'COMPLETED'>(initialStampType);
  const [workTypes, setWorkTypes] = useState<Record<WorkTypeFields>[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastWorkDescription, setLastWorkDescription] = useState(initialWorkDescription);
  const [selectedWork, setSelectedWork] = useState('');

  const searchParams = useSearchParams();
  const machineId = searchParams.get('machineid');

  useEffect(() => {
    if (stampType === 'IN') {
      fetch('/api/masters/work-types')
        .then((res) => {
          if (!res.ok) throw new Error('Failed to fetch work types');
          return res.json();
        })
        .then((data) => setWorkTypes(data))
        .catch(() => setError('作業内容マスタの取得に失敗しました。'));
    }
  }, [stampType]);

  const handleStamp = async (type: 'IN' | 'OUT', workDescription: string) => {
    setIsLoading(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        try {
          const response = await fetch('/api/stamp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ machineId, workDescription, lat: latitude, lon: longitude, accuracy, type }),
          });
          if (!response.ok) {
            const res = await response.json();
            throw new Error(res.message || `サーバーエラー: ${response.statusText}`);
          }
          if (type === 'IN') {
            setStampType('OUT');
            setLastWorkDescription(workDescription);
          } else {
            setStampType('COMPLETED');
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : '通信に失敗しました。';
          setError(message);
        } finally {
          setIsLoading(false);
        }
      },
      (geoError) => {
        setError(`位置情報の取得に失敗しました: ${geoError.message}`);
        setIsLoading(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const handleCheckIn = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (selectedWork) handleStamp('IN', selectedWork);
  };
  
  const handleCheckOut = () => {
    if (!lastWorkDescription) {
      alert('前回の作業内容が見つかりません。');
      return;
    }
    handleStamp('OUT', lastWorkDescription);
  };

  if (isLoading) return <CardState title="処理中..." message="サーバーと通信しています。" />;
  if (error) return <CardState title="エラーが発生しました" message={error} />;
  if (!machineId) return <CardState title="無効なアクセス" message="NFCタグから機械IDを読み取れませんでした。" />;
  if (stampType === 'COMPLETED') return <CardState title="記録しました" message="本日の業務お疲れ様でした。" />;

  // メインのUI部分
  const mainContent = (
    <div className="space-y-4">
        <div className="rounded-lg bg-white p-6 shadow-md">
            <div className="space-y-2 text-center">
                <p className="text-lg font-semibold text-gray-800">{userName} さん</p>
                <p className="text-gray-600">
                    <span className="font-semibold">機械:</span> {machineName}
                </p>
                {stampType === 'OUT' && (
                    <p className="text-gray-600">
                        <span className="font-semibold">現在の作業:</span> {lastWorkDescription || 'N/A'}
                    </p>
                )}
            </div>
        </div>
        {stampType === 'IN' && (
            <form id="check-in-form" onSubmit={handleCheckIn} className="space-y-4">
                <div className="rounded-lg bg-white p-6 shadow-md">
                    <label htmlFor="workDescription" className="mb-2 block text-sm font-medium text-gray-700">
                        本日の作業内容を選択
                    </label>
                    <select
                        id="workDescription"
                        name="workDescription"
                        required
                        value={selectedWork}
                        onChange={(e) => setSelectedWork(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 py-3 pl-3 pr-10 text-base shadow-sm focus:border-primary focus:outline-none focus:ring-primary"
                    >
                        <option value="" disabled>選択してください</option>
                        {workTypes.map((wt) => (
                            <option key={wt.id} value={wt.fields.name}>{wt.fields.name}</option>
                        ))}
                    </select>
                </div>
            </form>
        )}
    </div>
  );

  return (
    <div className="relative flex min-h-[calc(100vh-61px)] w-full flex-col p-4 pb-32">
        <div className="w-full max-w-md mx-auto">
            {mainContent}
            <div className="mt-6">
                <LogoutButton />
            </div>
        </div>
        <div className="fixed bottom-0 left-0 right-0 border-t border-gray-200 bg-white/80 p-4 backdrop-blur-sm">
            {stampType === 'IN' ? (
                <button
                    onClick={() => (document.getElementById('check-in-form') as HTMLFormElement)?.requestSubmit()}
                    disabled={!selectedWork || isLoading}
                    className="w-full rounded-lg bg-primary px-4 py-4 text-xl font-bold text-white shadow-lg hover:bg-primary/90 disabled:bg-gray-400"
                >
                    出 勤
                </button>
            ) : (
                <button
                    onClick={handleCheckOut}
                    disabled={isLoading}
                    type="button"
                    className="w-full rounded-lg bg-primary px-4 py-4 text-xl font-bold text-white shadow-lg hover:bg-primary/90 disabled:bg-gray-400"
                >
                    退 勤
                </button>
            )}
        </div>
    </div>
  );
}