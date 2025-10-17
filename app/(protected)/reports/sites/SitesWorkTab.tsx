"use client";
import { useEffect, useMemo, useState } from "react";

type SiteMaster = {
  id: string;
  fields: {
    name?: string;
    client?: string; // 元請・代理人
    active?: boolean;
  };
};

type Session = {
  year?: number;
  month?: number;
  day?: number;
  username?: string; // 従業員名
  sitename?: string; // 現場名
  workdescription?: string; // 業務内容
  machineId?: string | number | null;
  machineName?: string | null;
  // フォールバック用（API差異対策）
  clockInAt?: string;
};

type MonthRes = {
  year: number;
  month: number;
  days: { date: string; sessions: Session[] }[];
};

function ymdFromSession(s: Session) {
  if (s.year && s.month && s.day) return { y: s.year, m: s.month, d: s.day };
  // fallbacks from clockInAt if provided
  if (s.clockInAt) {
    const dt = new Date(s.clockInAt);
    if (!isNaN(dt.getTime())) {
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
  const [monthData, setMonthData] = useState<MonthRes | null>(null);
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
    let abort = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // 現場マスタ（client=元請・代理人）
        const m = await fetch("/api/masters/sites", { cache: "no-store" });
        const mJson: SiteMaster[] = await m.json();
        if (!abort) setSites(Array.isArray(mJson) ? mJson : []);

        // カレンダー（月次）— 既存と同様の取得方法
        const q = new URLSearchParams({ year: String(year), month: String(month) });
        const r = await fetch(`/api/calendar/month?${q.toString()}`, { cache: "no-store" });
        if (!r.ok) throw new Error(`calendar/month failed: ${r.status}`);
        const json: MonthRes = await r.json();
        if (!abort) setMonthData(json);
      } catch (e: unknown) {
        if (!abort) {
          const message = e instanceof Error ? e.message : "fetch failed";
          setError(message);
        }
      } finally {
        if (!abort) setLoading(false);
      }
    })();
    return () => {
      abort = true;
    };
  }, [year, month]);

  // 月次 → セッション行へフラット化
  const allRows = useMemo(() => {
    if (!monthData?.days) return [];
    const rows: (Session & { _date: string })[] = [];
    for (const d of monthData.days) {
      for (const s of d.sessions || []) {
        rows.push({ ...s, _date: d.date });
      }
    }
    return rows;
  }, [monthData]);

  // セレクタ候補
  const siteNames = useMemo(
    () =>
      Array.from(new Set((sites || []).map((s) => s.fields?.name).filter(Boolean))) as string[],
    [sites]
  );
  const clients = useMemo(
    () =>
      Array.from(new Set((sites || []).map((s) => s.fields?.client).filter(Boolean))) as string[],
    [sites]
  );
  const works = useMemo(
    () =>
      Array.from(new Set(allRows.map((r) => r.workdescription).filter(Boolean))) as string[],
    [allRows]
  );
  const employees = useMemo(
    () =>
      Array.from(new Set(allRows.map((r) => r.username).filter(Boolean))) as string[],
    [allRows]
  );
  const machines = useMemo(
    () =>
      Array.from(
        new Set(
          allRows.map((r) => r.machineName || String(r.machineId || "")).filter((v) => !!v && v !== "undefined")
        )
      ) as string[],
    [allRows]
  );

  // 1次フィルタ適用
  const primaryFiltered = useMemo(() => {
    if (!fSite || !fWork || !fClient) return [];
    const siteOk = (row: Session) => row.sitename === fSite;
    const workOk = (row: Session) => (row.workdescription || "") === fWork;
    const clientOk = (row: Session) => {
      const site = sites.find((s) => s.fields?.name === row.sitename);
      return (site?.fields?.client || "") === fClient;
    };
    return allRows.filter((r) => siteOk(r) && workOk(r) && clientOk(r));
  }, [allRows, fSite, fWork, fClient, sites]);

  // 2次フィルタ適用
  const finalRows = useMemo(() => {
    return primaryFiltered.filter((r) => {
      const { y, m, d } = ymdFromSession(r);
      if (fYear && String(y) !== fYear) return false;
      if (fMonth && String(m) !== fMonth) return false;
      if (fDay && String(d) !== fDay) return false;
      if (fEmployee && r.username !== fEmployee) return false;
      if (fMachine) {
        const mv = r.machineName || String(r.machineId || "");
        if (mv !== fMachine) return false;
      }
      return true;
    });
  }, [primaryFiltered, fYear, fMonth, fDay, fEmployee, fMachine]);

  // 業務内容ごとに区切って表示
  const groupedByWork = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const r of finalRows) {
      const key = r.workdescription || "(未設定)";
      const arr = map.get(key) || [];
      arr.push(r);
      map.set(key, arr);
    }
    // 並び：年→月→日→従業員名
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const A = ymdFromSession(a);
        const B = ymdFromSession(b);
        return (
          (A.y ?? 0) - (B.y ?? 0) ||
          (A.m ?? 0) - (B.m ?? 0) ||
          (A.d ?? 0) - (B.d ?? 0) ||
          (a.username || "").localeCompare(b.username || "")
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
            {Array.from(new Set(finalRows.map((r) => String(ymdFromSession(r).y)).filter(Boolean))).map((y) => (
              <option key={y} value={y}>
                {y}
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
            {Array.from(new Set(finalRows.map((r) => String(ymdFromSession(r).m)).filter(Boolean))).map((m) => (
              <option key={m} value={m}>
                {m}
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
            {Array.from(new Set(finalRows.map((r) => String(ymdFromSession(r).d)).filter(Boolean))).map((d) => (
              <option key={d} value={d}>
                {d}
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
                          <td className="px-3 py-2">{r.username || ""}</td>
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

