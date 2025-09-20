'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { SiteFields, WorkTypeFields } from '@/types';
import { Record } from 'airtable';
import LogoutButton from './LogoutButton'; // LogoutButtonをインポート
import { extractGeometry, findNearestSite, pointInGeometry } from '@/lib/geo';

type StampCardProps = {
  initialStampType: 'IN' | 'OUT';
  initialWorkDescription: string;
  userName: string;
  machineName: string; 
};

// 完了・エラー・待機時の汎用表示コンポーネント
const CardState = ({ title, message }: { title?: string; message: string }) => (
  <div className="flex min-h-[calc(100svh-56px)] w-full items-center justify-center p-4">
    <div className="card">
      {title && <h2 className="text-xl font-bold">{title}</h2>}
      <p className="mt-4 text-gray-700">{message}</p>
    </div>
  </div>
);

type Fix = GeolocationPosition;

const ACCEPT_ACCURACY = 100;
const SOFT_MAX_WAIT = 2000;
const HARD_MAX_WAIT = 8000;
const VERY_BAD_ACC = 300;
const VERY_OLD_MS = 15000;

function getOnce(timeoutMs: number): Promise<Fix> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: timeoutMs,
    });
  });
}

function bestByAccuracy(list: Fix[]): Fix {
  return [...list].sort(
    (a, b) => (a.coords.accuracy ?? Number.POSITIVE_INFINITY) - (b.coords.accuracy ?? Number.POSITIVE_INFINITY),
  )[0];
}

function watchForBetter(opts: { limitMs: number; earlyStop: (p: Fix) => boolean }): Promise<Fix | null> {
  return new Promise((resolve) => {
    const samples: Fix[] = [];
    let settled = false;
    let watchId = 0;
    const finish = (result: Fix | null) => {
      if (settled) return;
      settled = true;
      navigator.geolocation.clearWatch(watchId);
      resolve(result);
    };
    watchId = navigator.geolocation.watchPosition(
      (p) => {
        samples.push(p);
        if (opts.earlyStop(p)) {
          finish(samples.length ? bestByAccuracy(samples) : p);
        }
      },
      () => {
        /* ignore errors */
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: opts.limitMs },
    );
    setTimeout(() => {
      finish(samples.length ? bestByAccuracy(samples) : null);
    }, opts.limitMs);
  });
}

async function getBestPositionAdaptive(
  isInsidePolygon: (lat: number, lon: number) => boolean,
): Promise<Fix> {
  const first = await getOnce(10000);
  const a1 = first.coords.accuracy ?? Number.POSITIVE_INFINITY;
  const age1 = Date.now() - first.timestamp;
  const lat1 = first.coords.latitude;
  const lon1 = first.coords.longitude;

  if (isInsidePolygon(lat1, lon1)) return first;
  if (a1 <= ACCEPT_ACCURACY && age1 <= 10000) return first;

  const budget = a1 > VERY_BAD_ACC && age1 > VERY_OLD_MS ? HARD_MAX_WAIT : SOFT_MAX_WAIT;

  const improved = await watchForBetter({
    limitMs: budget,
    earlyStop: (p) => {
      const acc = p.coords.accuracy ?? Number.POSITIVE_INFINITY;
      const age = Date.now() - p.timestamp;
      const inside = isInsidePolygon(p.coords.latitude, p.coords.longitude);
      return inside || acc <= ACCEPT_ACCURACY || age <= 5000;
    },
  });

  return improved ?? first;
}

export default function StampCard({
  initialStampType,
  initialWorkDescription,
  userName,
  machineName,
}: StampCardProps) {
  const [stampType, setStampType] = useState<'IN' | 'OUT' | 'COMPLETED'>(initialStampType);
  const [workTypes, setWorkTypes] = useState<Record<WorkTypeFields>[]>([]);
  const [sites, setSites] = useState<Record<SiteFields>[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
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

  useEffect(() => {
    fetch('/api/masters/sites')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch sites');
        return res.json();
      })
      .then((data) => setSites(data))
      .catch(() => setError('拠点マスタの取得に失敗しました。'));
  }, []);

  const handleStamp = async (type: 'IN' | 'OUT', workDescription: string) => {
    setIsLoading(true);
    setError('');
    setWarning('');

    try {
      const position = await getBestPositionAdaptive((lat, lon) => {
        try {
          return sites.some((site) => {
            const geom = extractGeometry(site.fields.polygon_geojson ?? null);
            return geom ? pointInGeometry(lat, lon, geom) : false;
          });
        } catch {
          return false;
        }
      });

      const { latitude, longitude, accuracy } = position.coords;
      const positionTimestamp = position.timestamp;
      const ageMs = Date.now() - positionTimestamp;
      const warnAges: string[] = [];
      if (ageMs > 10_000) {
        warnAges.push('位置情報が古い可能性があります（>10秒）');
      }
      const decidedSite = findNearestSite(latitude, longitude, sites);

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
            positionTimestamp,
            clientDecision: 'auto',
            siteId: decidedSite?.fields.siteId,
          }),
        });
        const data = await response.json();
        const warnings: string[] = warnAges.slice();
        if (typeof data.accuracy === 'number' && data.accuracy > 100) {
          warnings.push('位置精度が低い可能性があります（>100m）');
        }
        if (
          typeof data.nearest_distance_m === 'number' &&
          data.nearest_distance_m > 1000
        ) {
          warnings.push('録拠点から離れている可能性があります（>1km）');
        }
        setWarning(warnings.join(' / '));
        if (!response.ok) {
          throw new Error(data.message || `サーバーエラー: ${response.statusText}`);
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
    } catch (geoError) {
      const message =
        geoError instanceof Error
          ? geoError.message
          : typeof geoError === 'string'
            ? geoError
            : '不明なエラーが発生しました。';
      setError(`位置情報の取得に失敗しました: ${message}`);
      setIsLoading(false);
    }
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
  if (stampType === 'COMPLETED')
    return (
      <div className="flex min-h-[calc(100svh-56px)] w-full items-center justify-center p-4">
        <p className="whitespace-nowrap break-keep text-center text-black leading-normal max-w-[90vw] mx-auto text-base sm:text-lg">
          本日の業務お疲れ様でした。
        </p>
      </div>
    );

  return (
    <div className="flex min-h-[calc(100svh-56px)] w-full flex-col items-center gap-6 p-4 pb-[calc(env(safe-area-inset-bottom)+12px)]">
        {warning && (
        <div
          role="alert"
          className="w-[90vw] max-w-[560px] rounded bg-yellow-50 p-2 text-sm text-yellow-800"
        >
          {warning}
        </div>
      )}
      <div className="card w-[90vw] max-w-[560px] mx-auto">
        <div className="space-y-2 text-center">
          <p className="text-lg font-semibold text-gray-800">{userName} さん</p>
          <p className="text-gray-600">
            <span className="font-semibold">機械:</span> {machineName}
          </p>
        </div>
      </div>
      {stampType === 'IN' ? (
        <>
          <form id="check-in-form" onSubmit={handleCheckIn} className="w-full">
            <div className="card w-[90vw] max-w-[560px] mx-auto text-left">
              <label htmlFor="workDescription" className="mb-2 block text-sm font-medium text-black">
                本日の作業内容を選択
              </label>
              <div className="relative w-full">
                <select
                  id="workDescription"
                  name="workDescription"
                  required
                  value={selectedWork}
                  onChange={(e) => setSelectedWork(e.target.value)}
                  className="w-full bg-white text-black rounded-xl px-4 py-3 pr-10 text-base leading-tight ring-1 ring-zinc-300 focus:ring-2 focus:ring-primary outline-none appearance-none"
                >
                  <option value="" disabled className="whitespace-nowrap">
                    選択してください
                  </option>
                  {workTypes.map((wt) => (
                    <option key={wt.id} value={wt.fields.name} className="whitespace-nowrap">
                      {wt.fields.name}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500">▾</span>
              </div>
            </div>
          </form>
          <div className="w-[90vw] max-w-[560px] mx-auto px-4">
            <button
              onClick={() => (document.getElementById('check-in-form') as HTMLFormElement)?.requestSubmit()}
              disabled={!selectedWork || isLoading}
              className="work-btn w-full min-h-12 text-lg disabled:bg-gray-400"
            >
              出 勤
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="card w-[90vw] max-w-[560px] mx-auto text-center">
            <p className="text-black">
              <span className="font-semibold">現在の作業:</span>{' '}
              <span className="whitespace-nowrap">{lastWorkDescription || 'N/A'}</span>
            </p>
          </div>
          <div className="w-[90vw] max-w-[560px] mx-auto px-4">
            <button
              onClick={handleCheckOut}
              disabled={isLoading}
              type="button"
              className="work-btn w-full min-h-12 text-lg disabled:bg-gray-400"
            >
              退 勤
            </button>
          </div>
        </>
      )}
      <div className="w-[90vw] max-w-[560px] mx-auto">
        <LogoutButton />
      </div>
    </div>
  );
}
