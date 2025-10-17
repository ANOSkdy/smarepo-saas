"use client";
import { useEffect, useMemo, useState } from "react";

// --- Normalize any Airtable/lookup/array/object value to string ---
const asText = (value: unknown): string => {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value
      .map((item) => asText(item))
      .filter(Boolean)
      .join(",");
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const candidate = record.name ?? record.label ?? record.text;
    return candidate ? String(candidate) : "";
  }
  return String(value);
};

type SiteMaster = {
  id: string;
  fields?: {
    name?: unknown;
    client?: unknown; // 元請・代理人
    active?: boolean;
  };
  name?: unknown;
  client?: unknown;
  clientName?: unknown;
};

type Session = {
  year?: number;
  month?: number;
  day?: number;
  date?: string;
  username?: unknown; // 従業員名（旧API互換）
  userName?: unknown; // 従業員名（calendar/day API）
  sitename?: unknown; // 現場名（旧API互換）
  siteName?: unknown; // 現場名（calendar/day API）
  workdescription?: unknown; // 業務内容（旧API互換）
  workDescription?: unknown; // 業務内容（calendar/day API）
  work?: unknown;
  workName?: unknown;
  machineId?: unknown;
  machineName?: unknown;
  startMs?: number;
  endMs?: number;
  // フォールバック用（API差異対策）
  clockInAt?: string;
  clockOutAt?: string;
};

type DaySessionsResponse = {
  date?: string;
  sessions?: Session[];
};

type MonthRes = {
  year: number;
  month: number;
  days: { date: string; sessions: unknown }[];
};

function ymdFromSession(session: Session) {
  if (Number.isFinite(session.year) && Number.isFinite(session.month) && Number.isFinite(session.day)) {
    return {
      y: session.year as number,
      m: session.month as number,
      d: session.day as number,
    };
  }

  const dateText = typeof session.date === "string" ? session.date.trim() : "";
  if (dateText) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
    if (match) {
      return {
        y: Number.parseInt(match[1], 10),
        m: Number.parseInt(match[2], 10),
        d: Number.parseInt(match[3], 10),
      };
    }
    const parsed = new Date(dateText);
    if (!Number.isNaN(parsed.getTime())) {
      return {
        y: parsed.getFullYear(),
        m: parsed.getMonth() + 1,
        d: parsed.getDate(),
      };
    }
  }

  if (typeof session.startMs === "number" && Number.isFinite(session.startMs)) {
    const dt = new Date(session.startMs);
    return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
  }

  if (session.clockInAt) {
    const dt = new Date(session.clockInAt);
    if (!Number.isNaN(dt.getTime())) {
      return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
    }
  }

  return { y: undefined as number | undefined, m: undefined as number | undefined, d: undefined as number | undefined };
}

export default function SitesWorkTab() {
  const today = new Date();
  const [year, setYear] = useState<number>(today.getFullYear());
  const [month, setMonth] = useState<number>(today.getMonth() + 1);

  // マスタ
  const [sites, setSites] = useState<SiteMaster[]>([]);

  // 月次データ（カレンダーと同様の取得方法）
  const [sessionRows, setSessionRows] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1次フィルタ（必須）：現場名・元請/代理人・業務内容
  const [fSite, setFSite] = useState<string>("");
  const [fClient, setFClient] = useState<string>("");
  const [fWork, setFWork] = useState<string>("");

  // 2次フィルタ（任意）：年・月・日・従業員・機械
  const [fYear, setFYear] = useState<string>("");
  const [fMonth, setFMonth] = useState<string>("");
  const [fDay, setFDay] = useState<string>("");
  const [fEmployee, setFEmployee] = useState<string>("");
  const [fMachine, setFMachine] = useState<string>("");

  useEffect(() => {
    let aborted = false;
    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      setError(null);
      setSessionRows([]);

      try {
        const params = new URLSearchParams({ year: String(year), month: String(month) });

        const [sitesRes, monthRes] = await Promise.all([
          fetch("/api/masters/sites", {
            cache: "no-store",
            credentials: "same-origin",
            signal: controller.signal,
          }),
          fetch(`/api/calendar/month?${params.toString()}`, {
            cache: "no-store",
            credentials: "same-origin",
            signal: controller.signal,
          }),
        ]);

        if (!sitesRes.ok) {
          throw new Error(`masters/sites failed: ${sitesRes.status}`);
        }
        if (!monthRes.ok) {
          throw new Error(`calendar/month failed: ${monthRes.status}`);
        }

        const sitesJson = (await sitesRes.json()) as SiteMaster[] | null;
        const monthJson = (await monthRes.json()) as MonthRes | null;

        if (!aborted) {
          setSites(Array.isArray(sitesJson) ? sitesJson : []);
        }

        const days = Array.isArray(monthJson?.days) ? monthJson?.days : [];
        if (days.length === 0) {
          if (!aborted) {
            setSessionRows([]);
          }
          return;
        }

        const aggregated: Session[] = [];
        for (const day of days) {
          if (aborted) {
            return;
          }
          if (!day?.date) {
            continue;
          }
          try {
            const dayRes = await fetch(`/api/calendar/day?date=${encodeURIComponent(day.date)}`, {
              cache: "no-store",
              credentials: "same-origin",
              signal: controller.signal,
            });
            if (!dayRes.ok) {
              throw new Error(`calendar/day failed: ${dayRes.status}`);
            }
            const dayJson = (await dayRes.json()) as DaySessionsResponse | null;
            if (aborted) {
              return;
            }
            const sessions = Array.isArray(dayJson?.sessions) ? dayJson?.sessions : [];
            for (const session of sessions) {
              aggregated.push({ ...session, date: day.date });
            }
          } catch (dayError) {
            if (controller.signal.aborted) {
              return;
            }
            if (aborted) {
              return;
            }
            console.error("[reports][sites] failed to fetch day sessions", dayError);
            setError((prev) => prev ?? "日次データの取得に失敗しました。");
          }
        }

        if (!aborted) {
          setSessionRows(aggregated);
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        const message = error instanceof Error ? error.message : "fetch failed";
        if (!aborted) {
          setSites([]);
          setSessionRows([]);
          setError(message);
        }
      } finally {
        if (!aborted) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      aborted = true;
      controller.abort();
    };
  }, [month, year]);

  // 月次 → セッション行へフラット化
  const allRows = useMemo(() => sessionRows, [sessionRows]);

  // セレクタ候補
  const siteNames = useMemo(() => {
    const vals = (sites || []).map((site) => asText(site.fields?.name ?? site.name));
    return Array.from(new Set(vals.filter(Boolean)));
  }, [sites]);
  const clients = useMemo(() => {
    const vals = (sites || []).map((site) => asText(site.fields?.client ?? site.client ?? site.clientName));
    return Array.from(new Set(vals.filter(Boolean)));
  }, [sites]);
  const works = useMemo(() => {
    const vals = allRows.map((row) =>
      asText(row.workdescription ?? row.workDescription ?? row.work ?? row.workName),
    );
    return Array.from(new Set(vals.filter(Boolean)));
  }, [allRows]);

  // 1次フィルタ適用
  const primaryFiltered = useMemo(() => {
    if (!fSite || !fWork || !fClient) return [];
    const siteOk = (row: Session) => asText(row.sitename ?? row.siteName) === fSite;
    const workOk = (row: Session) =>
      asText(row.workdescription ?? row.workDescription ?? row.work ?? row.workName) === fWork;
    const clientOk = (row: Session) => {
      const site = sites.find((s) => asText(s.fields?.name ?? s.name) === asText(row.sitename ?? row.siteName));
      return asText(site?.fields?.client ?? site?.client ?? site?.clientName) === fClient;
    };
    return allRows.filter((r) => siteOk(r) && workOk(r) && clientOk(r));
  }, [allRows, fSite, fWork, fClient, sites]);

  // secondary filters' candidates must be built AFTER primary filter (per requirements)
  const employees = useMemo(() => {
    const vals = primaryFiltered.map((r) => asText(r.username ?? r.userName));
    return Array.from(new Set(vals.filter(Boolean)));
  }, [primaryFiltered]);
  const machines = useMemo(() => {
    const vals = primaryFiltered.map((r) => asText(r.machineName ?? r.machineId));
    return Array.from(new Set(vals.filter((v) => !!v && v !== "undefined" && v !== "null")));
  }, [primaryFiltered]);

  // 2次フィルタ適用
  const finalRows = useMemo(() => {
    return primaryFiltered.filter((r) => {
      const { y, m, d } = ymdFromSession(r);
      if (fYear && String(y) !== fYear) return false;
      if (fMonth && String(m) !== fMonth) return false;
      if (fDay && String(d) !== fDay) return false;
      if (fEmployee && asText(r.username ?? r.userName) !== fEmployee) return false;
      if (fMachine) {
        const mv = asText(r.machineName ?? r.machineId);
        if (mv !== fMachine) return false;
      }
      return true;
    });
  }, [primaryFiltered, fYear, fMonth, fDay, fEmployee, fMachine]);

  // 業務内容ごとに区切って表示
  const groupedByWork = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const row of finalRows) {
      const key =
        asText(row.workdescription ?? row.workDescription ?? row.work ?? row.workName) || "(未設定)";
      const arr = map.get(key) || [];
      arr.push(row);
      map.set(key, arr);
    }
    // 並び：年→月→日→従業員名
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const A = ymdFromSession(a);
        const B = ymdFromSession(b);
        const nameA = asText(a.username ?? a.userName);
        const nameB = asText(b.username ?? b.userName);
        return (
          (A.y ?? 0) - (B.y ?? 0) ||
          (A.m ?? 0) - (B.m ?? 0) ||
          (A.d ?? 0) - (B.d ?? 0) ||
          nameA.localeCompare(nameB)
        );
      });
    }
    return Array.from(map.entries());
  }, [finalRows]);

  return (
    <div className="space-y-4">
      {/* 年月選択（取得対象の基準） */}
      <div className="flex gap-2 items-end">
        <div>
          <label htmlFor="calendar-year" className="block text-sm text-gray-600">
            年
          </label>
          <input
            type="number"
            className="border rounded px-2 py-1 w-28"
            value={year}
            id="calendar-year"
            onChange={(e) => setYear(Number(e.target.value || today.getFullYear()))}
          />
        </div>
        <div>
          <label htmlFor="calendar-month" className="block text-sm text-gray-600">
            月
          </label>
          <input
            type="number"
            className="border rounded px-2 py-1 w-20"
            min={1}
            max={12}
            value={month}
            id="calendar-month"
            onChange={(e) => setMonth(Number(e.target.value || today.getMonth() + 1))}
          />
        </div>
        {loading && <span className="text-sm text-gray-500">更新中...</span>}
        {error && <span className="text-sm text-red-600">Error: {error}</span>}
      </div>

      {/* 1次フィルタ：必須 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label htmlFor="filter-site" className="block text-sm text-gray-600">
            現場名
          </label>
          <select
            id="filter-site"
            className="border rounded px-2 py-1 w-full"
            value={fSite}
            onChange={(e) => setFSite(e.target.value)}
          >
            <option value="">（選択）</option>
            {siteNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filter-client" className="block text-sm text-gray-600">
            元請・代理人
          </label>
          <select
            id="filter-client"
            className="border rounded px-2 py-1 w-full"
            value={fClient}
            onChange={(e) => setFClient(e.target.value)}
          >
            <option value="">（選択）</option>
            {clients.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filter-work" className="block text-sm text-gray-600">
            業務内容
          </label>
          <select
            id="filter-work"
            className="border rounded px-2 py-1 w-full"
            value={fWork}
            onChange={(e) => setFWork(e.target.value)}
          >
            <option value="">（選択）</option>
            {works.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 2次フィルタ：任意（1次が揃ってから活性化） */}
      <fieldset className={`grid grid-cols-1 md:grid-cols-5 gap-3 ${!fSite || !fClient || !fWork ? "opacity-40 pointer-events-none" : ""}`}>
        <div>
          <label htmlFor="filter-year" className="block text-sm text-gray-600">
            年
          </label>
          <select
            id="filter-year"
            className="border rounded px-2 py-1 w-full"
            value={fYear}
            onChange={(e) => setFYear(e.target.value)}
          >
            <option value="">（すべて）</option>
            {Array.from(
              new Set(
                finalRows
                  .map((r) => ymdFromSession(r).y)
                  .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
              )
            ).map((y) => (
              <option key={y} value={String(y)}>
                {String(y)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filter-month" className="block text-sm text-gray-600">
            月
          </label>
          <select
            id="filter-month"
            className="border rounded px-2 py-1 w-full"
            value={fMonth}
            onChange={(e) => setFMonth(e.target.value)}
          >
            <option value="">（すべて）</option>
            {Array.from(
              new Set(
                finalRows
                  .map((r) => ymdFromSession(r).m)
                  .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
              )
            ).map((m) => (
              <option key={m} value={String(m)}>
                {String(m)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filter-day" className="block text-sm text-gray-600">
            日
          </label>
          <select
            id="filter-day"
            className="border rounded px-2 py-1 w-full"
            value={fDay}
            onChange={(e) => setFDay(e.target.value)}
          >
            <option value="">（すべて）</option>
            {Array.from(
              new Set(
                finalRows
                  .map((r) => ymdFromSession(r).d)
                  .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
              )
            ).map((d) => (
              <option key={d} value={String(d)}>
                {String(d)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filter-employee" className="block text-sm text-gray-600">
            従業員
          </label>
          <select
            id="filter-employee"
            className="border rounded px-2 py-1 w-full"
            value={fEmployee}
            onChange={(e) => setFEmployee(e.target.value)}
          >
            <option value="">（すべて）</option>
            {employees.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filter-machine" className="block text-sm text-gray-600">
            機械
          </label>
          <select
            id="filter-machine"
            className="border rounded px-2 py-1 w-full"
            value={fMachine}
            onChange={(e) => setFMachine(e.target.value)}
          >
            <option value="">（すべて）</option>
            {machines.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      {/* グリッド表示（業務内容ごとに区切る／列：年・月・日・従業員名） */}
      {(!fSite || !fClient || !fWork) && (
        <p className="text-sm text-gray-500">まず「現場名」「元請・代理人」「業務内容」を選択してください。</p>
      )}
      {fSite && fClient && fWork && (
        <div className="space-y-8">
          {groupedByWork.map(([work, rows]) => (
            <section key={work}>
              <h2 className="text-base font-semibold mb-2">{work}</h2>
              <div className="overflow-x-auto rounded border">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-3 py-2 text-left">年</th>
                      <th className="px-3 py-2 text-left">月</th>
                      <th className="px-3 py-2 text-left">日</th>
                      <th className="px-3 py-2 text-left">従業員名</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, idx) => {
                      const { y, m, d } = ymdFromSession(r);
                      return (
                        <tr key={idx} className="odd:bg-white even:bg-gray-50">
                          <td className="px-3 py-2">{y ?? ""}</td>
                          <td className="px-3 py-2">{m ?? ""}</td>
                          <td className="px-3 py-2">{d ?? ""}</td>
                          <td className="px-3 py-2">{asText(r.username ?? r.userName)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          {groupedByWork.length === 0 && (
            <p className="text-sm text-gray-500">該当データがありません。</p>
          )}
        </div>
      )}
    </div>
  );
}

