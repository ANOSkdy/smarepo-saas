'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SiteFields, WorkTypeFields } from '@/types';
import { Record } from 'airtable';
import LogoutButton from './LogoutButton';
import A11yButton from './A11yButton';
import { extractGeometry, findNearestSite, pointInGeometry } from '@/lib/geo';
import {
  LocationError,
  describeLocationError,
  normalizeToLocationError,
} from '@/lib/location-error';
import { useMidnightJSTRefetch } from '@/hooks/useMidnightJSTRefetch';

type StampCardProps = {
  initialStampType: 'IN' | 'OUT';
  initialWorkDescription: string;
  userName: string;
  machineName: string; 
};

// 完了・エラー・待機時の汎用表示コンポーネント
const CardState = ({ title, message, role = 'status' }: { title?: string; message: string; role?: 'status' | 'alert' }) => {
  const liveMode = role === 'alert' ? 'assertive' : 'polite';
  return (
    <div className="flex min-h-[calc(100svh-72px)] w-full items-center justify-center p-4" role={role} aria-live={liveMode}>
      <div className="card text-center">
        {title ? <h2 className="text-xl font-bold text-brand-text">{title}</h2> : null}
        <p className="mt-4 text-base text-brand-muted">{message}</p>
      </div>
    </div>
  );
};

type StoredPosition = {
  lat: number;
  lon: number;
  accuracy: number | null;
  timestamp: number;
};

type Fix = {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
  };
  timestamp: number;
  source: 'live' | 'cache';
};

const ACCEPT_ACCURACY = 100;
const SOFT_MAX_WAIT = 2000;
const HARD_MAX_WAIT = 8000;
const VERY_BAD_ACC = 300;
const VERY_OLD_MS = 15000;
const GEO_TIMEOUT_MS = 10000;
const LAST_POSITION_STORAGE_KEY = 'smarepo:lastPosition';
const LAST_MACHINE_STORAGE_KEY = 'smarepo:lastMachineId';

const readStoredPosition = (): StoredPosition | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LAST_POSITION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPosition;
    if (
      typeof parsed?.lat === 'number' &&
      typeof parsed?.lon === 'number' &&
      typeof parsed?.timestamp === 'number'
    ) {
      return {
        lat: parsed.lat,
        lon: parsed.lon,
        accuracy: typeof parsed.accuracy === 'number' ? parsed.accuracy : null,
        timestamp: parsed.timestamp,
      };
    }
  } catch (error) {
    console.warn('[GeolocationStorage] failed to read', error);
  }
  return null;
};

const writeStoredPosition = (position: Fix) => {
  if (typeof window === 'undefined') return;
  try {
    const payload: StoredPosition = {
      lat: position.coords.latitude,
      lon: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: position.timestamp,
    };
    window.localStorage.setItem(LAST_POSITION_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('[GeolocationStorage] failed to write', error);
  }
};

const readLastMachineId = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(LAST_MACHINE_STORAGE_KEY);
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  } catch (error) {
    console.warn('[LastMachineStorage] failed to read', error);
    return null;
  }
};

const writeLastMachineId = (machineId: string | null) => {
  if (typeof window === 'undefined') return;
  try {
    if (machineId && machineId.trim().length > 0) {
      window.localStorage.setItem(LAST_MACHINE_STORAGE_KEY, machineId.trim());
    } else {
      window.localStorage.removeItem(LAST_MACHINE_STORAGE_KEY);
    }
  } catch (error) {
    console.warn('[LastMachineStorage] failed to write', error);
  }
};

const fromStoredPosition = (stored: StoredPosition): Fix => ({
  coords: {
    latitude: stored.lat,
    longitude: stored.lon,
    accuracy: stored.accuracy,
  },
  timestamp: stored.timestamp,
  source: 'cache',
});

const normalizeGeolocationPosition = (position: GeolocationPosition): Fix => {
  const normalized: Fix = {
    coords: {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: typeof position.coords.accuracy === 'number' ? position.coords.accuracy : null,
    },
    timestamp: position.timestamp,
    source: 'live',
  };
  writeStoredPosition(normalized);
  return normalized;
};

const ensureGeolocationAvailable = (): void => {
  if (typeof window === 'undefined') {
    throw new LocationError('unsupported');
  }
  if (!('geolocation' in navigator)) {
    throw new LocationError('unsupported');
  }
  if (!window.isSecureContext) {
    throw new LocationError('insecure');
  }
};

function getOnce(timeoutMs: number): Promise<Fix> {
  try {
    ensureGeolocationAvailable();
  } catch (error) {
    return Promise.reject(error);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new LocationError('timeout'));
    }, timeoutMs);

    const finish = (handler: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      handler();
    };

    navigator.geolocation.getCurrentPosition(
      (pos) =>
        finish(() => {
          resolve(normalizeGeolocationPosition(pos));
        }),
      (error) =>
        finish(() => {
          reject(normalizeToLocationError(error));
        }),
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: timeoutMs,
      },
    );
  });
}

function bestByAccuracy(list: Fix[]): Fix {
  return [...list].sort(
    (a, b) =>
      (a.coords.accuracy ?? Number.POSITIVE_INFINITY) - (b.coords.accuracy ?? Number.POSITIVE_INFINITY),
  )[0];
}

function watchForBetter(opts: { limitMs: number; earlyStop: (p: Fix) => boolean }): Promise<Fix | null> {
  if (typeof window === 'undefined' || !('geolocation' in navigator)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const samples: Fix[] = [];
    let settled = false;
    let watchId = 0;
    const finish = (result: Fix | null) => {
      if (settled) return;
      settled = true;
      navigator.geolocation.clearWatch(watchId);
      window.clearTimeout(timeoutId);
      resolve(result);
    };
    watchId = navigator.geolocation.watchPosition(
      (p) => {
        const normalized = normalizeGeolocationPosition(p);
        samples.push(normalized);
        if (opts.earlyStop(normalized)) {
          finish(samples.length ? bestByAccuracy(samples) : normalized);
        }
      },
      () => {
        /* ignore errors */
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: opts.limitMs },
    );
    const timeoutId = window.setTimeout(() => {
      finish(samples.length ? bestByAccuracy(samples) : null);
    }, opts.limitMs);
  });
}

async function getBestPositionAdaptive(
  isInsidePolygon: (lat: number, lon: number) => boolean,
): Promise<Fix> {
  const stored = readStoredPosition();
  try {
    const first = await getOnce(GEO_TIMEOUT_MS);
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
  } catch (error) {
    if (stored) {
      return fromStoredPosition(stored);
    }
    throw normalizeToLocationError(error);
  }
}

export default function StampCard({
  initialStampType,
  initialWorkDescription,
  userName,
  machineName,
}: StampCardProps) {
  const router = useRouter();
  useMidnightJSTRefetch(() => {
    try {
      router.refresh();
    } catch (error) {
      console.warn('[StampCard] router.refresh failed', error);
    }
  });
  const [stampType, setStampType] = useState<'IN' | 'OUT' | 'COMPLETED'>(initialStampType);
  const [workTypes, setWorkTypes] = useState<Record<WorkTypeFields>[]>([]);
  const [sites, setSites] = useState<Record<SiteFields>[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [lastWorkDescription, setLastWorkDescription] = useState(initialWorkDescription);
  const [selectedWork, setSelectedWork] = useState('');
  const [locationError, setLocationError] = useState<LocationError | null>(null);
  const [pendingStamp, setPendingStamp] = useState<{ type: 'IN' | 'OUT'; workDescription: string } | null>(null);
  const hasPromptedSwitchRef = useRef(false);

  const searchParams = useSearchParams();
  const machineId = searchParams.get('machineId') ?? searchParams.get('machineid');

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

  const handleStamp = useCallback(
    async (
      type: 'IN' | 'OUT',
      workDescription: string,
      options?: { machineIdOverride?: string | null; nextStampState?: 'IN' | 'OUT' | 'COMPLETED' },
    ): Promise<boolean> => {
      const effectiveMachineId = (options?.machineIdOverride ?? machineId)?.trim();
      if (!effectiveMachineId) {
        setError('機械IDを特定できませんでした。');
        return false;
      }

      setIsLoading(true);
      setError('');
      setWarning('');
      setLocationError(null);
      setPendingStamp({ type, workDescription });

      let succeeded = false;

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
        const warnings: string[] = [];
        if (ageMs > 10_000) {
          warnings.push('位置情報が古い可能性があります（>10秒）');
        }
        if (position.source === 'cache') {
          warnings.push('最新の位置情報を取得できなかったため、最後に保存した位置情報を使用しました。');
        }
        const decidedSite = findNearestSite(latitude, longitude, sites);

        try {
          const response = await fetch('/api/stamp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              machineId: effectiveMachineId,
              workDescription,
              lat: latitude,
              lon: longitude,
              accuracy: typeof accuracy === 'number' ? accuracy : null,
              type,
              positionTimestamp,
              clientDecision: 'auto',
              siteId: decidedSite?.fields.siteId,
            }),
          });
          const data = await response.json();
          const combinedWarnings: string[] = warnings.slice();
          if (typeof data.accuracy === 'number' && data.accuracy > 100) {
            combinedWarnings.push('位置精度が低い可能性があります（>100m）');
          }
          if (
            typeof data.nearest_distance_m === 'number' &&
            data.nearest_distance_m > 1000
          ) {
            combinedWarnings.push('録拠点から離れている可能性があります（>1km）');
          }
          setWarning(combinedWarnings.join(' / '));
          if (!response.ok) {
            throw new Error(data.message || `サーバーエラー: ${response.statusText}`);
          }
          if (type === 'IN') {
            setStampType('OUT');
            setLastWorkDescription(workDescription);
            writeLastMachineId(effectiveMachineId);
          } else {
            const nextState = options?.nextStampState ?? 'COMPLETED';
            setStampType(nextState);
            if (nextState === 'IN') {
              setLastWorkDescription('');
              setSelectedWork('');
            }
            writeLastMachineId(null);
          }
          succeeded = true;
        } catch (err) {
          const message = err instanceof Error ? err.message : '通信に失敗しました。';
          setError(message);
        } finally {
          setPendingStamp(null);
        }
      } catch (geoError) {
        const normalized = normalizeToLocationError(geoError);
        console.error('[GeolocationError]', geoError);
        setLocationError(normalized);
      } finally {
        setIsLoading(false);
      }

      return succeeded;
    },
    [machineId, sites],
  );

  const handleRetryLocation = () => {
    if (!pendingStamp) {
      setLocationError(null);
      return;
    }
    setLocationError(null);
    void handleStamp(pendingStamp.type, pendingStamp.workDescription);
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (hasPromptedSwitchRef.current) return;
    if (initialStampType !== 'OUT') return;
    if (stampType !== 'OUT') return;

    const previousMachineId = readLastMachineId();
    const currentMachineId = machineId?.trim() ?? null;
    if (!previousMachineId || !currentMachineId) return;
    if (previousMachineId === currentMachineId) return;

    hasPromptedSwitchRef.current = true;

    if (!lastWorkDescription) {
      alert('前回の作業内容が見つかりません。');
      return;
    }

    const confirmed = window.confirm('別の機械で出勤中です。退勤して新しい機械に切り替えますか？');
    if (!confirmed) {
      return;
    }

    void (async () => {
      const success = await handleStamp('OUT', lastWorkDescription, {
        machineIdOverride: previousMachineId,
        nextStampState: 'IN',
      });
      if (success) {
        setWarning('');
        setError('');
        setLocationError(null);
        router.replace(`/nfc?machineId=${encodeURIComponent(currentMachineId)}`);
      }
    })();
  }, [handleStamp, initialStampType, lastWorkDescription, machineId, router, stampType]);

  if (isLoading) {
    return <CardState title="処理中" message="サーバーと通信しています。" role="status" />;
  }
  if (locationError)
    return (
      <div
        className="flex min-h-[calc(100svh-72px)] w-full items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-error-title"
        aria-describedby="location-error-description"
      >
        <div className="card w-full space-y-4 text-center">
          <h2 id="location-error-title" className="text-lg font-semibold text-brand-text">
            位置情報の取得に失敗しました
          </h2>
          <p
            id="location-error-description"
            role="status"
            aria-live="assertive"
            className="text-sm text-brand-muted"
          >
            {describeLocationError(locationError.reason)}。許可設定または電波状況をご確認のうえ、再試行してください。
          </p>
          <A11yButton type="button" onClick={handleRetryLocation} className="w-full justify-center text-base">
            位置情報の取得を再試行
          </A11yButton>
        </div>
      </div>
    );
  if (error) {
    return <CardState title="エラーが発生しました" message={error} role="alert" />;
  }
  if (!machineId) {
    return <CardState title="無効なアクセス" message="NFCタグから機械IDを読み取れませんでした。" role="alert" />;
  }
  if (stampType === 'COMPLETED') {
    return <CardState message="本日の業務お疲れ様でした。" role="status" />;
  }

  return (
    <section
      className="flex min-h-[calc(100svh-72px)] w-full flex-col items-center gap-6 p-4 pb-[calc(env(safe-area-inset-bottom)+12px)]"
      aria-live="polite"
    >
      {warning ? (
        <div
          role="status"
          className="w-full rounded-lg border border-brand-border bg-brand-primary/10 px-4 py-2 text-sm text-brand-text"
        >
          {warning}
        </div>
      ) : null}
      <div className="card w-full text-center" role="status">
        <div className="space-y-2">
          <p className="text-lg font-semibold text-brand-text">{userName} さん</p>
          <p className="text-brand-muted">
            <span className="font-semibold">機械:</span> {machineName}
          </p>
        </div>
      </div>
      {stampType === 'IN' ? (
        <form id="check-in-form" onSubmit={handleCheckIn} className="w-full space-y-4">
          <div className="card w-full">
            <label htmlFor="workDescription" className="mb-2 block text-sm font-semibold text-brand-text">
              本日の作業内容を選択
            </label>
            <div className="relative w-full">
              <select
                id="workDescription"
                name="workDescription"
                required
                value={selectedWork}
                onChange={(event) => setSelectedWork(event.target.value)}
                aria-describedby="work-description-hint"
                className="w-full appearance-none rounded-xl border border-brand-border bg-brand-surface-alt px-4 py-3 pr-10 text-base leading-tight text-brand-text shadow-sm"
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
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted">▾</span>
            </div>
            <p id="work-description-hint" className="mt-2 text-sm text-brand-muted">
              作業内容を選択後、出勤ボタンで記録します。
            </p>
          </div>
          <A11yButton
            type="submit"
            disabled={!selectedWork || isLoading}
            aria-busy={isLoading}
            className="w-full justify-center text-lg font-bold"
          >
            出勤
          </A11yButton>
        </form>
      ) : (
        <div className="w-full space-y-4">
          <div className="card w-full text-center">
            <p className="text-brand-text">
              <span className="font-semibold">現在の作業:</span>{' '}
              <span className="whitespace-nowrap">{lastWorkDescription || '登録なし'}</span>
            </p>
          </div>
          <A11yButton onClick={handleCheckOut} disabled={isLoading} aria-busy={isLoading} className="w-full justify-center text-lg font-bold">
            退勤
          </A11yButton>
        </div>
      )}
      <div className="w-full">
        <LogoutButton />
      </div>
    </section>
  );
}
