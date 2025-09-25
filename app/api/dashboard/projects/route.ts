import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  getDashboardProjects,
  GetDashboardProjectsParams,
} from '@/lib/airtable/projects';

export const runtime = 'nodejs';

function errorResponse(code: string, status: number) {
  return NextResponse.json({ error: code, code }, { status });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return errorResponse('UNAUTHORIZED', 401);
  }

  try {
    const { searchParams } = new URL(req.url);
    const parseNumber = (value: string | null) => {
      if (!value) {
        return undefined;
      }
      const parsed = Number.parseInt(value, 10);
      return Number.isNaN(parsed) ? undefined : parsed;
    };
    const sortRaw = searchParams.get('sort');
    const sort: GetDashboardProjectsParams['sort'] =
      sortRaw === 'progress' || sortRaw === 'startDate' || sortRaw === 'endDate'
        ? sortRaw
        : undefined;
    const orderRaw = searchParams.get('order');
    const order: GetDashboardProjectsParams['order'] =
      orderRaw === 'asc' || orderRaw === 'desc' ? orderRaw : undefined;
    const statusRaw = searchParams.get('status');
    const status: GetDashboardProjectsParams['status'] =
      statusRaw === '準備中' || statusRaw === '進行中' || statusRaw === '保留' || statusRaw === '完了'
        ? statusRaw
        : undefined;
    const params: GetDashboardProjectsParams = {
      search: searchParams.get('search') ?? undefined,
      status,
      sort,
      order,
      page: parseNumber(searchParams.get('page')),
      pageSize: parseNumber(searchParams.get('pageSize')),
    };

    const data = await getDashboardProjects(params);
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('[dashboard/projects] failed to fetch', error);
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
