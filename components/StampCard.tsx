'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { WorkTypeFields } from '@/types';
import { Record } from 'airtable';

type StampCardProps = {
  initialStampType: 'IN' | 'OUT';
  initialWorkDescription: string;
  userName: string;
};

// 完了・エラー・待機時の汎用表示コンポーネント
const CardState = ({ title, message }: { title: string; message: string }) => (
  <div className="w-full max-w-md rounded-lg bg-white p-8 text-center shadow-md">
    <h2 className="text-xl font-bold">{title}</h2>
    <p className="mt-4 text-gray-700">{message}</p>
  </div>
);

export default function StampCard({
  initialStampType,
  initialWorkDescription,
  userName,
}: StampCardProps) {
  // 状態に 'COMPLETED' を追加して完了画面を管理
  const [stampType, setStampType] = useState<'IN' | 'OUT' | 'COMPLETED'>(initialStampType);
  const [workTypes, setWorkTypes] = useState<Record<WorkTypeFields>[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastWorkDescription, setLastWorkDescription] = useState(initialWorkDescription);

  const searchParams = useSearchParams();
  const machineId = searchParams.get('machineid');

  useEffect(() => {
    // stampTypeが 'IN' の場合のみ作業内容マスタを取得
    if (stampType === 'IN') {
      fetch('/api/masters/work-types')
        .then((res) => {
          if (!res.ok) {
            throw new Error('Failed to fetch work types');
          }
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
            body: JSON.stringify({
              machineId,
              workDescription,
              lat: latitude,
              lon: longitude,
              accuracy,
              type,
            }),
          });

          if (!response.ok) {
            const res = await response.json();
            throw new Error(res.message || `サーバーエラー: ${response.statusText}`);
          }
          
          // ### ロジック修正 ###
          // 打刻タイプに応じて次の状態に遷移させる
          if (type === 'IN') {
            setStampType('OUT'); // 出勤成功 → 退勤画面へ
            setLastWorkDescription(workDescription);
          } else {
            setStampType('COMPLETED'); // 退勤成功 → 完了画面へ
          }

        } catch (err) {
          // ### anyを削除 ###
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
    const formData = new FormData(e.currentTarget);
    const workDescription = formData.get('workDescription') as string;
    if (workDescription) {
      handleStamp('IN', workDescription);
    }
  };
  
  const handleCheckOut = () => {
    if (!lastWorkDescription) {
        alert('前回の作業内容が見つかりません。お手数ですが、一度出勤画面に戻って操作をやり直してください。');
        return;
    }
    handleStamp('OUT', lastWorkDescription);
  };

  if (isLoading) return <CardState title="処理中..." message="サーバーと通信しています。" />;
  if (error) return <CardState title="エラーが発生しました" message={error} />;
  if (!machineId) return <CardState title="無効なアクセス" message="NFCタグから機械IDを読み取れませんでした。" />;
  
  // ### 表示ロジック修正 ###
  if (stampType === 'COMPLETED') {
    return <CardState title="記録しました" message="本日の業務お疲れ様でした。" />;
  }

  if (stampType === 'IN') {
    return (
      <div className="w-full max-w-md rounded-lg bg-white p-8 text-center shadow-md">
        <h1 className="text-2xl font-bold">出勤</h1>
        <p className="mt-2 text-lg text-gray-600">{userName} さん</p>
        <form onSubmit={handleCheckIn} className="mt-6 space-y-4">
          <div>
            <label htmlFor="workDescription" className="block text-left text-sm font-medium text-gray-700">
              作業内容
            </label>
            <select
              id="workDescription"
              name="workDescription"
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              defaultValue="" 
            >
              <option value="" disabled>
                選択してください
              </option>
              {workTypes.map((wt) => (
                <option key={wt.id} value={wt.fields.name}>
                  {wt.fields.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={workTypes.length === 0}
            className="w-full rounded-md bg-blue-600 px-4 py-3 text-xl font-bold text-white hover:bg-blue-700 disabled:bg-gray-400"
          >
            出 勤
          </button>
        </form>
      </div>
    );
  } 
  
  if (stampType === 'OUT') {
    return (
      <div className="w-full max-w-md rounded-lg bg-white p-8 text-center shadow-md">
        <h1 className="text-2xl font-bold text-green-600">出勤中</h1>
        <p className="mt-2 text-lg text-gray-600">{userName} さん</p>
        <p className="mt-4 text-gray-800">
          <span className="font-bold">機械:</span> {machineId}
        </p>
        <p className="text-gray-800">
          <span className="font-bold">作業内容:</span> {lastWorkDescription || '（記録なし）'}
        </p>
        <button
          onClick={handleCheckOut}
          type="button"
          className="mt-8 w-full rounded-md bg-red-600 px-4 py-3 text-xl font-bold text-white hover:bg-red-700"
        >
          退 勤
        </button>
      </div>
    );
  }
}