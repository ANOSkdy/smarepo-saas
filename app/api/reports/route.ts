import { NextResponse } from 'next/server';

import { getReportRowsByUserName } from '@/lib/services/reports';

const SORT_KEYS = ['year', 'month', 'day', 'siteName'] as const;
type SortKey = (typeof SORT_KEYS)[number];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userName = searchParams.get('userName')?.trim();
  const sortParam = (searchParams.get('sort') ?? '').trim();
  const orderParam = (searchParams.get('order') ?? 'asc').trim().toLowerCase();

  if (!userName) {
    return NextResponse.json(
      { ok: false, error: 'userName is required', rows: [] },
      { status: 400 }
    );
  }

  try {
    const sort = SORT_KEYS.includes(sortParam as SortKey)
      ? (sortParam as SortKey)
      : undefined;
    const order: 'asc' | 'desc' = orderParam === 'desc' ? 'desc' : 'asc';

    const rows = await getReportRowsByUserName(userName, sort, order);
    return NextResponse.json({ ok: true, rows });
  } catch (error) {
    console.error('GET /api/reports failed', error);
    return NextResponse.json(
      { ok: false, error: 'Internal Server Error', rows: [] },
      { status: 500 }
    );
  }
}
